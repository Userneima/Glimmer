-- Supabase schema extension for Glimmer recurring tasks.
-- The `recurring` column already exists in the base schema and now holds a rule
-- code ('daily' | 'weekly:1,3,5' | 'every:3d'); these two columns carry the
-- rotation that advances each time the task is marked done.
--
-- Safe to run more than once. Until it is run, clients keep working: the app
-- writes recurring tasks without these columns and keeps the rotation locally.

alter table public.tasks
  add column if not exists rotation text,
  add column if not exists rotation_index integer;
