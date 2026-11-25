-- ⚠️ 已废弃（2026-09-22）
--
-- Apple 提醒事项整条链路已下线：前端 hook / bridge / 组件、云端镜像读写、
-- 以及 src-tauri 里的 Swift EventKit 桥（含 JXA 兜底）全部删除。
-- 该表从未被写入过数据（提醒事项写入链路一直没有成功记录）。
--
-- 本文件保留作迁移历史。要清理这张空表，在 Supabase 里手动执行：
--   drop table if exists public.apple_reminders;
-- 删之前先确认：select count(*) from public.apple_reminders;
--
-- ---------------------------------------------------------------------------
-- 以下是原始内容，不再执行。

-- Account-scoped Apple Reminders mirror for Glimmer.
-- This stores a read-only cloud snapshot of local macOS Reminders.
-- The app must not treat this table as the source of truth for Apple Reminders.

-- create table if not exists public.apple_reminders (
--   user_id uuid not null,
--   external_id text not null,
--   title text not null,
--   notes text,
--   due_at bigint,
--   completed boolean not null default false,
--   calendar_id text,
--   calendar_title text,
--   priority integer,
--   fetched_at bigint not null,
--   updated_at bigint not null,
--   primary key (user_id, external_id)
-- );

-- alter table public.apple_reminders enable row level security;

-- grant usage on schema public to authenticated;
-- grant select, insert, update, delete on public.apple_reminders to authenticated;

-- drop policy if exists "apple_reminders_owner" on public.apple_reminders;
-- create policy "apple_reminders_owner" on public.apple_reminders
--   for all
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);

-- create index if not exists idx_apple_reminders_user_id
--   on public.apple_reminders(user_id);

-- create index if not exists idx_apple_reminders_user_due_at
--   on public.apple_reminders(user_id, due_at);
