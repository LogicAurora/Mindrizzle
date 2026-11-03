mod mdr_component_data;
pub mod mdr_file_cache;
mod mdr_file_dir;
mod mdr_file_op;
mod mdr_file_struct;
pub mod mdr_file_tar;
mod settings_store;
mod system_theme;
mod utils;

use anyhow::Context;
use log::info;
use log::Record;
use std::fmt::Arguments;
use tauri_plugin_log::{
    fern::FormatCallback, log::LevelFilter, RotationStrategy, Target, TargetKind, TimezoneStrategy,
};
use tokio::fs;

tauri_cmd! {
    fn fetch_file_list(dir: Option<String>) -> anyhow::Result<Vec<String>> {
        let mut file_list: Vec<String> = Vec::new();
        let directory = match dir.as_deref() {
            Some(raw_dir) => mdr_file_op::resolve_workspace_dir(raw_dir)?,
            None => mdr_file_dir::get_mdr_file_save_dir(),
        };
        for entry in std::fs::read_dir(&directory)
            .with_context(|| format!("读取笔记目录：{}", directory.display()))?
        {
            let entry = entry.context("读取笔记目录项")?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let is_mdr_file = path
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("mdrf"));
            if !is_mdr_file {
                continue;
            }
            if let Some(file_name) = path.file_stem().and_then(|name| name.to_str()) {
                file_list.push(file_name.to_string());
            }
        }
        file_list.sort();
        info!("读取笔记列表成功，共 {} 个文件", file_list.len());
        Ok(file_list)
    }
}

#[tauri::command]
async fn is_file_name_valid(file_name: String, dir: Option<String>) -> bool {
    let Ok(location) = mdr_file_op::resolve_note_archive(&file_name, dir.as_deref(), None) else {
        return false;
    };
    !fs::try_exists(location.archive).await.unwrap_or(false)
}

#[tauri::command]
fn get_git_commit() -> &'static str {
    env!("GIT_COMMIT")
}

use tauri_plugin_updater::UpdaterExt;

fn endpoint_for(channel: &str) -> &'static str {
    match channel {
        "alpha" => {
            "https://github.com/LogicAurora/Mindrizzle/releases/download/alpha-channel/latest.json"
        }
        "beta" => {
            "https://github.com/LogicAurora/Mindrizzle/releases/download/beta-channel/latest.json"
        }
        _ => "https://github.com/LogicAurora/Mindrizzle/releases/latest/download/latest.json",
    }
}

#[tauri::command]
async fn check_update(app: tauri::AppHandle, channel: String) -> Result<Option<String>, String> {
    let updater = app
        .updater_builder()
        .endpoints(vec![
            url::Url::parse(endpoint_for(&channel)).map_err(|e| e.to_string())?
        ])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(u)) => Ok(Some(u.version)),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle, channel: String) -> Result<(), String> {
    let updater = app
        .updater_builder()
        .endpoints(vec![
            url::Url::parse(endpoint_for(&channel)).map_err(|e| e.to_string())?
        ])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(u)) => u
            .download_and_install(|_chunk, _total| {}, || {})
            .await
            .map_err(|e| e.to_string()),
        Ok(None) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 环境变量必须在 GTK/WebKitGTK 初始化前写入
    settings_store::apply_startup_env();

    // 清扫历史退出残留的孤儿缓存目录；启动早期本进程尚未创建缓存，删除安全
    mdr_file_cache::cleanup_orphan_caches();

    let log_level = if tauri::is_dev() {
        LevelFilter::Trace
    } else {
        LevelFilter::Info
    };
    let custom_format = |out: FormatCallback<'_>, args: &Arguments<'_>, record: &Record<'_>| {
        out.finish(format_args!(
            "[{}] [{}@{}:{}] [{}] {}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
            record.target(),
            record.file().unwrap_or("?"),
            record.line().unwrap_or(0),
            record.level(),
            args.to_string().rsplit_once("] ").unwrap().1 //FIXME: Tauri日志插件不符合预期，会输出默认日志格式，使格式重复
        ))
    };
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            app.handle().plugin(tauri_plugin_process::init())?;
            Ok(())
        })
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log_level)
                .targets([
                    Target::new(TargetKind::Stdout).format(custom_format), //FIXME: Tauri日志插件不符合预期，必须手动在target内设置格式
                    Target::new(TargetKind::Webview).format(custom_format),
                    Target::new(TargetKind::LogDir { file_name: None }).format(custom_format),
                ])
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .max_file_size(1_000_000)
                .rotation_strategy(RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            fetch_file_list,
            is_file_name_valid,
            get_git_commit,
            check_update,
            install_update,
            mdr_file_op::get_mdr_file_meta,
            mdr_file_op::get_mdr_file_body,
            mdr_file_op::set_mdr_file_body,
            mdr_file_op::set_mdr_file_meta,
            mdr_file_op::create_mdr_file,
            mdr_file_op::move_mdrf_file,
            mdr_file_op::move_mdr_file,
            mdr_file_op::delete_mdrf_file,
            mdr_file_op::copy_mdrf_file,
            mdr_file_op::rename_mdrf_file,
            mdr_component_data::list_component_data_files,
            mdr_component_data::read_component_data_file,
            mdr_component_data::write_component_data_file,
            mdr_component_data::delete_component_data_file,
            mdr_component_data::component_data_file_exists,
            mdr_component_data::export_component_data_file,
            settings_store::get_setting,
            settings_store::set_setting,
            settings_store::remove_setting,
            system_theme::get_wallpaper_primary_color
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
