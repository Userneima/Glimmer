//! Claude 改 Glimmer 数据的收件箱。Claude 把改动单（一个 JSON 文件）放进
//! App 数据目录下的 agent-inbox/，前端每隔几秒来取，核对通过后用界面同一条路径去改。
//! 处理完的单子连同结果挪进 agent-inbox/done/，每次执行、拒绝、撤销都在
//! agent-inbox/changes.log 里追加一行，Claude 和他都能翻。这里只搬文件，判断都在前端。

use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

fn inbox_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    Ok(dir.join("agent-inbox"))
}

fn checked_name(file_name: &str) -> Result<&str, String> {
    if file_name.contains('/') || file_name.contains("..") || !file_name.ends_with(".json") {
        return Err("Invalid change file name.".to_string());
    }
    Ok(file_name)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChangeFile {
    file_name: String,
    content: String,
}

/// 收件箱里还没处理的单子，按文件名排（文件名以时间开头，就是先来后到）。
#[tauri::command]
pub fn list_agent_changes(app: tauri::AppHandle) -> Result<Vec<AgentChangeFile>, String> {
    let dir = inbox_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut files: Vec<AgentChangeFile> = std::fs::read_dir(&dir)
        .map_err(|err| err.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            // Claude 先写 .tmp 再改名，只取改完名的。
            if !name.ends_with(".json") {
                return None;
            }
            let content = std::fs::read_to_string(entry.path()).ok()?;
            Some(AgentChangeFile { file_name: name, content })
        })
        .collect();
    files.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(files)
}

/// 处理完一张单子：带结果的那份写进 done/，原单从收件箱删掉。
#[tauri::command]
pub fn finish_agent_change(app: tauri::AppHandle, file_name: String, record: String) -> Result<(), String> {
    let name = checked_name(&file_name)?;
    let dir = inbox_dir(&app)?;
    let done = dir.join("done");
    std::fs::create_dir_all(&done).map_err(|err| err.to_string())?;
    std::fs::write(done.join(name), record).map_err(|err| err.to_string())?;
    let source = dir.join(name);
    if source.exists() {
        std::fs::remove_file(source).map_err(|err| err.to_string())?;
    }
    Ok(())
}

/// 在改动日志末尾追加一行（一行一个 JSON）。
#[tauri::command]
pub fn append_agent_log(app: tauri::AppHandle, line: String) -> Result<(), String> {
    let dir = inbox_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("changes.log"))
        .map_err(|err| err.to_string())?;
    writeln!(file, "{}", line.replace('\n', " ")).map_err(|err| err.to_string())
}
