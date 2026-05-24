-- Task document metadata for diaries.
-- Run this once on existing Supabase projects. New projects can use supabase-schema.sql directly.

alter table public.diaries
  add column if not exists is_task_document boolean not null default false,
  add column if not exists task_document_source_diary_id uuid,
  add column if not exists task_document_source_task_title text;

create index if not exists idx_diaries_task_document
  on public.diaries(user_id, is_task_document)
  where is_task_document = true;
