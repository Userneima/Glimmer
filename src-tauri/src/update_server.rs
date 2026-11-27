// 本地更新通道：App 自己起一个只监听 127.0.0.1 的静态服务，把开发时打好的新版本
// 当成一次正常的应用内更新。正式发布仍然走 GitHub；本地没有更新的版本时，
// 301/302 回 GitHub 的清单，公开版本照常能收到。
use semver::Version;
use serde::Deserialize;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::thread;
use tauri::Manager;

// 端口只有这一个来源，scripts/local-update.mjs 读同一个文件生成更新地址。
const CONFIG: &str = include_str!("../../scripts/local-update.config.json");
const GITHUB_MANIFEST: &str =
    "https://github.com/Userneima/Glimmer/releases/latest/download/latest.json";

#[derive(Deserialize)]
struct LocalUpdateConfig {
    port: u16,
}

#[derive(Deserialize)]
struct ManifestVersion {
    version: String,
}

pub fn start(app: &tauri::AppHandle) {
    let dir = match app.path().app_data_dir() {
        Ok(dir) => dir.join("local-updates"),
        Err(_) => return,
    };

    // 没写过本地更新包的机器（包括公开版用户）连端口都不占。
    if !dir.join("latest.json").is_file() {
        return;
    }

    let port = serde_json::from_str::<LocalUpdateConfig>(CONFIG)
        .map(|config| config.port)
        .unwrap_or(49731);

    thread::spawn(move || {
        let listener = match TcpListener::bind(("127.0.0.1", port)) {
            Ok(listener) => listener,
            Err(err) => {
                log(&dir, &format!("bind 127.0.0.1:{port} failed: {err}"));
                return;
            }
        };

        for stream in listener.incoming().flatten() {
            let dir = dir.clone();
            thread::spawn(move || {
                let _ = handle(stream, &dir);
            });
        }
    });
}

fn handle(mut stream: TcpStream, dir: &Path) -> std::io::Result<()> {
    let mut buffer = [0u8; 4096];
    let read = stream.read(&mut buffer)?;
    if read == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buffer[..read]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");
    let path = path.split('?').next().unwrap_or("/");
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    match segments.as_slice() {
        ["latest.json"] => respond_manifest(&mut stream, dir, None),
        [current, "latest.json"] => respond_manifest(&mut stream, dir, Some(current)),
        ["Glimmer.app.tar.gz"] => respond_file(&mut stream, &dir.join("Glimmer.app.tar.gz")),
        _ => respond_status(&mut stream, "404 Not Found", "not found"),
    }

    Ok(())
}

fn respond_manifest(stream: &mut TcpStream, dir: &Path, current: Option<&str>) {
    let raw = match fs::read_to_string(dir.join("latest.json")) {
        Ok(raw) => raw,
        Err(_) => return redirect(stream, dir, "no local manifest"),
    };

    let local = match serde_json::from_str::<ManifestVersion>(&raw) {
        Ok(manifest) => manifest.version,
        Err(_) => return redirect(stream, dir, "unreadable local manifest"),
    };

    let serve_local = match current {
        Some(current) => is_newer(&local, current),
        None => true,
    };

    if serve_local {
        log(dir, &format!("serve local {local} to {current:?}"));
        respond_bytes(stream, "200 OK", "application/json", raw.as_bytes());
    } else {
        redirect(stream, dir, &format!("local {local} not newer than {current:?}"));
    }
}

fn is_newer(local: &str, current: &str) -> bool {
    match (Version::parse(local), Version::parse(current)) {
        (Ok(local), Ok(current)) => local > current,
        _ => false,
    }
}

fn respond_file(stream: &mut TcpStream, path: &Path) {
    match fs::read(path) {
        Ok(bytes) => respond_bytes(stream, "200 OK", "application/octet-stream", &bytes),
        Err(_) => respond_status(stream, "404 Not Found", "not found"),
    }
}

fn respond_bytes(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn respond_status(stream: &mut TcpStream, status: &str, body: &str) {
    respond_bytes(stream, status, "text/plain; charset=utf-8", body.as_bytes());
}

fn redirect(stream: &mut TcpStream, dir: &Path, reason: &str) {
    log(dir, &format!("redirect to GitHub: {reason}"));
    let header = format!(
        "HTTP/1.1 302 Found\r\nLocation: {GITHUB_MANIFEST}\r\nContent-Length: 0\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.flush();
}

fn log(dir: &Path, message: &str) {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("server.log"))
    {
        let _ = writeln!(file, "{stamp} {message}");
    }
}
