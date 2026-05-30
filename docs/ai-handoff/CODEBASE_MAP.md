# Codebase Map

它只回答一个问题：接手某类任务时先看哪里，以及哪些目录不要默认读。

## 不要默认读取

- `node_modules/`：依赖安装目录，不是项目事实源。
- `dist/`：Vite 构建产物，由源码生成。
- `src-tauri/target/`：Rust/Tauri 构建产物，体积很大。
- `src-tauri/gen/schemas/`：Tauri 生成 schema，除非正在排查权限 schema，否则不要读。
- `package-lock.json`、`src-tauri/Cargo.lock`：只在依赖变更或安装问题时读。

## 任务入口

- 产品规则与边界：`AGENTS.md`、`docs/ai-handoff/GUARDRAILS.md`
- 当前能力概览：`docs/ai-handoff/CURRENT_STATE.md`
- 进入具体目录前：先读该目录最近的 `AGENTS.md`，例如 `src/components/*/AGENTS.md`、`src/hooks/AGENTS.md`、`src/utils/AGENTS.md`、`src-tauri/AGENTS.md`
- 页面总装配：`src/components/Layout/AppLayout.tsx`
- 桌面左侧栏：`src/components/Layout/DesktopLeftSidebar.tsx`
- 日记列表：`src/components/Sidebar/DiaryList.tsx`
- 文件夹：`src/components/Sidebar/FolderTree.tsx`
- 标签：`src/components/Sidebar/TagPanel.tsx`
- 日历/回看：`src/components/Sidebar/CalendarView.tsx`
- 日历主内容：`src/components/Sidebar/CalendarDateCard.tsx`、`src/components/Sidebar/CalendarDayContent.tsx`
- 月历弹窗：`src/components/Sidebar/CalendarMonthDialog.tsx`
- 周/月复盘弹窗：`src/components/Sidebar/CalendarReviewDialog.tsx`
- 任务：`src/components/Sidebar/TaskList.tsx`、`src/hooks/useTasks.ts`
- 编辑器：`src/components/Editor/Editor.tsx`、`src/components/Editor/EditorToolbar.tsx`
- 表格交互：`src/components/Editor/TableBubbleMenu.tsx`
- 回看数据与导出：`src/utils/diaryReview.ts`
- 自动标签：`src/hooks/useAutoDiaryTags.ts`
- 本地存储：`src/utils/storage.ts`
- 云同步：`src/utils/cloud.ts`、`src/utils/syncManager.ts`、`src/utils/syncQueue.ts`
- 导入导出：`src/components/UI/ImportModal.tsx`、`src/components/UI/ExportModal.tsx`、`src/utils/export.ts`
- 桌面/Tauri：`src-tauri/src/main.rs`、`src-tauri/src/reminders_bridge.swift`、`src/utils/remindersBridge.ts`

## 高上下文文件

- `src/components/Layout/AppLayout.tsx`：应用总装配，先用 `rg` 定位相关 handler，不要整文件通读。
- `src/utils/storage.ts`：本地持久化总入口，只读目标数据域相关函数。
- `src/utils/cloud.ts`：Supabase 同步总入口，只读目标表的 fetch/upsert/delete。
- `src/components/Sidebar/CalendarView.tsx`：日历状态协调入口；具体 UI 已拆到 `CalendarDateCard`、`CalendarDayContent`、`CalendarMonthDialog`、`CalendarReviewDialog`。
- `src/hooks/useTasks.ts`：任务业务集中，先搜目标任务类型或操作名。

## 文档事实源

- `docs/ai-handoff/*` 是 AI 接手主入口。
- `docs/DEVELOPMENT.md`、`README.md` 只能作为历史线索，不能直接当当前事实。
- `docs/supabase/*.sql` 只在改数据库 schema 或同步落库时读取。
