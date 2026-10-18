use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use platform_dirs::AppDirs;
use serde_json::Value;

static SETTINGS_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

/// 从应用配置目录读取指定键的设置。
///
/// 键不存在时返回 `Ok(None)`；键为空或配置文件无法读取、解析时返回错误。
#[tauri::command]
pub fn get_setting(key: String) -> Result<Option<Value>, String> {
    validate_key(&key)?;
    let _guard = lock_settings()?;
    Ok(read_settings()?.remove(&key))
}

/// 将 JSON 设置写入应用配置目录。
///
/// 同名键会被新值完整覆盖，不会合并对象；键为空或文件无法写入时返回错误。
#[tauri::command]
pub fn set_setting(key: String, value: Value) -> Result<(), String> {
    validate_key(&key)?;
    let _guard = lock_settings()?;
    let mut settings = read_settings()?;
    settings.insert(key, value);
    write_settings(&settings)
}

/// 删除应用配置目录中的指定键。
///
/// 键不存在时不报错；键为空或配置文件无法读取、写入时返回错误。
#[tauri::command]
pub fn remove_setting(key: String) -> Result<(), String> {
    validate_key(&key)?;
    let _guard = lock_settings()?;
    let mut settings = read_settings()?;
    settings.remove(&key);
    write_settings(&settings)
}

const DMABUF_RENDERER_MODE_SETTING_KEY: &str = "advanced.dmabufRendererMode";
const DMABUF_RENDERER_MODE_DISABLE_RENDERER: &str = "disable-renderer";
const DMABUF_RENDERER_MODE_FORCE_SHM: &str = "force-shm";

/// 在 GTK/WebKitGTK 初始化前套用需要重启才生效的图形开关。
pub fn apply_startup_env() {
    #[cfg(target_os = "linux")]
    if let Err(error) = apply_linux_graphics_settings() {
        // 日志插件此时尚未初始化，只能写标准错误
        eprintln!("应用图形设置失败：{error}");
    }
}

#[cfg(target_os = "linux")]
fn apply_linux_graphics_settings() -> Result<(), String> {
    let settings = read_settings()?;
    let mode = settings
        .get(DMABUF_RENDERER_MODE_SETTING_KEY)
        .and_then(Value::as_str)
        .unwrap_or_default();
    // WebKitGTK 在 Wayland 下走 DMABUF 会整帧回退致窗口闪烁，只能在进程启动时用环境变量切换缓冲路径
    match mode {
        DMABUF_RENDERER_MODE_DISABLE_RENDERER => {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1")
        }
        DMABUF_RENDERER_MODE_FORCE_SHM => {
            std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1")
        }
        _ => {}
    }
    Ok(())
}

fn lock_settings() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    SETTINGS_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|error| format!("锁定设置存储失败：{error}"))
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("设置键不能为空".to_owned());
    }
    Ok(())
}

fn settings_path() -> Result<PathBuf, String> {
    let dirs =
        AppDirs::new(Some("Mindrizzle"), false).ok_or_else(|| "无法解析应用配置目录".to_owned())?;
    Ok(dirs.config_dir.join("settings.json"))
}

fn read_settings() -> Result<HashMap<String, Value>, String> {
    let path = settings_path()?;
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(error) => return Err(format!("读取设置失败：{error}")),
    };
    serde_json::from_str(&content).map_err(|error| format!("解析设置文件失败：{error}"))
}

fn write_settings(settings: &HashMap<String, Value>) -> Result<(), String> {
    let path = settings_path()?;
    let parent = path.parent().ok_or_else(|| "设置目录无效".to_owned())?;
    fs::create_dir_all(parent).map_err(|error| format!("创建设置目录失败：{error}"))?;
    let content =
        serde_json::to_vec_pretty(settings).map_err(|error| format!("编码设置失败：{error}"))?;
    fs::write(path, content).map_err(|error| format!("写入设置失败：{error}"))
}
