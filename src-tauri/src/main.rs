use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

const REMINDERS_SWIFT: &str = include_str!("reminders_bridge.swift");
static REMINDERS_SERVER: OnceLock<Mutex<Option<RemindersBridgeServer>>> = OnceLock::new();

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
struct ReminderCompletionPayload {
    external_id: String,
    completed: bool,
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

struct RemindersBridgeServer {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<std::process::ChildStdout>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStorePayload {
    entries: BTreeMap<String, String>,
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
    run_reminders_bridge_server(command, payload)
        .or_else(|server_error| {
            run_reminders_bridge_once(command, payload).map_err(|once_error| {
                format!("{server_error}; one-shot EventKit bridge failed: {once_error}")
            })
        })
        .or_else(|compiled_error| {
            run_reminders_bridge_swift_script(command, payload).map_err(|script_error| {
                format!("{compiled_error}; Swift script fallback failed: {script_error}")
            })
        })
}

fn reminders_bridge_hash() -> u64 {
    let mut hasher = DefaultHasher::new();
    REMINDERS_SWIFT.hash(&mut hasher);
    hasher.finish()
}

fn reminders_bridge_paths() -> (PathBuf, PathBuf) {
    let hash = reminders_bridge_hash();
    let script_path = std::env::temp_dir().join(format!("glimmer_reminders_bridge_{hash}.swift"));
    let binary_path = std::env::temp_dir().join(format!("glimmer_reminders_bridge_{hash}"));
    (script_path, binary_path)
}

fn ensure_reminders_bridge_binary() -> Result<PathBuf, String> {
    let (script_path, binary_path) = reminders_bridge_paths();
    if binary_path.exists() {
        return Ok(binary_path);
    }

    std::fs::write(&script_path, REMINDERS_SWIFT).map_err(|err| err.to_string())?;
    let output = Command::new("/usr/bin/swiftc")
        .arg("-O")
        .arg(&script_path)
        .arg("-o")
        .arg(&binary_path)
        .output()
        .map_err(|err| format!("Failed to start Swift compiler: {err}"))?;

    if output.status.success() {
        return Ok(binary_path);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        "Swift Reminders bridge compilation failed.".to_string()
    } else {
        stderr
    })
}

fn run_reminders_bridge_once<T: Serialize>(
    command: &str,
    payload: Option<&T>,
) -> Result<BridgeResponse, String> {
    let binary_path = ensure_reminders_bridge_binary()?;

    let mut child = Command::new(binary_path)
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

fn run_reminders_bridge_swift_script<T: Serialize>(
    command: &str,
    payload: Option<&T>,
) -> Result<BridgeResponse, String> {
    let (script_path, _) = reminders_bridge_paths();
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

fn start_reminders_bridge_server() -> Result<RemindersBridgeServer, String> {
    let binary_path = ensure_reminders_bridge_binary()?;
    let mut child = Command::new(binary_path)
        .arg("server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| format!("Failed to start EventKit Reminders server: {err}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Reminders server stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Reminders server stdout is unavailable.".to_string())?;

    Ok(RemindersBridgeServer {
        child,
        stdin,
        stdout: BufReader::new(stdout),
    })
}

fn run_reminders_bridge_server<T: Serialize>(
    command: &str,
    payload: Option<&T>,
) -> Result<BridgeResponse, String> {
    let lock = REMINDERS_SERVER.get_or_init(|| Mutex::new(None));
    let mut guard = lock
        .lock()
        .map_err(|_| "Reminders server lock failed.".to_string())?;

    if guard
        .as_mut()
        .and_then(|server| server.child.try_wait().ok().flatten())
        .is_some()
    {
        *guard = None;
    }

    if guard.is_none() {
        *guard = Some(start_reminders_bridge_server()?);
    }

    let server = guard
        .as_mut()
        .ok_or_else(|| "Reminders server is unavailable.".to_string())?;

    let request = if let Some(payload) = payload {
        json!({ "command": command, "payload": payload })
    } else {
        json!({ "command": command })
    };
    let mut request_line = serde_json::to_vec(&request).map_err(|err| err.to_string())?;
    request_line.push(b'\n');

    if let Err(err) = server
        .stdin
        .write_all(&request_line)
        .and_then(|_| server.stdin.flush())
    {
        *guard = None;
        return Err(format!("Failed to write to Reminders server: {err}"));
    }

    let mut response_line = String::new();
    match server.stdout.read_line(&mut response_line) {
        Ok(0) => {
            *guard = None;
            Err("Reminders server closed unexpectedly.".to_string())
        }
        Ok(_) => {
            serde_json::from_str::<BridgeResponse>(&response_line).map_err(|err| err.to_string())
        }
        Err(err) => {
            *guard = None;
            Err(format!("Failed to read from Reminders server: {err}"))
        }
    }
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

fn run_reminders_script_set_completed(payload: &ReminderCompletionPayload) -> Result<(), String> {
    let script = r#"
function run(argv) {
  const externalId = argv[0];
  const completed = argv[1] === "true";
  const app = Application("Reminders");
  const reminders = app.reminders.whose({ id: externalId })();

  if (reminders.length === 0) {
    throw new Error("Reminder was not found.");
  }

  reminders[0].completed = completed;
}
"#;

    let output = Command::new("/usr/bin/osascript")
        .arg("-l")
        .arg("JavaScript")
        .arg("-e")
        .arg(script)
        .arg(&payload.external_id)
        .arg(if payload.completed { "true" } else { "false" })
        .output()
        .map_err(|err| format!("Failed to start Reminders script bridge: {err}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        "Reminders script bridge failed.".to_string()
    } else {
        stderr
    })
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
    let response = run_reminders_bridge("fetch", Some(&options))?;
    if let Some(error) = response.error {
        match run_reminders_script_fetch() {
            Ok(reminders) => Ok(reminders),
            Err(script_error) => Err(format!(
                "EventKit Reminders bridge failed: {error}; AppleScript fallback failed: {script_error}"
            )),
        }
    } else {
        Ok(response.reminders.unwrap_or_default())
    }
}

#[tauri::command]
fn set_reminder_completed(payload: ReminderCompletionPayload) -> Result<(), String> {
    let response = run_reminders_bridge("set_completed", Some(&payload));
    match response {
        Ok(response) => {
            if let Some(error) = response.error {
                run_reminders_script_set_completed(&payload).map_err(|script_error| {
                    format!(
                        "EventKit Reminders bridge failed: {error}; AppleScript fallback failed: {script_error}"
                    )
                })
            } else {
                Ok(())
            }
        }
        Err(eventkit_error) => run_reminders_script_set_completed(&payload).map_err(|script_error| {
            format!(
                "EventKit Reminders bridge failed: {eventkit_error}; AppleScript fallback failed: {script_error}"
            )
        }),
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

fn desktop_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    Ok(dir.join("glimmer-store.json"))
}

#[tauri::command]
fn read_desktop_store(app: tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    let path = desktop_store_path(&app)?;
    if !path.exists() {
        return Ok(BTreeMap::new());
    }

    let content = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
    if content.trim().is_empty() {
        return Ok(BTreeMap::new());
    }

    serde_json::from_str::<BTreeMap<String, String>>(&content).map_err(|err| err.to_string())
}

#[tauri::command]
fn write_desktop_store(app: tauri::AppHandle, payload: DesktopStorePayload) -> Result<(), String> {
    let path = desktop_store_path(&app)?;
    let dir = path
        .parent()
        .ok_or_else(|| "Cannot resolve desktop store directory.".to_string())?;
    std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;

    let temp_path = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(&payload.entries).map_err(|err| err.to_string())?;
    std::fs::write(&temp_path, content).map_err(|err| err.to_string())?;
    std::fs::rename(&temp_path, &path).map_err(|err| err.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            std::thread::spawn(|| {
                let _ = run_reminders_bridge(
                    "fetch",
                    Some(&ReminderFetchOptions {
                        scope: Some("all-open".to_string()),
                        days_ahead: None,
                        include_completed: Some(false),
                    }),
                );
            });
            Ok(())
        })
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_reminder_authorization_status,
            request_reminder_access,
            create_reminder,
            fetch_reminders,
            set_reminder_completed,
            write_local_backup,
            read_desktop_store,
            write_desktop_store
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glimmer desktop app");
}
