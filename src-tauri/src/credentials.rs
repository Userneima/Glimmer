//! 记住云同步登录用的邮箱和密码，存在系统钥匙串里。
//!
//! 登录页的两个勾选框决定存什么：「记住密码」不勾就只存邮箱；「自动登录」勾上时，
//! 登录状态过期后前端用存下的密码自己重新登录。
//! 只存一条：钥匙串里固定一个条目，内容是 {email, password, autoLogin} 的 JSON。

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedLogin {
    email: String,
    #[serde(default)]
    password: Option<String>,
    // 旧版本存的条目没有这个字段，当成开着：那时的行为就是自动登录。
    #[serde(default = "default_true")]
    auto_login: bool,
}

fn default_true() -> bool {
    true
}

#[cfg(target_os = "macos")]
mod mac {
    use super::SavedLogin;
    use security_framework::passwords::{
        get_generic_password, set_generic_password,
    };

    const SERVICE: &str = "com.yuchao.glimmer.cloud-login";
    const ACCOUNT: &str = "glimmer";
    // errSecItemNotFound：还没存过，不算错误。
    const NOT_FOUND: i32 = -25300;

    pub fn save(login: &SavedLogin) -> Result<(), String> {
        let json = serde_json::to_vec(login).map_err(|err| err.to_string())?;
        set_generic_password(SERVICE, ACCOUNT, &json).map_err(|err| err.to_string())
    }

    pub fn load() -> Result<Option<SavedLogin>, String> {
        match get_generic_password(SERVICE, ACCOUNT) {
            Ok(bytes) => Ok(serde_json::from_slice(&bytes).ok()),
            Err(err) if err.code() == NOT_FOUND => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

}

#[cfg(not(target_os = "macos"))]
mod mac {
    use super::SavedLogin;
    pub fn save(_login: &SavedLogin) -> Result<(), String> {
        Ok(())
    }
    pub fn load() -> Result<Option<SavedLogin>, String> {
        Ok(None)
    }
}

// 钥匙串可能弹框问他允不允许（比如 App 更新之后），不能卡在主线程上。
async fn off_main<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn save_login(
    email: String,
    password: Option<String>,
    auto_login: bool,
) -> Result<(), String> {
    off_main(move || mac::save(&SavedLogin { email, password, auto_login })).await
}

#[tauri::command]
pub async fn load_login() -> Result<Option<SavedLogin>, String> {
    off_main(mac::load).await
}

