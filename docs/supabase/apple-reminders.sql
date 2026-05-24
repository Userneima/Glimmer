-- Account-scoped Apple Reminders mirror for Glimmer.
-- This stores a read-only cloud snapshot of local macOS Reminders.
-- The app must not treat this table as the source of truth for Apple Reminders.

create table if not exists public.apple_reminders (
  user_id uuid not null,
  external_id text not null,
  title text not null,
  notes text,
  due_at bigint,
  completed boolean not null default false,
  calendar_id text,
  calendar_title text,
  priority integer,
  fetched_at bigint not null,
  updated_at bigint not null,
  primary key (user_id, external_id)
);

alter table public.apple_reminders enable row level security;

drop policy if exists "apple_reminders_owner" on public.apple_reminders;
create policy "apple_reminders_owner" on public.apple_reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_apple_reminders_user_id
  on public.apple_reminders(user_id);

create index if not exists idx_apple_reminders_user_due_at
  on public.apple_reminders(user_id, due_at);

