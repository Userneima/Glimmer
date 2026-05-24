# Analysis Module Rules

它只回答一个问题：改 AI 分析、回看卡片、长期想法提取时，如何避免打扰写作和制造低质信息。

## 接手入口

- `AnalysisPanel.tsx` 是单篇日记 AI Review 的主要 UI。
- 回看数据结构和提取规则在 `src/utils/diaryReview.ts`。
- 自动触发逻辑看 `src/hooks/useAutoDiaryAnalysis.ts` 和 `src/hooks/useAutoDiaryTags.ts`。

## 边界

- AI 分析是增强层，不能阻塞写作、保存、导出。
- 不要强行生成长期想法、标签或结论；没有高置信内容时应允许为空。
- 置顶日记、模板日记、任务文档等系统实体默认不显示普通 AI Review。
- 已生成的回看数据要优先复用，避免重复调用和重复污染。

## 验证

- 改分析后复核：普通日记可查看、系统日记隐藏、无 AI 配置可降级、重复打开不重复生成。
- 涉及云保存时确认本地 fallback 和 Supabase schema fallback。
