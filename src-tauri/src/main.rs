mod agent_inbox;
mod calendar;
mod credentials;
mod files;

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalBackupEntry {
    file_name: String,
    modified_ms: u64,
    bytes: u64,
}

/// 列出「文稿 / Glimmer Backups / auto」里的自动备份，最新的在前。数据安全面板用它显示和恢复。
#[tauri::command]
fn list_local_backups() -> Result<Vec<LocalBackupEntry>, String> {
    let dir = backup_dir()?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries: Vec<LocalBackupEntry> = std::fs::read_dir(&dir)
        .map_err(|err| err.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".json") {
                return None;
            }
            let meta = entry.metadata().ok()?;
            let modified_ms = meta
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            Some(LocalBackupEntry { file_name: name, modified_ms, bytes: meta.len() })
        })
        .collect();
    entries.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(entries)
}

/// 读一份自动备份的内容，用来恢复。只接受备份目录里的文件名，不接受路径。
#[tauri::command]
fn read_local_backup(file_name: String) -> Result<String, String> {
    if file_name.contains('/') || file_name.contains("..") {
        return Err("Invalid backup file name.".to_string());
    }
    std::fs::read_to_string(backup_dir()?.join(file_name)).map_err(|err| err.to_string())
}

/// 在访达里打开自动备份所在的文件夹。
#[tauri::command]
fn reveal_local_backups() -> Result<(), String> {
    let dir = backup_dir()?;
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Command::new("open").arg(&dir).spawn().map(|_| ()).map_err(|err| err.to_string())
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

    match serde_json::from_str::<BTreeMap<String, String>>(&content) {
        Ok(entries) => Ok(entries),
        Err(err) => {
            // 读不出来就把这份另存一个副本，不让之后的写入盖掉它，再告诉前端。
            // 前端会从空白开始并显示提示，告诉他副本和自动备份在哪。
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let copy = path.with_file_name(format!("glimmer-store.unreadable-{stamp}.json"));
            std::fs::copy(&path, &copy).map_err(|copy_err| copy_err.to_string())?;
            Err(format!("UNREADABLE_STORE:{}:{err}", copy.to_string_lossy()))
        }
    }
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

// ---- Agent 工作台 ----
// 拉起本机已安装的 Claude Code 跑一轮对话。不打包二进制，不存 API key，
// 走他自己的订阅登录（已实测：GUI 进程能读到 PATH 和钥匙串）。
//
// 成本要点：带 session_id 续接时每轮约 $0.02，开新会话约 $0.23——
// 因为不带 --bare 时会加载全局 CLAUDE.md、skills 等约 4 万 token 的固定上下文，
// 续接时那部分走缓存读。所以「新话题」必须是显式动作，不能每轮都开新的。

const WORKBENCH_DIR: &str = "worklog-data";
/// 搬家前的位置。原位置现在是个软链，但软链是人手建的，不该是唯一的路。
const LEGACY_WORKBENCH_DIR: &str = "Documents/agent-workbench";

// 只读 + 只允许写工作台自己的产出目录。不给它 Bash 写权限，不给它碰数据库。
const AGENT_TOOLS: &str = "Read,Glob,Grep,Write,Edit";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentChatPayload {
    prompt: String,
    session_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentChatResult {
    reply: String,
    session_id: Option<String>,
    cost_usd: f64,
    is_error: bool,
}

const CLAUDE_MISSING: &str = "本机找不到 claude 命令。工作台依赖已安装的 Claude Code（不打包二进制）。\
     如果终端里 `claude` 能用但这里找不到，多半是 GUI 应用的 PATH 与终端不同。";

fn workbench_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "找不到 HOME 目录".to_string())?;
    // 自己指到别处的优先。同事用这套东西时数据目录就在他自己的地方。
    if let Some(dir) = std::env::var_os("WORKBENCH_DIR").map(PathBuf::from) {
        if dir.is_dir() {
            return Ok(dir);
        }
    }
    // 2026-08-14 数据目录从 Documents/agent-workbench 搬到了 ~/worklog-data，
    // 原位置留了软链。软链现在能走通，但别只认它——哪天软链没了这里就整个哑掉。
    for candidate in [WORKBENCH_DIR, LEGACY_WORKBENCH_DIR] {
        let dir = PathBuf::from(&home).join(candidate);
        if dir.is_dir() {
            return Ok(dir);
        }
    }
    Err(format!(
        "找不到工作台目录（试过 ~/{WORKBENCH_DIR} 和 ~/{LEGACY_WORKBENCH_DIR}）。\
         它是独立的 git 仓库，不在 Glimmer 源码里；也可以用 WORKBENCH_DIR 指过去。"
    ))
}

/// 按几个常见位置找一个可执行文件，都没有就开登录 shell 问一次。
///
/// 从程序坞点开的 App，PATH 和终端里完全不同——常见的 `~/.npm-global/bin`、
/// `/opt/homebrew/bin` 都不在里面。所以不能直接 `Command::new("claude")`。
/// 登录 shell 那一步最贴近他终端里的真实情况，放在兜底。
fn find_bin(name: &str, candidates: &[String]) -> Option<PathBuf> {
    for path in candidates {
        let p = PathBuf::from(path);
        if p.is_file() {
            return Some(p);
        }
    }
    for shell in ["/bin/zsh", "/bin/bash"] {
        if let Ok(out) = Command::new(shell)
            .args(["-lc", &format!("command -v {name}")])
            .output()
        {
            let found = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !found.is_empty() && PathBuf::from(&found).is_file() {
                return Some(PathBuf::from(found));
            }
        }
    }
    None
}

fn resolve_claude() -> Option<PathBuf> {
    static CACHED: OnceLock<Option<PathBuf>> = OnceLock::new();
    CACHED
        .get_or_init(|| {
            let home = std::env::var("HOME").unwrap_or_default();
            find_bin(
                "claude",
                &[
                    format!("{home}/.npm-global/bin/claude"),
                    format!("{home}/.local/bin/claude"),
                    format!("{home}/.bun/bin/claude"),
                    "/opt/homebrew/bin/claude".to_string(),
                    "/usr/local/bin/claude".to_string(),
                ],
            )
        })
        .clone()
}

/// 跑批脚本只用标准库，所以系统自带的 python3 就够，不挑他装的哪个版本。
fn resolve_python() -> Option<PathBuf> {
    static CACHED: OnceLock<Option<PathBuf>> = OnceLock::new();
    CACHED
        .get_or_init(|| {
            find_bin(
                "python3",
                &[
                    "/usr/bin/python3".to_string(),
                    "/opt/homebrew/bin/python3".to_string(),
                    "/usr/local/bin/python3".to_string(),
                ],
            )
        })
        .clone()
}

fn agent_chat_blocking(payload: AgentChatPayload) -> Result<AgentChatResult, String> {
    let workdir = workbench_dir()?;
    let claude = resolve_claude().ok_or_else(|| CLAUDE_MISSING.to_string())?;

    let mut cmd = Command::new(&claude);
    cmd.current_dir(&workdir)
        .arg("-p")
        .arg(&payload.prompt)
        .args(["--model", "opus"])
        .args(["--allowedTools", AGENT_TOOLS])
        .args(["--output-format", "json"]);
    if let Some(sid) = payload.session_id.as_deref().filter(|s| !s.is_empty()) {
        cmd.args(["--resume", sid]);
    }

    let out = cmd.output().map_err(|err| {
        format!("起不来 claude：{err}。工作台依赖本机安装的 Claude Code，请确认 `claude` 可用。")
    })?;

    let stdout = String::from_utf8_lossy(&out.stdout);
    if stdout.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "claude 没有输出（退出码 {:?}）：{}",
            out.status.code(),
            stderr.chars().take(500).collect::<String>()
        ));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(stdout.trim()).map_err(|err| format!("解析返回失败：{err}"))?;

    Ok(AgentChatResult {
        reply: parsed
            .get("result")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        session_id: parsed
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        cost_usd: parsed
            .get("total_cost_usd")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.0),
        is_error: parsed
            .get("is_error")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentDailyPayload {
    /// 由界面按本机时区给出的 `YYYY-MM-DD`。桌面端不额外引入日期库。
    date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentDailyResult {
    date: String,
    diary: String,
    cost_usd: f64,
    records: i64,
    /// 日记有没有同步进他的日记应用。没同步不算失败——本地那份是准的。
    pushed: bool,
    push_error: String,
    /// 今天他又在纠结哪些已经定过的事。没有就是空字符串——绝大多数天都该是空的。
    revisited: String,
    /// 哪件事该做没做（有外部期限或等待方的才算）。同样，绝大多数天该是空的。
    pending: String,
}

/// 跑批吐进度用的行前缀，和 `bin/daily.py` 里的 `PROGRESS_MARK` 是同一个约定。
const PROGRESS_MARK: &str = "@@进度";

/// 正在跑的那次日记跑批：进程组 id + 是不是他主动停的。
/// 界面上跑着的时候点不动第二次，所以一个位置就够，不用做成表。
static DAILY_RUN: OnceLock<Mutex<Option<(u32, bool)>>> = OnceLock::new();

fn daily_run() -> &'static Mutex<Option<(u32, bool)>> {
    DAILY_RUN.get_or_init(|| Mutex::new(None))
}

/// 叫停正在跑的那次。给整个进程组发 SIGTERM，跑批收到后会把产出恢复回跑之前。
///
/// 必须发给进程组而不是 python 自己：日记是 python 拉起的 claude 在写，
/// 只杀 python 的话 claude 变成孤儿继续跑，额度照烧，而他以为已经停了。
fn agent_stop_blocking() -> Result<bool, String> {
    let mut slot = daily_run().lock().map_err(|_| "内部状态坏了".to_string())?;
    let Some((pid, stopped)) = slot.as_mut() else {
        return Ok(false); // 已经跑完了，没什么可停的
    };
    *stopped = true;
    let pid = *pid as i32;
    // 负数表示"这个进程组"。python 是组长（下面 process_group(0) 定的），claude 在组里。
    let rc = unsafe { libc::kill(-pid, libc::SIGTERM) };
    if rc != 0 {
        return Err("没能停下它，可能刚好已经结束了。".to_string());
    }
    Ok(true)
}

/// 写某一天的日记：调工作台自己的跑批脚本，不在这里另写一套。
///
/// 抽取、清洗、提示词拼装、失败回滚、git 提交都在 `bin/daily.py` 里，已经跑通九天。
/// 聊天那条路（`agent_chat`）给的工具里没有 Bash，也弹不出批准框，所以日记这件事
/// 不能让聊天里的 Agent 去申请权限做，得由这里直接把跑批拉起来。
///
/// 跑批的输出逐行读出来：带前缀的是进度，转成 `agent-progress` 事件发给界面；
/// 其余的留作跑挂时的现场。这样界面上不再是一个几分钟不动的转圈。
fn agent_daily_blocking(
    app: tauri::AppHandle,
    payload: AgentDailyPayload,
) -> Result<AgentDailyResult, String> {
    let date = payload.date.trim().to_string();
    // 这个值要拼进命令行参数和文件名，格式先卡死。
    let well_formed = date.len() == 10
        && date.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                c == '-'
            } else {
                c.is_ascii_digit()
            }
        });
    if !well_formed {
        return Err(format!("日期格式不对：{date}，要 2026-08-13 这样"));
    }

    let workdir = workbench_dir()?;
    let script = workdir.join("bin").join("daily.py");
    if !script.is_file() {
        return Err(format!("找不到跑批脚本：{}", script.display()));
    }
    let claude = resolve_claude().ok_or_else(|| CLAUDE_MISSING.to_string())?;
    let python = resolve_python()
        .ok_or_else(|| "本机找不到 python3，跑批脚本起不来。".to_string())?;

    // 上一次的结果文件先删掉，否则这次跑挂了会读到上次的成功结果。
    let result_path = workdir.join("_run").join(format!("{date}-结果.json"));
    let _ = std::fs::remove_file(&result_path);

    let mut child = Command::new(&python)
        .arg(&script)
        .args(["--date", &date])
        // 日记只写进工作台。Glimmer 的日记列表是他自己写的地方，agent 再推一份
        // 进去，同一天就变成两篇要他去挑。
        .arg("--no-push")
        .current_dir(&workdir)
        // 脚本自己 which 不到 claude——GUI 应用的 PATH 里没有它。这里已经解析好了。
        .env("CLAUDE_BIN", &claude)
        // 让跑批把进度逐行吐出来。不设这个它就还是原来那几行中文，终端里跑不受影响。
        .env("WORKBENCH_PROGRESS", "1")
        // 单开一个进程组，这样叫停时能连它拉起来的 claude 一起打死。
        .process_group(0)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("起不来跑批脚本：{err}"))?;

    *daily_run()
        .lock()
        .map_err(|_| "内部状态坏了".to_string())? = Some((child.id(), false));

    // stderr 另起一个线程读。跟 stdout 一样用管道却不读它的话，
    // 写满 64KB 缓冲就把跑批卡死了。
    let stderr_pipe = child.stderr.take();
    let stderr_reader = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(pipe) = stderr_pipe {
            let _ = BufReader::new(pipe).read_to_string(&mut buf);
        }
        buf
    });

    // 非进度行留最后几十行就够了，是跑挂时用来说清楚挂在哪的现场。
    let mut tail: Vec<String> = Vec::new();
    if let Some(pipe) = child.stdout.take() {
        for line in BufReader::new(pipe).lines() {
            let Ok(line) = line else { break };
            if let Some(rest) = line.strip_prefix(PROGRESS_MARK) {
                if let Ok(ev) = serde_json::from_str::<serde_json::Value>(rest.trim()) {
                    let _ = app.emit("agent-progress", ev);
                    continue;
                }
            }
            tail.push(line);
            if tail.len() > 60 {
                tail.remove(0);
            }
        }
    }
    let _ = child.wait();
    let stderr_text = stderr_reader.join().unwrap_or_default();

    // 停下来是他自己按的，不是出错。跑批那边已经把产出恢复回去了。
    let stopped = daily_run()
        .lock()
        .map_err(|_| "内部状态坏了".to_string())?
        .take()
        .map(|(_, s)| s)
        .unwrap_or(false);
    if stopped {
        return Err("已经停下了。这一天的日记没写，也没留下半份产物。".to_string());
    }

    let result: Option<serde_json::Value> = std::fs::read_to_string(&result_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());
    let field = |key: &str| result.as_ref().and_then(|v| v.get(key).cloned());
    let ok = field("ok").and_then(|v| v.as_bool()).unwrap_or(false);

    let diary_path = workdir.join("日记").join(format!("{date}.md"));
    let diary = std::fs::read_to_string(&diary_path).unwrap_or_default();

    if !ok || diary.trim().is_empty() {
        let why = field("error")
            .and_then(|v| v.as_str().map(str::to_string))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                let text = if stderr_text.trim().is_empty() {
                    tail.join("\n")
                } else {
                    stderr_text.clone()
                };
                text.chars().rev().take(500).collect::<Vec<_>>().into_iter().rev().collect()
            });
        return Err(format!("{date} 的日记没写成：{why}"));
    }

    Ok(AgentDailyResult {
        date,
        diary,
        cost_usd: field("cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0),
        records: field("records").and_then(|v| v.as_i64()).unwrap_or(0),
        pushed: field("pushed").and_then(|v| v.as_bool()).unwrap_or(false),
        push_error: field("push_error")
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_default(),
        revisited: field("revisited")
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_default(),
        pending: field("pending")
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_default(),
    })
}

/// 时间实际去了哪几件事。看板上半屏的「实际时间流向」就是它。
///
/// **不叫 Agent，一分额度都不花。** 归并（worktree 和子目录算一份）和统计是机械活，
/// 让模型复述一遍数字只会花钱、还可能说错。需要判断的那一半——哪件事该做没做——
/// 规则在工作台的 `项目.md` 里，那才是 Agent 的活，这里先只把事实摆出来。
fn agent_timeflow_blocking(days: Option<u32>) -> Result<serde_json::Value, String> {
    let workdir = workbench_dir()?;
    let script = workdir.join("bin").join("timeflow.py");
    if !script.is_file() {
        return Err(format!("找不到脚本：{}", script.display()));
    }
    let python = resolve_python().ok_or_else(|| "本机找不到 python3。".to_string())?;

    let out = Command::new(&python)
        .arg(&script)
        .arg(days.unwrap_or(7).clamp(1, 365).to_string())
        // 文档摘录只在判项目归属时才要，归属已经定在 项目.md 里了，
        // 带上它体积要大 25 倍。
        .args(["--json", "--no-docs"])
        .current_dir(&workdir)
        .output()
        .map_err(|err| format!("起不来 timeflow：{err}"))?;

    if !out.status.success() {
        let why = String::from_utf8_lossy(&out.stderr);
        return Err(format!("算不出时间流向：{}", why.chars().take(300).collect::<String>()));
    }
    serde_json::from_slice(&out.stdout).map_err(|err| format!("解析失败：{err}"))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            write_local_backup,
            read_desktop_store,
            write_desktop_store,
            agent_chat,
            agent_daily,
            agent_stop,
            agent_timeflow,
            calendar::calendar_events,
            credentials::save_login,
            credentials::load_login,
            files::save_to_downloads,
            files::open_calendar_privacy_settings,
            finish_exit,
            list_local_backups,
            read_local_backup,
            reveal_local_backups,
            agent_inbox::list_agent_changes,
            agent_inbox::finish_agent_change,
            agent_inbox::append_agent_log
        ])
        .build(tauri::generate_context!())
        .expect("error while building Glimmer desktop app")
        .run(|app, event| {
            // 退出前先让前端把还没写进数据文件的改动写完（数据文件是改动后 120 毫秒才写的）。
            // 用户关窗口或 Cmd+Q 时先拦下退出，通知前端写盘，前端写完调 finish_exit 再真正退出；
            // 前端两秒内没回应也照样退出，不会卡死。
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() && !EXIT_FLUSHED.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit("glimmer://flush-before-exit", ());
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        EXIT_FLUSHED.store(true, Ordering::SeqCst);
                        handle.exit(0);
                    });
                }
            }
        });
}

static EXIT_FLUSHED: AtomicBool = AtomicBool::new(false);

/// 前端写完数据文件后调用，真正退出。
#[tauri::command]
fn finish_exit(app: tauri::AppHandle) {
    EXIT_FLUSHED.store(true, Ordering::SeqCst);
    app.exit(0);
}

// 下面这几个 Agent 命令要跑几秒到几分钟。同步命令会在主线程上执行，期间整个窗口卡住、
// 进度事件发不出去、「停止」也排不上队，所以都包一层放到后台线程跑。
#[tauri::command]
async fn agent_chat(payload: AgentChatPayload) -> Result<AgentChatResult, String> {
    tauri::async_runtime::spawn_blocking(move || agent_chat_blocking(payload))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn agent_stop() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(agent_stop_blocking)
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn agent_daily(app: tauri::AppHandle, payload: AgentDailyPayload) -> Result<AgentDailyResult, String> {
    tauri::async_runtime::spawn_blocking(move || agent_daily_blocking(app, payload))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn agent_timeflow(days: Option<u32>) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || agent_timeflow_blocking(days))
        .await
        .map_err(|err| err.to_string())?
}
