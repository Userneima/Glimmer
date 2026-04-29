-- Internal-only auth support for Glimmer
-- Purpose:
-- 1. Bind DeepSeek / Gemini settings to each authenticated user
-- 2. Keep the app internal by pairing this table with disabled public sign-up

create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gemini_api_key text,
  deepseek_key text,
  deepseek_base_url text,
  deepseek_model text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_ai_settings enable row level security;

drop policy if exists "user_ai_settings_select_own" on public.user_ai_settings;
create policy "user_ai_settings_select_own"
  on public.user_ai_settings
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "user_ai_settings_insert_own" on public.user_ai_settings;
create policy "user_ai_settings_insert_own"
  on public.user_ai_settings
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_ai_settings_update_own" on public.user_ai_settings;
create policy "user_ai_settings_update_own"
  on public.user_ai_settings
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.touch_user_ai_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_user_ai_settings_updated_at on public.user_ai_settings;
create trigger trg_touch_user_ai_settings_updated_at
before update on public.user_ai_settings
for each row
execute function public.touch_user_ai_settings_updated_at();

create index if not exists idx_user_ai_settings_updated_at
  on public.user_ai_settings(updated_at desc);

-- Recommended dashboard settings for internal use:
-- 1. Authentication -> disable public self sign-up
-- 2. Create internal users manually in Supabase dashboard
-- 3. Optionally enforce email domain rules with a Before User Created Hook:
--    https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
