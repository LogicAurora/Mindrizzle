use platform_dirs::UserDirs;

pub fn get_mdr_file_save_dir() -> std::path::PathBuf {
    let path = UserDirs::new().unwrap().document_dir.join("Mindrizzle");
    if !path.exists() {
        std::fs::create_dir(&path).unwrap();
    }
    path
}
