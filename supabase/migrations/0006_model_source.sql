-- Persist Droid+Daytona generated analyzer source on the model registry row
alter table cv_models add column if not exists source_code text;
alter table cv_models add column if not exists module_params jsonb;

-- Jobs are in-process generation only (no GitHub Actions)
alter table droid_jobs drop constraint if exists droid_jobs_kind_check;
update droid_jobs set kind = 'module_generate' where kind = 'github_model';
alter table droid_jobs alter column kind set default 'module_generate';
alter table droid_jobs add constraint droid_jobs_kind_check check (kind in ('module_generate'));
