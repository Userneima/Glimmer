# LESSONS_LEARNED

它只回答一个问题：**这个项目已经踩过哪些坑、哪些做法已验证可行，后来的 AI 不要再重踩。**

## 已验证成立的关键结论
### 场景：云端同步异常
- 表现：Supabase 不可达、认证失败、网络异常时，控制台会报错，但产品不应该因此失去本地内容。
- 根因：Glimmer 的核心数据模型本来就是本地优先，云端只是增强层。
- 已验证做法：先显示本地数据，再尝试云端拉取或补写；任何云端失败都不能用空结果覆盖本地。
- 证据来源：`src/hooks/useDiaries.ts`、`src/utils/cloud.ts`、`docs/SYNC_ENHANCEMENT.md`

### 场景：系统日记的历史兼容
- 表现：旧版本里长期想法主日记有 legacy ID，模板能力也经历过方案切换。
- 根因：系统实体不是普通用户内容，历史数据需要兼容迁移。
- 已验证做法：在 `useDiaries` 启动阶段统一补齐和纠正系统日记，而不是把兼容逻辑散落到 UI。
- 证据来源：`src/types/index.ts`、`src/hooks/useDiaries.ts`

## 典型坑点
### 场景：Supabase upsert 约束不一致
- 表现：看起来只是正常 upsert，但 PostgREST 会因为 `on conflict` 目标和唯一索引不匹配而失败。
- 根因：云端表约束、复合主键、RLS、旧表结构不一定和当前代码假设一致。
- 已验证做法：`cloud.ts` 里已经对 diary upsert 的冲突情况和 schema fallback 做了兼容判断；后续不要简单删掉这些分支。
- 证据来源：`src/utils/cloud.ts`

### 场景：把 README / DEVELOPMENT 当成当前事实
- 表现：接手者会误以为某些能力还没做，或者把已经完成的功能当成未来计划。
- 根因：旧文档里混了“历史状态”和“未来想法”，而代码已经继续演化。
- 已验证做法：接手时先看 `AGENTS.md` 和 handoff 文档，再回到代码确认。
- 证据来源：`README.md`、`docs/DEVELOPMENT.md`、当前代码入口

### 场景：窗口单看好看，但放进产品里太突兀
- 表现：抽屉、弹窗、浮层容易被做得过大、过暗、过独立，结果和正文编辑主界面风格冲突。
- 根因：只优化单窗视觉，没有看它在整个产品中的比例和注意力层级。
- 已验证做法：先控制比例和风格一致性，再优化局部美观；这条已经上升为项目规则。
- 证据来源：`AGENTS.md` 的 UI / Window Rules，以及近期 LongTermIdea/Calendar 相关实现

## 已验证可行的做法
### 场景：模板日记
- 表现：用户真实需求不是写一堆模板配置，而是“把一篇现成模板复制成新日记”。
- 根因：模板正文包含富文本结构、任务列表、标题层级，单纯文本配置会不断丢失真实格式。
- 已验证做法：保留一篇专门模板日记，新建时复制其当前状态，并在标题上套日期规则。
- 证据来源：`src/hooks/useDiaries.ts`、`src/utils/diaryTemplate.ts`

### 场景：AI 配置与账号
- 表现：旧文档把 DeepSeek 主要写成环境变量配置，但当前产品已经支持账号级 AI 配置同步。
- 根因：实现路线从“单机配置”演化到了“可绑定用户账号的配置表”。
- 已验证做法：以 `AuthContext + cloud.fetchAiSettings/upsertAiSettings` 为准，不再只按旧 `.env` 文档理解。
- 证据来源：`src/context/AuthContext.tsx`、`src/utils/cloud.ts`、`docs/DEEPSEEK_CONFIG.md`

### 场景：月历与内容视图关系
- 表现：常驻大月历会挤占侧栏，信息密度反而低。
- 根因：整月日历适合总览，不适合作为侧栏默认主内容。
- 已验证做法：侧栏默认展示当天内容，整月月历按需弹出，并在弹窗里直接提供当天预览。
- 证据来源：`src/components/Sidebar/CalendarView.tsx`

## 不推荐的做法
- 不要把云端同步写成“云端是真相，本地只是缓存”。
- 不要把模板能力重新拆成抽象配置项，而忽略真实富文本模板。
- 不要直接删除 `cloud.ts` 里看起来绕的 fallback；它们很多是在兼容真实 Supabase 状态。
- 不要把 UI 讨论简化成“单独这个弹窗好不好看”。
