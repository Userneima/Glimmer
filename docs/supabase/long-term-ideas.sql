-- Account-scoped long-term ideas for Glimmer.
-- These are user-created idea records linked back to diary positions.

create table if not exists public.long_term_ideas (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  content text not null,
  original_diary_id text not null,
  original_position jsonb,
  progress text not null,
  note text,
  reminder jsonb,
  last_accessed_at bigint,
  last_edited_at bigint,
  created_at bigint not null,
  versions jsonb not null default '[]'::jsonb,
  original_deleted boolean not null default false
);

alter table public.long_term_ideas enable row level security;

drop policy if exists "long_term_ideas_owner" on public.long_term_ideas;
create policy "long_term_ideas_owner" on public.long_term_ideas
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_long_term_ideas_user_id
  on public.long_term_ideas(user_id);

create index if not exists idx_long_term_ideas_user_created_at
  on public.long_term_ideas(user_id, created_at desc);
