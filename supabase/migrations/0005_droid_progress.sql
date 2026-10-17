-- Live Droid + Daytona module-generation progress on droid_jobs
alter table droid_jobs add column if not exists progress jsonb;
alter table droid_jobs add column if not exists kind text not null default 'module_generate'
  check (kind in ('module_generate'));
