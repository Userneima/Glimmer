//! 桌面版的导出保存。桌面窗口不处理网页里的「下载」，前端用浏览器那套方式存文件
//! 会静悄悄地什么都不发生，所以由这里直接写进「下载」文件夹，写完在访达里选中它。

use base64::Engine;
use std::path::{Path, PathBuf};
use std::process::Command;

fn downloads_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "找不到用户目录".to_string())?;
    Ok(PathBuf::from(home).join("Downloads"))
}

fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':' | '\0') || c.is_control() { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.').to_string();
    if trimmed.is_empty() { "glimmer-export".to_string() } else { trimmed }
}

// 同名文件已经在了就加 (1)、(2)，不覆盖他之前导出的。
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (1..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|path| !path.exists())
        .expect("unbounded search always finds a free name")
}

#[tauri::command]
pub fn save_to_downloads(
    file_name: String,
    base64: String,
    subfolder: Option<String>,
    reveal: Option<bool>,
) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64.as_bytes())
        .map_err(|err| format!("导出内容解码失败：{err}"))?;
    // 一次导出很多个文件时放进「下载」里的一个子文件夹，不散在根目录。
    let mut dir = downloads_dir()?;
    if let Some(sub) = subfolder.filter(|s| !s.trim().is_empty()) {
        dir = dir.join(safe_file_name(&sub));
    }
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let path = unique_path(&dir, &safe_file_name(&file_name));
    std::fs::write(&path, bytes).map_err(|err| format!("写入文件失败：{err}"))?;
    // 在访达里选中刚存的文件，他一眼就知道存在哪了。批量导出时只在最后一个文件上做，
    // 不然每个文件都弹一次访达。打不开访达不算失败。
    if reveal.unwrap_or(true) {
        let _ = Command::new("open").arg("-R").arg(&path).spawn();
    }
    Ok(path.to_string_lossy().to_string())
}

/// 拒绝过一次日历授权后，系统不会再弹框，只能去系统设置里手动打开。这里直接跳到那一页。
#[tauri::command]
pub fn open_calendar_privacy_settings() -> Result<(), String> {
    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars")
        .spawn()
        .map(|_| ())
        .map_err(|err| err.to_string())
}
