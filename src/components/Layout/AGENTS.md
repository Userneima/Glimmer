# Layout Module Rules

它只回答一个问题：改应用总装配、桌面左侧栏、跨面板状态时，哪些文件先看、哪些逻辑不要塞回总入口。

## 接手入口

- `AppLayout.tsx` 是应用总装配，只负责串联 hook、全局面板、跨区域 handler。
- `DesktopLeftSidebar.tsx` 负责桌面左侧栏的结构、导航与任务等入口布局。
- 新增大块 UI 时优先拆成同目录组件，不要继续扩大 `AppLayout.tsx`。

## 边界

- 不要把编辑器细节、任务详情 UI 直接写回 `AppLayout.tsx`。
- 系统日记相关判断必须复用 `diarySystem` 工具，不要用标题字符串猜测。
- `LONG_TERM_MASTER_ID`、`TEMPLATE_DIARY_ID` 不能随意改。
- 桌面与移动布局可以共享状态，但不要为了一个端的样式破坏另一个端的主流程。

## 验证

- 改 `AppLayout.tsx` 后至少运行 `npm run build:web`。
- 改桌面端专属能力时再运行对应 Tauri 验证，不要把 Web 部署和桌面打包混在一次发布里。
