# LongTermIdea Module Rules

它只回答一个问题：改长期想法抽屉和回跳原文时，如何保护“从日记沉淀线索”的闭环。

## 接手入口

- `LongTermIdeasDrawer.tsx` 是长期想法列表和管理入口。
- `ReturnToLongTermIdeasPanel.tsx` 是从原文返回长期想法的桥。
- 数据 hook 看 `src/hooks/useLongTermIdeas.ts`。

## 边界

- 长期想法应来自明确可复用线索，不要把一次性日记片段都升级成长期想法。
- 回跳原文要保留定位感，不能让用户迷路。
- 长期想法与普通标签、AI 回看卡片职责不同，不要互相替代。

## 验证

- 改长期想法后复核：创建、打开原文、返回抽屉、删除/更新、刷新保留。
- 涉及 AI 提取时复核低置信内容不会被强行生成。
