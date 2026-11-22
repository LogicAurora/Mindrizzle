use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use log::{info, warn};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const OPEN_FILE_EVENT: &str = "mdrf-open-file";
const MAIN_WINDOW_LABEL: &str = "main";
const MDRF_EXTENSION: &str = "mdrf";

static PENDING_OPEN_FILE: Mutex<Option<OpenFileRequest>> = Mutex::new(None);
static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenFileRequest {
    id: u64,
    path: String,
}

pub fn handle_launch_args(app: &AppHandle) {
    handle_args(app, std::env::args());
}

pub fn handle_args<I>(app: &AppHandle, args: I)
where
    I: IntoIterator<Item = String>,
{
    for arg in args {
        if let Some(path) = mdrf_path_of_arg(&arg) {
            deliver(app, path);
        }
    }
}

pub fn handle_run_event(app: &AppHandle, event: &tauri::RunEvent) {
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Opened { urls } = event {
        for url in urls {
            if let Some(path) = mdrf_path_of_arg(url.as_str()) {
                deliver(app, path);
            }
        }
        return;
    }

    let _ = (app, event);
}

fn mdrf_path_of_arg(arg: &str) -> Option<PathBuf> {
    let path = match url::Url::parse(arg) {
        Ok(url) if url.scheme() == "file" => url.to_file_path().ok()?,
        Ok(_) => return None,
        Err(_) => PathBuf::from(arg),
    };
    let is_mdrf = path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case(MDRF_EXTENSION));
    if !is_mdrf {
        return None;
    }
    // 桌面启动时工作目录可能是 /，相对参数必须先补成绝对路径再交给前端
    let path = std::path::absolute(&path).unwrap_or(path);
    if !path.is_file() {
        warn!("忽略不存在的关联文件：{}", path.display());
        return None;
    }
    Some(path)
}

// 启动早期前端还没挂载事件监听，所以请求同时留一份待取，由前端启动时兜底拉取
fn deliver(app: &AppHandle, path: PathBuf) {
    let request = OpenFileRequest {
        id: NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed),
        path: path.to_string_lossy().into_owned(),
    };
    info!("收到关联打开请求：{}", request.path);
    *PENDING_OPEN_FILE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(request.clone());
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL)
        && let Err(error) = window.emit(OPEN_FILE_EVENT, request)
    {
        warn!("通知前端打开关联文件失败：{error}");
    }
}

#[tauri::command]
pub fn take_pending_open_file() -> Option<OpenFileRequest> {
    PENDING_OPEN_FILE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_temp_mdrf(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "mindrizzle-open-{}-{name}.mdrf",
            std::process::id()
        ));
        std::fs::write(&path, b"test").expect("写入测试笔记");
        path
    }

    #[test]
    fn accepts_existing_absolute_path() {
        let path = write_temp_mdrf("absolute");
        let parsed = mdrf_path_of_arg(path.to_str().expect("临时路径为 UTF-8"));
        assert_eq!(parsed.as_deref(), Some(path.as_path()));
        std::fs::remove_file(path).expect("清理测试笔记");
    }

    #[test]
    fn accepts_file_url_and_uppercase_extension() {
        let path =
            std::env::temp_dir().join(format!("mindrizzle-open-{}-URL.MDRF", std::process::id()));
        std::fs::write(&path, b"test").expect("写入测试笔记");
        let url = url::Url::from_file_path(&path).expect("转换为文件 URL");
        let parsed = mdrf_path_of_arg(url.as_str());
        assert_eq!(parsed.as_deref(), Some(path.as_path()));
        std::fs::remove_file(path).expect("清理测试笔记");
    }

    #[test]
    fn ignores_other_extensions_and_missing_files() {
        assert!(mdrf_path_of_arg("/tmp/mindrizzle-note.txt").is_none());
        assert!(mdrf_path_of_arg("/tmp/mindrizzle-missing-note.mdrf").is_none());
    }
}
