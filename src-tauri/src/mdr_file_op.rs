use anyhow::{Context, Result};
use chrono::Local;
use log::info;
use quick_xml::de::from_str;
use quick_xml::se::to_string;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, UNIX_EPOCH};
use tauri::{Emitter, Window};

use crate::mdr_file_cache::{
    invalidate_named, named_cache_dir, read_signature, signature_path, write_signature,
    MindrizzleFileCache,
};
use crate::mdr_file_struct::{MindrizzleFileBody, MindrizzleFileMeta, MindrizzleFileMetaView};
use crate::mdr_file_tar::{
    extract_meta, extract_to_cache_with_progress, is_mdrf_compressed, pack_cache,
};
use crate::{mdr_file_dir, tauri_cmd};

// 文件名校验规则须与前端 NewFileDialog 保持一致，集中为常量避免两处漂移
const MINDRIZZLE_FILE_FORBIDDEN_CHARS: [char; 9] = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
const MINDRIZZLE_FILE_RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];
const MINDRIZZLE_FILE_MAX_NAME_LEN: usize = 50;
const FILE_LOAD_PROGRESS_EVENT: &str = "file-load-progress";
const PROGRESS_VALIDATE: u32 = 2;
const PROGRESS_DETECT_FORMAT: u32 = 5;
const PROGRESS_CREATE_CACHE: u32 = 8;
const PROGRESS_EXTRACT_START: u32 = 12;
const PROGRESS_EXTRACT_RANGE: u32 = 58;
const PROGRESS_READ_BODY: u32 = 75;
const PROGRESS_PARSE_BODY: u32 = 85;
const PROGRESS_RETURN_BODY: u32 = 90;
const PROGRESS_COMPLETE: u32 = 100;
const DEBUG_PROGRESS_DELAY: Duration = Duration::from_millis(180);

// .mdrf 是整包重写，并发保存会让后写者覆盖前者的块数据，所以写入串行化
static FILE_WRITE_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn lock_file_write() -> MutexGuard<'static, ()> {
    FILE_WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

tauri_cmd! {
    pub fn get_mdr_file_meta(
        file_name: String,
        dir: Option<String>,
        file_path: Option<String>
    ) -> anyhow::Result<MindrizzleFileMetaView> {
        let location = resolve_note_archive(&file_name, dir.as_deref(), file_path.as_deref())
            .context("校验笔记文件位置")?;
        let path = location.archive;
        if !path.is_file() {
            return Err(anyhow::anyhow!("文件不存在或者是个目录"));
        }
        let compressed = is_mdrf_compressed(&path).context("检测笔记压缩格式")?;
        let signature = archive_signature(&path)?;
        let data = read_note_meta_xml(&path, compressed, &signature)?;
        let xml = String::from_utf8(data).context("转换笔记元信息编码")?;
        let meta = deserialize_mdr_file_meta_xml(&xml).context("解码笔记元信息")?;
        let updated_at = read_file_modified_millis(&path)?;
        Ok(MindrizzleFileMetaView { meta, updated_at })
    }

    pub fn set_mdr_file_body(
        file_name: String,
        content: String,
        dir: Option<String>,
        file_path: Option<String>
    ) -> anyhow::Result<()> {
        let _guard = lock_file_write();
        let location = resolve_note_archive(&file_name, dir.as_deref(), file_path.as_deref())
            .context("校验笔记文件位置")?;
        require_archive_file(&location)?;
        let compressed = is_mdrf_compressed(&location.archive).context("检测笔记压缩格式")?;
        let (cache, _) = open_note_cache(&location.archive, compressed)?;
        let body_xml = serialize_mdr_file_body_xml(MindrizzleFileBody { content })
            .context("编码笔记正文")?;
        cache.write_file("body.json", body_xml.as_bytes()).context("写入笔记正文缓存")?;
        // body 已更新，所以重新打包同步到 .mdrf
        flush_note_cache(&location.archive, &cache, compressed).context("保存笔记文件")?;
        info!("保存笔记正文成功：{}", location.note_name);
        Ok(())
    }

    pub fn set_mdr_file_meta(
        file_name: String,
        mdr_file_info: MindrizzleFileMeta,
        dir: Option<String>,
        file_path: Option<String>
    ) -> anyhow::Result<()> {
        let _guard = lock_file_write();
        let location = resolve_note_archive(&file_name, dir.as_deref(), file_path.as_deref())
            .context("校验笔记文件位置")?;
        require_archive_file(&location)?;
        let compressed = is_mdrf_compressed(&location.archive).context("检测笔记压缩格式")?;
        let (cache, _) = open_note_cache(&location.archive, compressed)?;
        let meta_xml = serialize_mdr_file_meta_xml(mdr_file_info).context("编码笔记元信息")?;
        cache.write_file("meta.json", meta_xml.as_bytes()).context("写入笔记元信息缓存")?;
        flush_note_cache(&location.archive, &cache, compressed).context("保存笔记文件")?;
        info!("保存笔记元信息成功：{}", location.note_name);
        Ok(())
    }

    pub fn create_mdr_file(
        mdr_file_info: MindrizzleFileMeta,
        file_name: String,
        dir: Option<String>
    ) -> anyhow::Result<String> {
        let _guard = lock_file_write();
        let location = resolve_note_archive(&file_name, dir.as_deref(), None)
            .context("校验笔记文件位置")?;
        let cache = MindrizzleFileCache::new().context("创建笔记缓存")?;
        let meta_xml = serialize_mdr_file_meta_xml(mdr_file_info)
            .context("编码笔记元信息")?;
        let body_xml = serialize_mdr_file_body_xml(MindrizzleFileBody {
            content: String::new(),
        })
        .context("编码初始笔记正文")?;
        cache.write_file("meta.json", meta_xml.as_bytes()).context("写入笔记元信息缓存")?;
        cache.write_file("body.json", body_xml.as_bytes()).context("写入初始笔记正文缓存")?;

        let file_path = location.archive;
        // 前端已拦截同名，后端仍须防覆盖既有笔记
        if file_path.exists() {
            return Err(anyhow::anyhow!("同名文件已存在"));
        }
        pack_cache_atomic(&file_path, cache.path(), true).context("写入笔记文件")?;
        info!("创建笔记成功：{}", location.note_name);
        Ok(location.note_name)
    }

    pub fn move_mdrf_file(
        file_path: String,
        dir: Option<String>
    ) -> anyhow::Result<String> {
        let _guard = lock_file_write();
        let source = resolve_note_archive("", None, Some(file_path.as_str()))
            .context("校验外部笔记文件")?;
        let target_dir = resolve_target_workspace_dir(dir.as_deref())?;
        let target = target_dir.join(format!("{}.mdrf", source.note_name));
        if target.exists() {
            return Err(anyhow::anyhow!("目标工作区已有同名笔记"));
        }
        move_archive_file(&source.archive, &target)?;
        invalidate_named(&cache_key_of(&source.archive));
        info!("笔记移入工作区：{} -> {}", source.note_name, target.display());
        Ok(source.note_name)
    }

    pub fn move_mdr_file(
        file_name: String,
        dir: Option<String>,
        target_dir: Option<String>
    ) -> anyhow::Result<String> {
        let _guard = lock_file_write();
        let source = resolve_note_archive(&file_name, dir.as_deref(), None)
            .context("校验笔记文件位置")?;
        let target_dir = resolve_target_workspace_dir(target_dir.as_deref())?;
        let target = target_dir.join(format!("{}.mdrf", source.note_name));
        // 目标就是当前目录，按成功处理，前端不必区分空移动
        if target == source.archive {
            return Ok(source.note_name);
        }
        require_archive_file(&source)?;
        if target.exists() {
            return Err(anyhow::anyhow!("目标工作区已有同名笔记"));
        }
        move_archive_file(&source.archive, &target)?;
        invalidate_named(&cache_key_of(&source.archive));
        invalidate_named(&cache_key_of(&target));
        info!("笔记移动到工作区：{} -> {}", source.note_name, target.display());
        Ok(source.note_name)
    }

    pub fn delete_mdrf_file(
        file_name: String,
        dir: Option<String>,
        file_path: Option<String>
    ) -> anyhow::Result<()> {
        let _guard = lock_file_write();
        let location = resolve_note_archive(&file_name, dir.as_deref(), file_path.as_deref())
            .context("校验笔记文件位置")?;
        require_archive_file(&location)?;
        fs::remove_file(&location.archive)
            .with_context(|| format!("删除笔记文件：{}", location.note_name))?;
        // 解包暂存区按归档路径缓存，文件删除后不清掉会让同名新建读到旧内容
        invalidate_named(&cache_key_of(&location.archive));
        info!("删除笔记成功：{}", location.note_name);
        Ok(())
    }

    pub fn copy_mdrf_file(
        file_name: String,
        new_file_name: String,
        dir: Option<String>,
        file_path: Option<String>
    ) -> anyhow::Result<String> {
        let _guard = lock_file_write();
        let source = resolve_note_archive(&file_name, dir.as_deref(), file_path.as_deref())
            .context("校验笔记文件位置")?;
        require_archive_file(&source)?;
        let (target, note_name) = sibling_archive(&source, &new_file_name)?;
        if target.exists() {
            return Err(anyhow::anyhow!("同名文件已存在"));
        }
        fs::copy(&source.archive, &target).context("复制笔记文件")?;
        info!("复制笔记成功：{} -> {}", source.note_name, note_name);
        Ok(note_name)
    }

    pub fn rename_mdrf_file(
        file_name: String,
        new_file_name: String,
        mdr_file_info: Option<MindrizzleFileMeta>,
        dir: Option<String>,
        file_path: Option<String>
    ) -> anyhow::Result<String> {
        let _guard = lock_file_write();
        let source = resolve_note_archive(&file_name, dir.as_deref(), file_path.as_deref())
            .context("校验笔记文件位置")?;
        require_archive_file(&source)?;
        let (target, note_name) = sibling_archive(&source, &new_file_name)?;
        if target == source.archive {
            return Ok(note_name);
        }
        if target.exists() {
            return Err(anyhow::anyhow!("同名文件已存在"));
        }
        move_archive_file(&source.archive, &target)?;
        move_note_cache(&source.archive, &target)?;
        invalidate_named(&cache_key_of(&source.archive));
        // 标题要和文件名一起改时才由前端传入，避免纯改名也整包重写
        if let Some(meta) = mdr_file_info {
            rewrite_note_meta(&target, meta).context("同步笔记标题")?;
        }
        info!("重命名笔记成功：{} -> {}", source.note_name, note_name);
        Ok(note_name)
    }
}

#[tauri::command]
pub async fn get_mdr_file_body(
    window: Window,
    file_name: String,
    dir: Option<String>,
    file_path: Option<String>,
    debug_progress: Option<bool>,
) -> Result<MindrizzleFileBody, tauri::ipc::InvokeError> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        read_mdr_file_body(
            &window,
            &file_name,
            dir.as_deref(),
            file_path.as_deref(),
            debug_progress.unwrap_or(false),
        )
    })
    .await
    .map_err(|error| {
        log::error!(
            "IPC 命令 get_mdr_file_body 执行失败：读取任务异常：{}",
            error
        );
        tauri::ipc::InvokeError::from(format!("读取笔记任务异常：{error}"))
    })?;
    result.map_err(|error| {
        log::error!("IPC 命令 get_mdr_file_body 执行失败：{:#}", error);
        tauri::ipc::InvokeError::from(format!("{:#}", error))
    })
}

fn read_mdr_file_body(
    window: &Window,
    file_name: &str,
    dir: Option<&str>,
    file_path: Option<&str>,
    is_debug_progress: bool,
) -> anyhow::Result<MindrizzleFileBody> {
    // 组件数据写入会失效同名暂存区，读取期间必须挡住它，否则解包到一半目录被删
    let _guard = lock_file_write();
    emit_file_load_progress(window, PROGRESS_VALIDATE, is_debug_progress);
    let location = resolve_note_archive(file_name, dir, file_path).context("校验笔记文件位置")?;
    let path = location.archive;
    if !path.is_file() {
        return Err(anyhow::anyhow!("文件不存在或者是个目录"));
    }
    let compressed = detect_file_compression(window, &path, is_debug_progress)?;
    emit_file_load_progress(window, PROGRESS_CREATE_CACHE, is_debug_progress);
    // 缓存已与归档同步时整包解压可以整体跳过，否则大附件笔记每次打开都要重解一遍
    let (mut cache, _) = open_note_cache_with_progress(&path, compressed, |value| {
        let progress = PROGRESS_EXTRACT_START + value * PROGRESS_EXTRACT_RANGE / PROGRESS_COMPLETE;
        emit_file_load_progress(window, progress, is_debug_progress);
    })
    .context("准备笔记缓存")?;
    let body = read_cached_mdr_file_body(window, &mut cache, is_debug_progress)?;
    info!("读取笔记正文成功：{}", location.note_name);
    Ok(body)
}

fn detect_file_compression(
    window: &Window,
    path: &Path,
    is_debug_progress: bool,
) -> anyhow::Result<bool> {
    emit_file_load_progress(window, PROGRESS_DETECT_FORMAT, is_debug_progress);
    is_mdrf_compressed(path).context("检测笔记压缩格式")
}

fn read_cached_mdr_file_body(
    window: &Window,
    cache: &mut MindrizzleFileCache,
    is_debug_progress: bool,
) -> anyhow::Result<MindrizzleFileBody> {
    emit_file_load_progress(window, PROGRESS_READ_BODY, is_debug_progress);
    let body_bytes = cache.read_file("body.json").context("读取笔记正文")?;
    emit_file_load_progress(window, PROGRESS_PARSE_BODY, is_debug_progress);
    let body_xml = std::str::from_utf8(&body_bytes).context("转换笔记正文编码")?;
    let body = deserialize_mdr_file_body_xml(body_xml).context("解码笔记正文")?;
    emit_file_load_progress(window, PROGRESS_RETURN_BODY, is_debug_progress);
    Ok(body)
}

fn emit_file_load_progress(window: &Window, progress: u32, is_debug_progress: bool) {
    let _ = window.emit(FILE_LOAD_PROGRESS_EVENT, progress);
    if is_debug_progress {
        std::thread::sleep(DEBUG_PROGRESS_DELAY);
    }
}

/// 笔记的磁盘位置：默认工作区按文件名拼、自定义工作区按目录拼、外部文件直接用绝对路径
pub(crate) struct NoteArchiveLocation {
    pub archive: PathBuf,
    pub note_name: String,
}

// 缓存目录名不能带路径分隔符，统一用归档绝对路径做 key，避免不同工作区同名笔记互相覆盖
fn cache_key_of(archive: &Path) -> String {
    archive.to_string_lossy().into_owned()
}

pub(crate) fn resolve_note_archive(
    file_name: &str,
    dir: Option<&str>,
    file_path: Option<&str>,
) -> anyhow::Result<NoteArchiveLocation> {
    if let Some(raw_path) = file_path {
        return resolve_external_archive(raw_path);
    }
    let note_name = resolve_mdrf_file_name(file_name)?;
    let directory = match dir {
        Some(raw_dir) => resolve_workspace_dir(raw_dir)?,
        None => mdr_file_dir::get_mdr_file_save_dir(),
    };
    Ok(NoteArchiveLocation {
        archive: directory.join(format!("{note_name}.mdrf")),
        note_name,
    })
}

// 外部路径来自文件对话框，仍须挡掉相对路径、目录与非 .mdrf 文件，避免命令被当成任意文件读写
fn resolve_external_archive(raw_path: &str) -> anyhow::Result<NoteArchiveLocation> {
    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err(anyhow::anyhow!("外部文件必须使用绝对路径"));
    }
    let archive = fs::canonicalize(&path).context("打开外部笔记文件")?;
    if !archive.is_file() {
        return Err(anyhow::anyhow!("文件不存在或者是个目录"));
    }
    let has_mdrf_ext = archive
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("mdrf"));
    if !has_mdrf_ext {
        return Err(anyhow::anyhow!("只能打开 .mdrf 文件"));
    }
    let note_name = archive
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("未命名笔记")
        .to_string();
    Ok(NoteArchiveLocation { archive, note_name })
}

pub(crate) fn resolve_workspace_dir(raw_dir: &str) -> anyhow::Result<PathBuf> {
    let path = PathBuf::from(raw_dir);
    if !path.is_absolute() {
        return Err(anyhow::anyhow!("工作区目录必须使用绝对路径"));
    }
    let directory = fs::canonicalize(&path).context("打开工作区目录")?;
    if !directory.is_dir() {
        return Err(anyhow::anyhow!("工作区路径不是目录"));
    }
    Ok(directory)
}

/// IPC 入口的 file_name 会拼进磁盘路径，按前端同名规则校验，防路径穿越与任意文件覆盖
pub(crate) fn resolve_mdrf_file_name(file_name: &str) -> anyhow::Result<String> {
    let resolved = if file_name.is_empty() {
        // 文件名可留空，留空时以时间戳生成默认名
        format!("我的笔记_{}", Local::now().format("%Y-%m-%d_%H-%M-%S"))
    } else {
        file_name.to_string()
    };
    if resolved.len() > MINDRIZZLE_FILE_MAX_NAME_LEN
        || resolved.starts_with(' ')
        || resolved.ends_with(&[' ', '.'])
    {
        return Err(anyhow::anyhow!("文件名过长或首尾含非法字符"));
    }
    if resolved
        .chars()
        .any(|c| MINDRIZZLE_FILE_FORBIDDEN_CHARS.contains(&c))
    {
        return Err(anyhow::anyhow!("文件名不能包含 \\ / : * ? \" < > | 等字符"));
    }
    if MINDRIZZLE_FILE_RESERVED_NAMES.contains(&resolved.to_ascii_uppercase().as_str()) {
        return Err(anyhow::anyhow!("文件名不能是系统保留设备名"));
    }
    Ok(resolved)
}

fn require_archive_file(location: &NoteArchiveLocation) -> anyhow::Result<()> {
    if !location.archive.is_file() {
        return Err(anyhow::anyhow!("文件不存在或者是个目录"));
    }
    Ok(())
}

fn resolve_target_workspace_dir(raw_dir: Option<&str>) -> anyhow::Result<PathBuf> {
    let directory = match raw_dir {
        Some(raw_dir) => resolve_workspace_dir(raw_dir)?,
        None => mdr_file_dir::get_mdr_file_save_dir(),
    };
    fs::canonicalize(&directory).context("定位目标工作区")
}

// 跨分区时 rename 会失败，只能退回复制后删原文件
fn move_archive_file(source: &Path, target: &Path) -> anyhow::Result<()> {
    if fs::rename(source, target).is_ok() {
        return Ok(());
    }
    fs::copy(source, target).context("复制笔记到目标工作区")?;
    fs::remove_file(source).context("删除原笔记文件")?;
    Ok(())
}

// 重命名与复制都落在原文件同目录，外部文件不会因此被搬进工作区
fn sibling_archive(
    source: &NoteArchiveLocation,
    new_file_name: &str,
) -> anyhow::Result<(PathBuf, String)> {
    let note_name = resolve_mdrf_file_name(new_file_name)?;
    let directory = source.archive.parent().context("定位笔记所在目录")?;
    Ok((directory.join(format!("{note_name}.mdrf")), note_name))
}

/// 保存正文时整包重写，故 .mdrf 的修改时间即上次编辑时间
fn read_file_modified_millis(path: &Path) -> anyhow::Result<i64> {
    let modified = fs::metadata(path)
        .with_context(|| format!("读取笔记文件属性：{}", path.display()))?
        .modified()
        .context("读取笔记文件修改时间")?;
    let elapsed = modified
        .duration_since(UNIX_EPOCH)
        .context("笔记修改时间早于 UNIX 纪元")?;
    i64::try_from(elapsed.as_millis()).context("笔记修改时间超出可表示范围")
}

/// 直接截断原文件再打包失败会损坏 .mdrf，所以先写同目录临时文件再 rename 原子替换
pub(crate) fn pack_cache_atomic(path: &Path, root: &Path, compressed: bool) -> anyhow::Result<()> {
    let tmp_path = path.with_extension("mdrf.tmp");
    let packed = File::create(&tmp_path).and_then(|writer| pack_cache(root, writer, compressed));
    if let Err(e) = packed {
        let _ = fs::remove_file(&tmp_path); // 忽略清理失败，不影响主流程
        return Err(e.into());
    }
    fs::rename(&tmp_path, path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path); // 忽略清理失败，不影响主流程
        e.into()
    })
}

// 归档整包重写后大小与修改时间都会变，用它判断解包缓存是否还代表磁盘上的最新内容
fn archive_signature(archive: &Path) -> anyhow::Result<String> {
    let metadata = fs::metadata(archive)
        .with_context(|| format!("读取笔记文件属性：{}", archive.display()))?;
    Ok(format!(
        "{}:{}",
        metadata.len(),
        read_file_modified_millis(archive)?
    ))
}

pub(crate) fn open_note_cache(
    archive: &Path,
    compressed: bool,
) -> anyhow::Result<(MindrizzleFileCache, bool)> {
    open_note_cache_with_progress(archive, compressed, |_| {})
}

/// 缓存命中时不解包，`is_cache_hit` 让调用方决定是否还要上报进度
pub(crate) fn open_note_cache_with_progress(
    archive: &Path,
    compressed: bool,
    mut progress: impl FnMut(u32),
) -> anyhow::Result<(MindrizzleFileCache, bool)> {
    let signature = archive_signature(archive)?;
    let mut cache = MindrizzleFileCache::new_named(&archive.to_string_lossy())
        .with_context(|| format!("创建笔记缓存：{}", archive.display()))?;
    if read_signature(cache.path()).as_deref() == Some(signature.as_str()) {
        // 缓存要跨调用复用，回收交给 invalidate_named 与启动清扫
        cache.disable_cleanup();
        progress(PROGRESS_COMPLETE);
        return Ok((cache, true));
    }
    cache.cleanup();
    fs::create_dir_all(cache.path()).context("重建笔记缓存目录")?;
    let file =
        File::open(archive).with_context(|| format!("打开笔记文件：{}", archive.display()))?;
    extract_to_cache_with_progress(file, cache.path(), compressed, &mut progress)
        .context("解包笔记归档")?;
    write_signature(cache.path(), &signature).context("写入缓存签名")?;
    cache.disable_cleanup();
    Ok((cache, false))
}

/// 缓存内容就是打包源，所以写完必须刷新签名，否则下次会被误判成过期
pub(crate) fn flush_note_cache(
    archive: &Path,
    cache: &MindrizzleFileCache,
    compressed: bool,
) -> anyhow::Result<()> {
    pack_cache_atomic(archive, cache.path(), compressed)?;
    write_signature(cache.path(), &archive_signature(archive)?).context("更新缓存签名")
}

fn rewrite_note_meta(archive: &Path, meta: MindrizzleFileMeta) -> anyhow::Result<()> {
    let compressed = is_mdrf_compressed(archive).context("检测笔记压缩格式")?;
    let (cache, _) = open_note_cache(archive, compressed)?;
    let meta_xml = serialize_mdr_file_meta_xml(meta).context("编码笔记元信息")?;
    cache
        .write_file("meta.json", meta_xml.as_bytes())
        .context("写入笔记元信息缓存")?;
    flush_note_cache(archive, &cache, compressed)
}

// 改名只挪文件，缓存目录跟着挪就能继续用，省掉一次整包解压
fn move_note_cache(source: &Path, target: &Path) -> anyhow::Result<()> {
    let (Some(source_dir), Some(target_dir)) = (
        named_cache_dir(&source.to_string_lossy()),
        named_cache_dir(&target.to_string_lossy()),
    ) else {
        return Ok(());
    };
    if !source_dir.is_dir() {
        return Ok(());
    }
    invalidate_named(&target.to_string_lossy());
    fs::rename(&source_dir, &target_dir).context("迁移笔记缓存")?;
    // 签名只含大小与修改时间，改名不改这两项，跟着挪即可
    let _ = fs::rename(signature_path(&source_dir), signature_path(&target_dir));
    Ok(())
}

// 缓存目录与归档同步时直接读解包结果，列表页就不必为每条笔记重扫一遍 gzip 流
fn read_note_meta_xml(
    archive: &Path,
    compressed: bool,
    signature: &str,
) -> anyhow::Result<Vec<u8>> {
    if let Some(dir) = named_cache_dir(&archive.to_string_lossy()) {
        if read_signature(&dir).as_deref() == Some(signature) {
            if let Ok(xml) = fs::read(dir.join("meta.json")) {
                return Ok(xml);
            }
        }
    }
    let file =
        File::open(archive).with_context(|| format!("打开笔记文件：{}", archive.display()))?;
    extract_meta(file, compressed).context("读取笔记元信息")
}

fn deserialize_mdr_file_meta_xml(xml: &str) -> Result<MindrizzleFileMeta, quick_xml::DeError> {
    from_str(xml)
}

fn serialize_mdr_file_meta_xml(mdr_file: MindrizzleFileMeta) -> Result<String, quick_xml::SeError> {
    to_string(&mdr_file)
}

fn deserialize_mdr_file_body_xml(xml: &str) -> Result<MindrizzleFileBody, quick_xml::DeError> {
    from_str(xml)
}

fn serialize_mdr_file_body_xml(mdr_file: MindrizzleFileBody) -> Result<String, quick_xml::SeError> {
    to_string(&mdr_file)
}
