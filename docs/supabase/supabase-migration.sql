-- 数据库列类型迁移：从 TIMESTAMP 转换为 BIGINT（保留现有数据）

-- 1. 迁移 diaries 表
alter table diaries add column if not exists created_at_new bigint;
alter table diaries add column if not exists updated_at_new bigint;

update diaries
set created_at_new = extract(epoch from created_at::timestamp) * 1000,
    updated_at_new = extract(epoch from updated_at::timestamp) * 1000
where created_at_new is null;

alter table diaries drop column created_at;
alter table diaries drop column updated_at;
alter table diaries rename column created_at_new to created_at;
alter table diaries rename column updated_at_new to updated_at;
alter table diaries alter column created_at set not null;
alter table diaries alter column updated_at set not null;

-- 2. 迁移 folders 表
alter table folders add column if not exists created_at_new bigint;

update folders
set created_at_new = extract(epoch from created_at::timestamp) * 1000
where created_at_new is null;

alter table folders drop column created_at;
alter table folders rename column created_at_new to created_at;
alter table folders alter column created_at set not null;

-- 3. 迁移 tasks 表
alter table tasks add column if not exists created_at_new bigint;
alter table tasks add column if not exists due_at_new bigint;
alter table tasks add column if not exists start_date_new bigint;
alter table tasks add column if not exists end_date_new bigint;
alter table tasks add column if not exists completed_at_new bigint;

update tasks
set created_at_new = extract(epoch from created_at::timestamp) * 1000,
    due_at_new = case when due_at is not null then extract(epoch from due_at::timestamp) * 1000 else null end,
    start_date_new = case when start_date is not null then extract(epoch from start_date::timestamp) * 1000 else null end,
    end_date_new = case when end_date is not null then extract(epoch from end_date::timestamp) * 1000 else null end,
    completed_at_new = case when completed_at is not null then extract(epoch from completed_at::timestamp) * 1000 else null end
where created_at_new is null;

alter table tasks drop column created_at;
alter table tasks drop column due_at;
alter table tasks drop column start_date;
alter table tasks drop column end_date;
alter table tasks drop column completed_at;

alter table tasks rename column created_at_new to created_at;
alter table tasks rename column due_at_new to due_at;
alter table tasks rename column start_date_new to start_date;
alter table tasks rename column end_date_new to end_date;
alter table tasks rename column completed_at_new to completed_at;

alter table tasks alter column created_at set not null;
