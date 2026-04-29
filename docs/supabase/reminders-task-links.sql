-- Optional Supabase schema extension for Glimmer desktop Reminders integration.
-- Run only after confirming the current production schema.

alter table public.tasks
  add column if not exists external_links jsonb,
  add column if not exists source_context jsonb;
