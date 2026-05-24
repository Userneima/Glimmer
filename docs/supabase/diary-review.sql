-- AI review loop persistence for Glimmer.
-- Purpose:
-- 1. Store per-diary reusable review clues so they do not regenerate repeatedly
-- 2. Store weekly/monthly review digests for cross-device access
-- 3. Keep derived AI data separate from diaries.content, which remains the source of truth

create table if not exists public.diary_insights (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  diary_id uuid not null,
  date bigint not null,
  content_hash text not null,
  summary text not null,
  important_events jsonb not null default '[]'::jsonb,
  domains text[] not null default '{}',
  people text[] not null default '{}',
  places text[] not null default '{}',
  health_signals jsonb not null default '[]'::jsonb,
  course_signals jsonb not null default '[]'::jsonb,
  work_signals jsonb not null default '[]'::jsonb,
  interview_signals jsonb not null default '[]'::jsonb,
  relationship_signals jsonb not null default '[]'::jsonb,
  absence_candidates jsonb not null default '[]'::jsonb,
  confirmed_item_ids text[] not null default '{}',
  dismissed_item_ids text[] not null default '{}',
  status text not null default 'pending',
  source text not null default 'local',
  created_at bigint not null,
  updated_at bigint not null,
  unique (user_id, diary_id)
);

alter table public.diary_insights enable row level security;

drop policy if exists "diary_insights_owner" on public.diary_insights;
create policy "diary_insights_owner" on public.diary_insights
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists idx_diary_insights_user_updated_at
  on public.diary_insights(user_id, updated_at desc);

create index if not exists idx_diary_insights_user_date
  on public.diary_insights(user_id, date desc);

create table if not exists public.review_digests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null,
  start_date bigint not null,
  end_date bigint not null,
  source_diary_ids uuid[] not null default '{}',
  summary text not null,
  highlights text[] not null default '{}',
  patterns text[] not null default '{}',
  risks text[] not null default '{}',
  unresolved_questions text[] not null default '{}',
  suggested_tags text[] not null default '{}',
  confirmed_at bigint,
  created_at bigint not null,
  updated_at bigint not null,
  unique (user_id, period_type, start_date, end_date)
);

alter table public.review_digests enable row level security;

drop policy if exists "review_digests_owner" on public.review_digests;
create policy "review_digests_owner" on public.review_digests
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists idx_review_digests_user_updated_at
  on public.review_digests(user_id, updated_at desc);

create index if not exists idx_review_digests_user_period
  on public.review_digests(user_id, period_type, start_date desc);
