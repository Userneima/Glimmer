-- 删除旧表（如果存在且类型错误）
-- 警告：这会删除所有数据！请先备份
drop table if exists diaries cascade;
drop table if exists folders cascade;
drop table if exists tasks cascade;

-- 创建正确的表结构（时间字段使用 bigint 存储毫秒时间戳）
create table if not exists diaries (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  content text not null,
  folder_id uuid,
  tags text[],
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists folders (
  id uuid primary key,
  user_id uuid not null,
  name text not null,
  parent_id uuid,
  color text,
  created_at bigint not null
);

create table if not exists tasks (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  notes text,
  created_at bigint not null,
  due_at bigint,
  completed boolean not null default false,
  recurring text,
  related_diary_id uuid,
  task_type text not null,
  start_date bigint,
  end_date bigint,
  completed_at bigint,
  sort_order integer
);

-- 启用行级安全
alter table diaries enable row level security;
alter table folders enable row level security;
alter table tasks enable row level security;

-- 创建 RLS 策略（只允许用户访问自己的数据）
create policy "diaries_owner" on diaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "folders_owner" on folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks_owner" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 创建索引以提高查询性能
create index if not exists idx_diaries_user_id on diaries(user_id);
create index if not exists idx_diaries_folder_id on diaries(folder_id);
create index if not exists idx_diaries_created_at on diaries(created_at desc);
create index if not exists idx_folders_user_id on folders(user_id);
create index if not exists idx_tasks_user_id on tasks(user_id);
