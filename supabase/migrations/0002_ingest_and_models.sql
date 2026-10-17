-- Web uploads, on-device analysis, researcher-trained models.
-- Columns mirror packages/shared/src/schemas.ts (Observation.features, Submission, CvModel).

-- numeric feature vector from the CV module, read by researcher-trained models
alter table observations add column features jsonb not null default '{}';

-- every capture attempt, usable or not, from either channel
alter table submissions
  add column study_id text references studies (id) on delete cascade,
  add column source text not null default 'sms' check (source in ('web', 'sms')),
  add column media_type text check (media_type in ('photo', 'video')),
  add column media_url text,
  add column analysis_runtime text not null default 'server' check (analysis_runtime in ('on-device', 'server')),
  add column observation_id text references observations (id) on delete set null,
  add column escalated boolean not null default false;
-- task ids are opaque strings in the app; drop the uuid FK before widening the column
alter table submissions drop constraint if exists submissions_scheduled_task_id_fkey;
alter table submissions alter column scheduled_task_id type text using scheduled_task_id::text;
create index on submissions (participant_id, created_at);
create index on submissions (study_id, created_at);

-- scheduled tasks can end in an escalation (three unusable attempts)
alter table scheduled_tasks drop constraint if exists scheduled_tasks_status_check;
alter table scheduled_tasks add constraint scheduled_tasks_status_check
  check (status in ('pending', 'prompted', 'completed', 'missed', 'escalated'));

-- ridge-regression heads trained in the researcher toolkit
create table cv_models (
  id text primary key,
  name text not null,
  description text not null default '',
  study_id text references studies (id) on delete cascade,   -- null = every study using the module
  module text not null,
  target jsonb not null,                                      -- { name, label, unit }
  kind text not null default 'ridge' check (kind in ('ridge')),
  features jsonb not null,                                    -- feature names, in weight order
  weights jsonb not null,
  intercept double precision not null,
  feature_means jsonb not null,
  feature_stds jsonb not null,
  lambda double precision not null,
  metrics jsonb not null,                                     -- n, folds, mae, rmse, r, baseline_mae, label_min, label_max
  status text not null default 'reusable_needs_validation'
    check (status in ('validated', 'reusable_needs_validation', 'new_model_required')),
  active boolean not null default true,
  version int not null default 1,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index on cv_models (module, active);

alter table cv_models enable row level security;
create policy "members read models" on cv_models for select using (study_id is null or is_study_member(study_id));
create policy "members read submissions" on submissions for select using (is_study_member(study_id));
create policy "participant reads own submissions" on submissions for select using (participant_id = my_participant_id());
create policy "members read audit" on audit_log for select using (
  exists (select 1 from study_members m where m.researcher_id = auth.uid()));
