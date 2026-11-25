# Auth Module Rules

它只回答一个问题：改账号登录、内部访问和账号绑定时，哪些安全与降级边界不能破。

## 接手入口

- 认证状态主要通过 `src/context/AuthContext.tsx` 与 `src/context/useAuth.ts` 提供。
- UI 表单和入口组件在本目录。
- Supabase Auth 配置与网络失败处理需要同时看 `src/utils/cloud.ts`。

## 边界

- 账号系统服务内部人员和 AI/API 配置绑定，不应阻断本地写作能力。
- 未配置 Supabase、DNS 失败、网络失败时，应用应保留本地可用状态。
- 密钥、token、DeepSeek API Key 不能写入代码或日志。
- 不要用前端硬编码白名单替代真正的后端/数据库访问控制。

## 验证

- 改认证后复核：未配置 Supabase、本地模式、登录失败、退出登录、账号切换。
- 涉及 Supabase 字段或策略时同步更新 `docs/supabase/*.sql`。
