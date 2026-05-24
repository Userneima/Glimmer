# Editor Module Rules

它只回答一个问题：改富文本编辑器、工具栏、表格、任务列表交互时，必须保住哪些行为。

## 接手入口

- `Editor.tsx` 是 Tiptap 编辑器主体。
- `EditorToolbar.tsx` 是固定工具栏入口。
- `TextBubbleMenu.tsx` / `TableBubbleMenu.tsx` 是选中文本和表格时的上下文操作。
- `TableOfContents.tsx` 只处理正文标题目录，不应承载编辑状态。

## 边界

- `Diary.content` 是正文真相源，保存 HTML 时不能丢失未知属性。
- 表格列宽、单元格对齐、最小宽度、`Ctrl+A` 层级选择都经过多轮调试，不要用默认表格插件行为覆盖。
- 任务列表里的任务文档入口依赖节点属性和任务文档工具，不要用任务文字匹配文档。
- 编辑器光标、任务列表、标题层级按钮的可见反馈优先级高于代码简洁度。

## 验证

- 改编辑器后至少手动复核：普通段落、H1-H4、任务列表、表格列宽/对齐、保存刷新。
- 改 Tiptap 扩展或 HTML 序列化后必须运行 `npm run build:web`。
