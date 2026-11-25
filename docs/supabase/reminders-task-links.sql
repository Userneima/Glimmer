-- ⚠️ 已废弃（2026-09-22）
--
-- 这张表只给 Apple 提醒事项存 external_links，随该链路一起下线。
-- 现在没有表再读这两列。
--
-- 本文件保留作迁移历史。要清理，在 Supabase 里手动执行：
--   alter table public.tasks drop column if exists external_links;
--   alter table public.tasks drop column if exists source_context;
-- 注意：source_context 仍在使用，只删 external_links 那一条即可。
--
-- ---------------------------------------------------------------------------
-- 以下是原始内容，不再执行。

-- Optional Supabase schema extension for Glimmer desktop Reminders integration.
-- Run only after confirming the current production schema.

-- alter table public.tasks
--   add column if not exists tags text[],
--   add column if not exists external_links jsonb,
--   add column if not exists source_context jsonb;
