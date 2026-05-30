# Utils Module Rules

它只回答一个问题：改存储、同步、导出、系统实体工具时，哪些数据边界必须保住。

## 接手入口

- `storage.ts` 是本地持久化总入口。
- `cloud.ts` 是 Supabase 读写与 schema fallback 总入口。
- `syncManager.ts` / `syncQueue.ts` 处理云同步节奏。
- `diarySystem.ts`、`diaryTemplate.ts` 定义系统日记、模板日记规则。
- `export.ts` 负责导出格式，不要在 UI 层复制导出逻辑。

## 边界

- Glimmer 是本地优先：云端失败、DNS 失败、schema 缺失都不能破坏本地写作和读取。
- `Diary.content` 是富文本、表格、任务列表、AI 回看提取的核心内容载体。
- Supabase 新字段必须同时补 `docs/supabase/*.sql`，并考虑旧 schema fallback。
- 特殊 ID 与系统实体不能通过标题判断。

## 验证

- 改 `storage.ts` / `cloud.ts` 后至少运行 `npm run build:web`。
- 涉及 Supabase 时复核未配置、网络失败、旧 schema、新 schema 四种路径。
- 改导出后复核当前日记导出、全部合并导出、按篇拆分导出。
