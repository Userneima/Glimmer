# Glimmer × Apple Reminders

这份文档只回答：Glimmer 接入 Apple Reminders 时，产品边界和桌面技术边界是什么。

## 产品边界

Glimmer 负责写作、整理、长期想法、AI 任务生成、任务来源上下文和“是否已发送到外部执行系统”的状态。

Apple Reminders 负责系统级提醒、通知、执行、完成状态和 Apple 生态同步。

不要把 Reminders 当成 Glimmer 的主数据库。v1 只做从 Glimmer 单向发送到 Reminders，不导入用户全部提醒事项，不做双向实时同步。

## 当前实现

- Web 版会显示 Reminders 不可用，不尝试访问系统提醒事项。
- macOS 桌面版通过 Tauri 命令调用 Swift/EventKit 桥接脚本。
- 默认写入 Reminders 中名为 `Glimmer` 的清单；如果创建或定位失败，回退到系统默认清单。
- 任务通过 `externalLinks` 记录 Apple Reminders 外部 ID、清单信息、同步时间和失败原因。
- 任务通过 `sourceContext` 记录来源：手动、日记、长期想法或 AI 生成。

## 开发命令

```bash
npm run build
npm run tauri:dev
npm run tauri:build
```

桌面命令需要本机安装 Rust/Cargo。Swift/EventKit 桥接需要 macOS 和 Xcode Command Line Tools。

## 维护边界

- 不要在 React 组件里直接写 EventKit 细节。
- 不要让 Web 版假装支持 Reminders。
- 不要因为 Supabase schema 尚未增加 `external_links` / `source_context` 就丢弃本地任务数据。
- 如果未来要读取 Reminders 状态，只能按 Glimmer 已创建过的 `externalId` 按需刷新，不扫描用户所有提醒事项。
