//! 组件私有文件：落在 `.mdrf` 归档的 `ComponentsData/<组件 UUID>/` 下，随笔记一起保存与搬运。
//!
//! 归档是整包读写，所以写入/删除都要先解包再重新打包；读/list 直接从归档流里找条目。

use anyhow::{Context, Result};
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use flate2::read::GzDecoder;
use log::info;
use serde::Deserialize;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use tar::Archive;

use crate::mdr_file_cache::{invalidate_named, MindrizzleFileCache};
use crate::mdr_file_op;
use crate::mdr_file_tar::{extract_to_cache, is_mdrf_compressed};
use crate::tauri_cmd;

// 归档根下的固定目录；改名会让旧笔记里的组件数据失联
const COMPONENT_DATA_ROOT: &str = "ComponentsData";
const COMPONENT_UUID_MAX_LEN: usize = 64;
const COMPONENT_PATH_MAX_LEN: usize = 512;
const COMPONENT_FILE_MAX_BYTES: usize = 64 * 1024 * 1024;
const COMPONENT_PATH_FORBIDDEN_CHARS: [char; 8] = ['\\', ':', '*', '?', '"', '<', '>', '|'];

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct NoteSource {
    dir: Option<String>,
    file_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentFileRequest {
    file_name: String,
    uuid: String,
    path: String,
    #[serde(flatten)]
    source: NoteSource,
}

// 列目录不需要具体文件路径，所以单独一个结构，避免前端被迫传空 path
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentScopeRequest {
    file_name: String,
    uuid: String,
    #[serde(flatten)]
    source: NoteSource,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentFileWriteRequest {
    file_name: String,
    uuid: String,
    path: String,
    content_base64: String,
    #[serde(flatten)]
    source: NoteSource,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentFileExportRequest {
    file_name: String,
    uuid: String,
    path: String,
    target_path: String,
    #[serde(flatten)]
    source: NoteSource,
}

struct ComponentFileTarget {
    // 缓存失效要用，否则重新打包后同名暂存区还会把旧数据写回去
    cache_key: String,
    // 日志与错误提示用，外部文件取归档文件名
    note_name: String,
    archive: PathBuf,
    uuid: String,
    path: String,
    compressed: bool,
}

impl ComponentFileTarget {
    fn entry_key(&self) -> String {
        format!("{COMPONENT_DATA_ROOT}/{}/{}", self.uuid, self.path)
    }

    fn file_path(&self, root: &Path) -> PathBuf {
        root.join(COMPONENT_DATA_ROOT)
            .join(&self.uuid)
            .join(&self.path)
    }
}

tauri_cmd! {
    pub fn list_component_data_files(request: ComponentScopeRequest) -> anyhow::Result<Vec<String>> {
        validate_component_uuid(&request.uuid)?;
        let target = resolve_scope(&request)?;
        let prefix = format!("{COMPONENT_DATA_ROOT}/{}/", request.uuid);
        list_archive_paths(&target.archive, target.compressed, &prefix)
    }

    pub fn read_component_data_file(request: ComponentFileRequest) -> anyhow::Result<String> {
        let target = resolve_target(&request)?;
        let content = read_archive_bytes(&target)?
            .ok_or_else(|| anyhow::anyhow!("组件数据文件不存在"))?;
        Ok(STANDARD.encode(content))
    }

    pub fn write_component_data_file(request: ComponentFileWriteRequest) -> anyhow::Result<()> {
        // 前端统一传 base64，避免 IPC 把 u8 数组膨胀成 JSON 数字列表
        let content = STANDARD
            .decode(request.content_base64.as_bytes())
            .context("解码组件数据内容")?;
        if content.len() > COMPONENT_FILE_MAX_BYTES {
            return Err(anyhow::anyhow!("组件数据内容超过 64 MiB 上限"));
        }
        let target = resolve_target(&ComponentFileRequest {
            file_name: request.file_name,
            uuid: request.uuid,
            path: request.path,
            source: request.source,
        })?;
        write_archive_file(&target, &content)?;
        info!("写入组件数据成功");
        Ok(())
    }

    pub fn delete_component_data_file(request: ComponentFileRequest) -> anyhow::Result<()> {
        let target = resolve_target(&request)?;
        delete_archive_file(&target)?;
        info!("删除组件数据成功");
        Ok(())
    }

    pub fn component_data_file_exists(request: ComponentFileRequest) -> anyhow::Result<bool> {
        let target = resolve_target(&request)?;
        // 复用读取以保证与 read 看到同一份条目；文件有 64 MiB 上限，这点开销可以接受
        Ok(read_archive_bytes(&target)?.is_some())
    }

    pub fn export_component_data_file(request: ComponentFileExportRequest) -> anyhow::Result<()> {
        let target = resolve_target(&ComponentFileRequest {
            file_name: request.file_name,
            uuid: request.uuid,
            path: request.path,
            source: request.source,
        })?;
        let content = read_archive_bytes(&target)?
            .ok_or_else(|| anyhow::anyhow!("组件数据文件不存在"))?;
        let destination = export_destination(&request.target_path)?;
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("创建导出目录：{}", parent.display()))?;
        }
        fs::write(&destination, &content)
            .with_context(|| format!("写入导出文件：{}", destination.display()))?;
        info!("导出组件数据成功");
        Ok(())
    }
}

fn resolve_scope(request: &ComponentScopeRequest) -> Result<ComponentFileTarget> {
    let location = mdr_file_op::resolve_note_archive(
        &request.file_name,
        request.source.dir.as_deref(),
        request.source.file_path.as_deref(),
    )?;
    if !location.archive.is_file() {
        return Err(anyhow::anyhow!("文件不存在或者是个目录"));
    }
    Ok(ComponentFileTarget {
        cache_key: location.archive.to_string_lossy().into_owned(),
        note_name: location.note_name,
        compressed: is_mdrf_compressed(&location.archive).context("检测笔记压缩格式")?,
        archive: location.archive,
        uuid: request.uuid.clone(),
        path: String::new(),
    })
}

fn resolve_target(request: &ComponentFileRequest) -> Result<ComponentFileTarget> {
    // 文件名、UUID 与路径都会拼进磁盘路径或归档条目，所以在进文件层之前统一校验
    validate_component_uuid(&request.uuid)?;
    let path = normalize_component_path(&request.path)?;
    let mut target = resolve_scope(&ComponentScopeRequest {
        file_name: request.file_name.clone(),
        uuid: request.uuid.clone(),
        source: NoteSource {
            dir: request.source.dir.clone(),
            file_path: request.source.file_path.clone(),
        },
    })?;
    target.path = path;
    Ok(target)
}

// 目标路径由系统保存对话框选定，这里只挡空值与相对路径，避免误写到进程工作目录
fn export_destination(raw: &str) -> Result<PathBuf> {
    let path = PathBuf::from(raw.trim());
    if raw.trim().is_empty() || !path.is_absolute() {
        return Err(anyhow::anyhow!("导出路径必须是绝对路径"));
    }
    if path.is_dir() {
        return Err(anyhow::anyhow!("导出路径是目录"));
    }
    Ok(path)
}

fn validate_component_uuid(uuid: &str) -> Result<()> {
    let is_valid = !uuid.is_empty()
        && uuid.len() <= COMPONENT_UUID_MAX_LEN
        && uuid
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !is_valid {
        return Err(anyhow::anyhow!("组件 UUID 非法"));
    }
    Ok(())
}

/// 路径来自 IPC，拼进磁盘路径与归档条目，必须挡掉穿越、盘符与平台非法字符
fn normalize_component_path(path: &str) -> Result<String> {
    if path.is_empty() || path.len() > COMPONENT_PATH_MAX_LEN {
        return Err(anyhow::anyhow!("组件数据路径为空或过长"));
    }
    let has_bad_segment = path.split('/').any(|segment| {
        segment.is_empty()
            || segment == "."
            || segment == ".."
            || segment
                .chars()
                .any(|c| c.is_control() || COMPONENT_PATH_FORBIDDEN_CHARS.contains(&c))
    });
    if has_bad_segment {
        return Err(anyhow::anyhow!("组件数据路径含非法字符或片段"));
    }
    Ok(path.to_string())
}

fn open_archive_reader(path: &Path, compressed: bool) -> Result<Box<dyn Read>> {
    let file = File::open(path).with_context(|| format!("打开笔记文件：{}", path.display()))?;
    if compressed {
        return Ok(Box::new(GzDecoder::new(file)));
    }
    Ok(Box::new(file))
}

fn read_archive_bytes(target: &ComponentFileTarget) -> Result<Option<Vec<u8>>> {
    // 只顺扫归档条目，避免为了读一个文件把整包解到磁盘
    let reader = open_archive_reader(&target.archive, target.compressed)?;
    let mut archive = Archive::new(reader);
    let key = target.entry_key();
    for entry in archive.entries().context("读取归档条目")? {
        let mut entry = entry.context("读取归档条目")?;
        let entry_path = entry.path().context("读取归档条目路径")?.into_owned();
        if archive_key_of(&entry_path) != key {
            continue;
        }
        if entry.size() > COMPONENT_FILE_MAX_BYTES as u64 {
            return Err(anyhow::anyhow!("组件数据文件超过 64 MiB 上限"));
        }
        let mut content = Vec::new();
        entry
            .read_to_end(&mut content)
            .context("读取组件数据文件")?;
        return Ok(Some(content));
    }
    Ok(None)
}

fn list_archive_paths(archive_path: &Path, compressed: bool, prefix: &str) -> Result<Vec<String>> {
    // 只取条目名，不读内容
    let reader = open_archive_reader(archive_path, compressed)?;
    let mut archive = Archive::new(reader);
    let mut paths = Vec::new();
    for entry in archive.entries().context("读取归档条目")? {
        let entry = entry.context("读取归档条目")?;
        let key = archive_key_of(&entry.path().context("读取归档条目路径")?);
        if let Some(relative) = key.strip_prefix(prefix) {
            if !relative.is_empty() {
                paths.push(relative.to_string());
            }
        }
    }
    paths.sort();
    Ok(paths)
}

fn archive_key_of(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn write_archive_file(target: &ComponentFileTarget, content: &[u8]) -> Result<()> {
    let _guard = mdr_file_op::lock_file_write();
    edit_archive(target, |root| {
        let file_path = target.file_path(root);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).context("创建组件数据目录")?;
        }
        fs::write(&file_path, content).context("写入组件数据文件")
    })?;
    // 同名暂存区里还是加载时的旧 ComponentsData，不删会在下次保存时把旧数据写回归档
    invalidate_named(&target.cache_key);
    Ok(())
}

fn delete_archive_file(target: &ComponentFileTarget) -> Result<()> {
    let _guard = mdr_file_op::lock_file_write();
    edit_archive(target, |root| {
        let file_path = target.file_path(root);
        let Some(parent) = file_path.parent().map(Path::to_path_buf) else {
            return Ok(());
        };
        if file_path.is_file() {
            fs::remove_file(&file_path).context("删除组件数据文件")?;
        }
        prune_empty_dirs(parent, root);
        Ok(())
    })?;
    // 同名暂存区里还是加载时的旧 ComponentsData，不删会在下次保存时把旧数据写回归档
    invalidate_named(&target.cache_key);
    Ok(())
}

fn edit_archive(
    target: &ComponentFileTarget,
    edit: impl FnOnce(&Path) -> Result<()>,
) -> Result<()> {
    // 用独立临时缓存，避免顺手把未保存的 body 或旧缓存打包；原子替换防止留下半个 .mdrf
    let cache = MindrizzleFileCache::new().context("创建组件数据临时缓存")?;
    let reader = File::open(&target.archive)
        .with_context(|| format!("打开笔记文件：{}", target.archive.display()))?;
    extract_to_cache(reader, cache.path(), target.compressed).context("解包笔记归档")?;
    edit(cache.path())?;
    mdr_file_op::pack_cache_atomic(&target.archive, cache.path(), target.compressed)
        .context("回写笔记归档")
}

fn prune_empty_dirs(mut dir: PathBuf, stop: &Path) {
    // 删文件后顺手收掉空目录，避免归档里残留无意义的层级
    while dir != stop && dir.starts_with(stop) {
        if fs::remove_dir(&dir).is_err() {
            break;
        }
        let Some(parent) = dir.parent() else {
            break;
        };
        dir = parent.to_path_buf();
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_component_path, validate_component_uuid, ComponentScopeRequest};

    #[test]
    fn scope_request_does_not_require_path() {
        let request: ComponentScopeRequest =
            serde_json::from_str(r#"{"fileName":"note","uuid":"block-1"}"#).unwrap();
        assert_eq!(request.file_name, "note");
        assert_eq!(request.uuid, "block-1");
    }

    #[test]
    fn accepts_nested_component_path() {
        assert_eq!(
            normalize_component_path("assets/images/a.png").unwrap(),
            "assets/images/a.png"
        );
    }

    #[test]
    fn rejects_path_traversal() {
        assert!(normalize_component_path("../escape.txt").is_err());
        assert!(normalize_component_path("assets/../../escape.txt").is_err());
        assert!(normalize_component_path("assets\\..\\escape.txt").is_err());
    }

    #[test]
    fn rejects_invalid_component_uuid() {
        assert!(validate_component_uuid("../../etc").is_err());
        assert!(validate_component_uuid("").is_err());
        assert!(validate_component_uuid("0b7f3f2e-6f5f-4b0e-9b0a-1f2e3d4c5b6a").is_ok());
    }
}
