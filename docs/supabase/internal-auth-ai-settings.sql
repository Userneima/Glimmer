-- ⚠️ 已废弃（2026-09-22）
--
-- AI 设置（DeepSeek / Gemini API key）已整体下线：产品不再保存任何模型
-- API key，AI 建任务一律走本机 Claude Code（`extract_diary_tasks`）。
-- 这张表不再被读写。
--
-- 本文件保留作迁移历史。要清理，在 Supabase 里手动执行：
--   drop table if exists public.user_ai_settings;
-- 删之前先确认：select count(*) from public.user_ai_settings;
--
-- ---------------------------------------------------------------------------
-- 以下是原始内容，不再执行。

-- Internal-only auth support for Glimmer
-- Purpose:
-- 1. Bind DeepSeek settings to each authenticated user
-- 2. Keep the app internal by pairing this table with disabled public sign-up
--
-- 2026-09-22: 移除了 Gemini 后端，`gemini_api_key` 列随之废弃。
--   老库里这列还在，代码不读写，留着无害。要清理就手动执行下面这条：
--   alter table public.user_ai_settings drop column if exists gemini_api_key;

-- create table if not exists public.user_ai_settings (
--   user_id uuid primary key references auth.users(id) on delete cascade,
--   deepseek_key text,
--   deepseek_base_url text,
--   deepseek_model text,
--   updated_at timestamptz not null default timezone('utc', now())
-- );

-- alter table public.user_ai_settings enable row level security;

-- drop policy if exists "user_ai_settings_select_own" on public.user_ai_settings;
-- create policy "user_ai_settings_select_own"
--   on public.user_ai_settings
--   for select
--   using ((select auth.uid()) = user_id);

-- drop policy if exists "user_ai_settings_insert_own" on public.user_ai_settings;
-- create policy "user_ai_settings_insert_own"
--   on public.user_ai_settings
--   for insert
--   with check ((select auth.uid()) = user_id);

-- drop policy if exists "user_ai_settings_update_own" on public.user_ai_settings;
-- create policy "user_ai_settings_update_own"
--   on public.user_ai_settings
--   for update
--   using ((select auth.uid()) = user_id)
--   with check ((select auth.uid()) = user_id);

-- create or replace function public.touch_user_ai_settings_updated_at()
-- returns trigger
-- language plpgsql
-- as $$
-- begin
--   new.updated_at = timezone('utc', now());
--   return new;
-- end;
-- $$;

-- drop trigger if exists trg_touch_user_ai_settings_updated_at on public.user_ai_settings;
-- create trigger trg_touch_user_ai_settings_updated_at
-- before update on public.user_ai_settings
-- for each row
-- execute function public.touch_user_ai_settings_updated_at();

-- create index if not exists idx_user_ai_settings_updated_at
--   on public.user_ai_settings(updated_at desc);

-- -- Recommended dashboard settings for internal use:
-- -- 1. Authentication -> disable public self sign-up
-- -- 2. Create internal users manually in Supabase dashboard
-- -- 3. Optionally enforce email domain rules with a Before User Created Hook:
-- --    https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
