# Sidebar Module Rules

它只回答一个问题：改左侧栏里的文件夹、标签、日历、任务时，如何避免破坏主写作流。

## 接手入口

- `DiaryList.tsx` 负责日记列表与搜索/排序后的卡片展示。
- `FolderTree.tsx` 负责文件夹树。
- `TagPanel.tsx` 负责标签查看、合并、删除。
- `CalendarView.tsx` 是日历状态协调入口，具体 UI 已拆到 `CalendarDateCard`、`CalendarDayContent`、`CalendarMonthDialog`、`CalendarReviewDialog`。
- `TaskList.tsx` 与 `src/hooks/useTasks.ts` 一起看，不要只改 UI。

## 边界

- 左侧栏默认要服务“快速进入今天/当前筛选内容”，不要让大日历或大量胶囊长期占据视觉主角。
- 模板日记、长期主日记等系统实体默认不应混入普通日记列表、标签统计和日历普通结果，除非需求明确。
- 标签自动清理只处理低复用 AI 标签，不能自动删除用户手动维护的稳定标签。
- 日历月视图只用于按需浏览和切换日期，不在弹窗里重复展示当天详情。

## 验证

- 改日历后复核：默认当天视图、月历弹窗、选择日期、当天任务/日记、空状态。
- 改标签后复核：标签数量、合并、删除、日记标签保留。
- 改任务后复核：提醒事项、Glimmer 任务。
