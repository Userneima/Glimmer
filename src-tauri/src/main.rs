use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const REMINDERS_SWIFT: &str = include_str!("reminders_bridge.swift");

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReminderCreatePayload {
    title: String,
    notes: Option<String>,
    due_at: Option<i64>,
    source_task_id: String,
    source_diary_id: Option<String>,
    source_idea_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReminderCreateResult {
    external_id: String,
    calendar_id: Option<String>,
    calendar_title: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReminderFetchOptions {
    scope: Option<String>,
    days_ahead: Option<i64>,
    include_completed: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppleReminder {
    external_id: String,
    title: String,
    notes: Option<String>,
    due_at: Option<f64>,
    completed: bool,
    calendar_id: Option<String>,
    calendar_title: Option<String>,
    priority: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeResponse {
    status: Option<String>,
    result: Option<ReminderCreateResult>,
    reminders: Option<Vec<AppleReminder>>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalBackupPayload {
    file_name: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalBackupResult {
    path: String,
}

fn backup_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "Cannot find HOME directory.".to_string())?;
    Ok(PathBuf::from(home)
        .join("Documents")
        .join("Glimmer Backups")
        .join("auto"))
}

fn sanitize_backup_file_name(file_name: &str) -> String {
    let sanitized: String = file_name
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => character,
            _ => '-',
        })
        .collect();

    if sanitized.ends_with(".json") {
        sanitized
    } else {
        format!("{sanitized}.json")
    }
}

const MAX_BACKUP_BYTES: u64 = 50 * 1024 * 1024;

fn prune_backups_by_size(dir: &Path, max_bytes: u64) -> Result<(), String> {
    let mut files = std::fs::read_dir(dir)
        .map_err(|err| err.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("glimmer-backup-") && name.ends_with(".json"))
        })
        .collect::<Vec<_>>();

    files.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
    });

    let mut total_bytes = files
        .iter()
        .filter_map(|entry| entry.metadata().ok())
        .map(|metadata| metadata.len())
        .sum::<u64>();

    for entry in files {
        if total_bytes <= max_bytes {
            break;
        }

        let file_size = entry.metadata().map(|metadata| metadata.len()).unwrap_or(0);
        std::fs::remove_file(entry.path()).map_err(|err| err.to_string())?;
        total_bytes = total_bytes.saturating_sub(file_size);
    }

    Ok(())
}

fn run_reminders_bridge<T: Serialize>(
    command: &str,
    payload: Option<&T>,
) -> Result<BridgeResponse, String> {
    let script_path = std::env::temp_dir().join("glimmer_reminders_bridge.swift");
    std::fs::write(&script_path, REMINDERS_SWIFT).map_err(|err| err.to_string())?;

    let mut child = Command::new("/usr/bin/swift")
        .arg(&script_path)
        .arg(command)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Failed to start Swift Reminders bridge: {err}"))?;

    if let Some(payload) = payload {
        let input = serde_json::to_vec(payload).map_err(|err| err.to_string())?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(&input).map_err(|err| err.to_string())?;
        }
    }

    let output = child.wait_with_output().map_err(|err| err.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Swift Reminders bridge failed.".to_string()
        } else {
            stderr
        });
    }

    serde_json::from_slice::<BridgeResponse>(&output.stdout).map_err(|err| err.to_string())
}

fn run_reminders_script_fetch() -> Result<Vec<AppleReminder>, String> {
    let script = r#"
const app = Application("Reminders");
const reminders = app.reminders.whose({ completed: false })();

function valueOrNull(getter) {
  try {
    const value = getter();
    return value === undefined ? null : value;
  } catch (_) {
    return null;
  }
}

const result = reminders
  .map((reminder) => {
    const dueDate = valueOrNull(() => reminder.dueDate());
    return {
      externalId: valueOrNull(() => reminder.id()) || valueOrNull(() => reminder.name()),
      title: valueOrNull(() => reminder.name()) || "",
      notes: valueOrNull(() => reminder.body()),
      dueAt: dueDate ? dueDate.getTime() : null,
      completed: valueOrNull(() => reminder.completed()) || false,
      calendarTitle: valueOrNull(() => reminder.container().name()),
    };
  })
  .sort((left, right) => {
    if (left.dueAt === null && right.dueAt !== null) return 1;
    if (left.dueAt !== null && right.dueAt === null) return -1;
    if (left.dueAt !== null && right.dueAt !== null && left.dueAt !== right.dueAt) {
      return left.dueAt - right.dueAt;
    }
    return left.title.localeCompare(right.title, "zh-Hans-CN");
  });

JSON.stringify(result);
"#;

    let output = Command::new("/usr/bin/osascript")
        .arg("-l")
        .arg("JavaScript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|err| format!("Failed to start Reminders script bridge: {err}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Reminders script bridge failed.".to_string()
        } else {
            stderr
        });
    }

    serde_json::from_slice::<Vec<AppleReminder>>(&output.stdout).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_reminder_authorization_status() -> Result<String, String> {
    run_reminders_bridge::<()>("status", None)
        .map(|response| response.status.unwrap_or_else(|| "unsupported".to_string()))
}

#[tauri::command]
fn request_reminder_access() -> Result<String, String> {
    run_reminders_bridge::<()>("request_access", None)
        .map(|response| response.status.unwrap_or_else(|| "unsupported".to_string()))
}

#[tauri::command]
fn create_reminder(payload: ReminderCreatePayload) -> Result<ReminderCreateResult, String> {
    let response = run_reminders_bridge("create", Some(&payload))?;
    if let Some(error) = response.error {
        return Err(error);
    }
    response
        .result
        .ok_or_else(|| "Reminders bridge returned no result.".to_string())
}

#[tauri::command]
fn fetch_reminders(options: ReminderFetchOptions) -> Result<Vec<AppleReminder>, String> {
    match run_reminders_script_fetch() {
        Ok(reminders) => Ok(reminders),
        Err(script_error) => {
            let response = run_reminders_bridge("fetch", Some(&options))?;
            if let Some(error) = response.error {
                return Err(format!("{script_error}; EventKit fallback failed: {error}"));
            }
            Ok(response.reminders.unwrap_or_default())
        }
    }
}

#[tauri::command]
fn write_local_backup(payload: LocalBackupPayload) -> Result<LocalBackupResult, String> {
    let dir = backup_dir()?;
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;

    let file_name = sanitize_backup_file_name(&payload.file_name);
    let path = dir.join(file_name);
    let temp_path = path.with_extension("json.tmp");

    std::fs::write(&temp_path, payload.content).map_err(|err| err.to_string())?;
    std::fs::rename(&temp_path, &path).map_err(|err| err.to_string())?;
    prune_backups_by_size(&dir, MAX_BACKUP_BYTES)?;

    Ok(LocalBackupResult {
        path: path.to_string_lossy().to_string(),
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_reminder_authorization_status,
            request_reminder_access,
            create_reminder,
            fetch_reminders,
            write_local_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glimmer desktop app");
}
