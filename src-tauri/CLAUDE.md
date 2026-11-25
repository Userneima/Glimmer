# Desktop Module Rules

它只回答一个问题：改桌面 App、Tauri、打包、更新时，如何不影响 Web 发布。

## 接手入口

- `src/main.rs` 是 Tauri 后端入口。
- `src/calendar.rs` 只读 Mac 日历（EventKit，在 Glimmer 进程内调用，权限才记在 Glimmer 名下）。授权说明在 `Info.plist`，只有打包后的 App 能弹授权框，`desktop:dev` 的裸二进制读不了。
- `src/credentials.rs` 把云同步的邮箱、密码（勾了「记住密码」才存）和自动登录开关存进系统钥匙串，供自动重新登录和登录页预填。
- `tauri.conf.json`、`capabilities/`、`gen/` 与桌面权限和打包相关。

## 边界

- Web 部署和桌面打包是两条发布路径：Vercel 用 `npm run build:web`，桌面用 `npm run desktop:build`。
- 不要手动编辑 `target/` 或生成 schema 目录。
- 桌面能力必须能在 Web 端安全降级，不能让浏览器端因为 Tauri API 缺失而崩。
- 安装包、签名、自动更新配置不要和普通 UI 改动混在同一发布里。

## 验证

- 只改 Web UI 时不用跑桌面打包。
- 改 Tauri、日历读取、自动更新、打包配置时运行对应桌面验证，并确认 Web build 不回归。
