# Editor Module Rules

它只回答一个问题：改富文本编辑器、工具栏、任务列表交互时，必须保住哪些行为。

## 接手入口

- `Editor.tsx` 是 Tiptap 编辑器主体。
- `EditorToolbar.tsx` 是固定工具栏入口。
- `TextBubbleMenu.tsx` 是选中文本时的上下文操作。表格气泡菜单已于 2026-09-22 下线。
- `TaskCarryoverPrompt.tsx` 负责跨日任务结转提示。

## 边界

- `Diary.content` 是正文真相源，保存 HTML 时不能丢失未知属性。
- `Editor.tsx` 里保留 `Table` / `TableRow` / `TableCell` / `TableHeader` 四个基础节点，只为旧正文里的表格能正常渲染。删掉任何一项，Tiptap 解析旧内容时都会把 `<table>` 静默丢掉——这不是清理，是改写用户正文。新建表格的入口（工具栏按钮与气泡菜单）已下线，不要恢复。
- 编辑器光标、任务列表、标题层级按钮的可见反馈优先级高于代码简洁度。

## 验证

- 改编辑器后至少手动复核：普通段落、H1-H4、任务列表、保存刷新。
- 改 Tiptap 扩展或 HTML 序列化后必须运行 `npm run build:web`。
