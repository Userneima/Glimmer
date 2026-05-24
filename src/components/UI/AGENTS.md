# UI Module Rules

它只回答一个问题：改通用弹窗、导入导出、设置、状态组件时，如何保持 Glimmer 的窗口语言一致。

## 接手入口

- `ExportModal.tsx` / `ImportModal.tsx` 处理导入导出流程。
- `SettingsModal.tsx` 处理设置入口和账号/AI/模板相关配置。
- `CloudSyncStatus.tsx` 只展示同步状态与账号切换入口。
- `DesktopUpdateNotice.tsx` 只服务桌面更新提示，不应影响 Web 主流程。

## 边界

- 弹窗、抽屉、浮层必须符合根 `AGENTS.md` 的 UI / Window Rules。
- 不要把窗口做成独立视觉实验；大小、密度、配色要和主产品比例匹配。
- 导入导出不能破坏本地数据，失败反馈要说明下一步，不只报错。
- Web-only 和 desktop-only 能力必须能安全降级。

## 验证

- 改 modal 后至少检查桌面宽屏、左侧栏存在时的整体比例。
- 改导入导出后运行 `npm run build:web` 并人工复核主要导出类型。
