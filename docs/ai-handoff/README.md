# AI 接手入口

这组文档只服务 Glimmer 当前仓库的 AI 接手，不承担对外说明。

阅读顺序：
1. 先读 [AGENTS.md](/Users/yuchao/Documents/GitHub/Glimmer/AGENTS.md)：项目规则、UI 边界、协作约束。
2. 再读 [PRODUCT_BRIEF.md](/Users/yuchao/Documents/GitHub/Glimmer/docs/ai-handoff/PRODUCT_BRIEF.md)：产品解决什么问题，哪些体验目标优先级最高。
3. 再读 [CURRENT_STATE.md](/Users/yuchao/Documents/GitHub/Glimmer/docs/ai-handoff/CURRENT_STATE.md)：现在已经做到哪一步，哪些能力已存在。
4. 动手前读 [GUARDRAILS.md](/Users/yuchao/Documents/GitHub/Glimmer/docs/ai-handoff/GUARDRAILS.md)：哪些地方不能乱动，最低验证要求是什么。
5. 遇到历史兼容、同步、UI 反复迭代问题时读 [LESSONS_LEARNED.md](/Users/yuchao/Documents/GitHub/Glimmer/docs/ai-handoff/LESSONS_LEARNED.md)。

事实源优先级：
1. `AGENTS.md`
2. 代码本身
3. 本目录 4 份 handoff 文档
4. `docs/*.md` 中的 feature 文档

不要把以下文件当作接手主入口：
- [README.md](/Users/yuchao/Documents/GitHub/Glimmer/README.md)：有产品描述价值，但部分功能状态和未来计划已经过时。
- [docs/DEVELOPMENT.md](/Users/yuchao/Documents/GitHub/Glimmer/docs/DEVELOPMENT.md)：更像旧开发笔记，不能直接当当前事实。
