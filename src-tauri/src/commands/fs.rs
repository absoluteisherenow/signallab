use std::path::{Path, PathBuf};

/// Collect missing-key audio files into ~/Desktop/SONIX-MIK/ via symlinks
/// Returns the output folder path
#[tauri::command]
pub fn export_for_mik(paths: Vec<String>) -> Result<String, String> {
    let desktop = dirs::desktop_dir().ok_or("Cannot find Desktop directory")?;
    let out_dir = desktop.join("SONIX-MIK");

    // Clean previous export
    if out_dir.exists() {
        std::fs::remove_dir_all(&out_dir).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let mut count = 0;
    for path_str in &paths {
        let src = Path::new(path_str);
        if !src.exists() {
            continue;
        }
        let filename = src.file_name().unwrap_or_default();
        let dest = out_dir.join(filename);

        // Avoid name collisions
        let dest = if dest.exists() {
            let stem = src.file_stem().unwrap_or_default().to_string_lossy();
            let ext = src.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
            out_dir.join(format!("{}_{}.{}", stem, count, ext))
        } else {
            dest
        };

        // Symlink (fast, no disk usage) — fall back to copy
        #[cfg(unix)]
        {
            if std::os::unix::fs::symlink(src, &dest).is_err() {
                std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
            }
        }
        #[cfg(not(unix))]
        {
            std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
        }
        count += 1;
    }

    Ok(out_dir.to_string_lossy().to_string())
}

/// Open a path in Finder (macOS) / Explorer (Windows) / file manager
#[tauri::command]
pub fn open_in_finder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
