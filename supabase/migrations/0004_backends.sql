-- Every backend persists here: the web app (uploads, reviews, builder, Droid), the messaging
-- agent (conversations, messages, scheduling) and, through the web app's ingest path, the CV
-- service's analyses. Server code uses the service role key; nothing is reachable from a browser.

-- ---------- scheduling ----------
-- ids are opaque strings in the app (seeded ids like 'st_p_001_0'); generated ones stay uuids
alter table scheduled_tasks alter column id drop default;
alter table scheduled_tasks alter column id type text using id::text;
alter table scheduled_tasks alter column id set default gen_random_uuid()::text;
-- one check-in per task per due time, so scheduling is safe to repeat
alter table scheduled_tasks add constraint scheduled_tasks_once unique (participant_id, task_id, due_at);
create index on scheduled_tasks (participant_id, due_at);
alter table submissions add constraint submissions_scheduled_task_fkey
  foreign key (scheduled_task_id) references scheduled_tasks (id) on delete set null;

-- invite codes are typed by people: stored upper-case so a typed code matches exactly
update participants set invite_code = upper(invite_code) where invite_code <> upper(invite_code);
alter table participants add constraint participants_invite_code_upper check (invite_code = upper(invite_code));

create index on observations (submission_id);
create index on observations (study_id, captured_at);
create index on submissions (observation_id);
create index on audit_log (entity_id);
create index on audit_log (created_at);

-- ---------- reviews ----------
-- reviewers are named in the app (no sign-in yet), so record the name rather than an auth id
alter table reviews drop column reviewer_id;
alter table reviews add column reviewer text not null default 'unknown';
alter table reviews add column before_measurements jsonb;
create index on reviews (observation_id, created_at);

-- ---------- messaging agent ----------
create table agent_conversations (
  participant_id text primary key references participants (id) on delete cascade,
  channel text not null default 'photon',
  address text not null,                    -- phone number or handle the agent talks to
  state jsonb not null,                     -- services/agent ConvState
  last_prompted_at timestamptz,
  updated_at timestamptz not null default now()
);
create index on agent_conversations (address);

alter table messages
  add column scheduled_task_id text references scheduled_tasks (id) on delete set null,
  add column submission_id text references submissions (id) on delete set null,
  add column meta jsonb not null default '{}';
create index on messages (participant_id, created_at);

-- ---------- researcher toolkit ----------
-- condition builder drafts; approving one creates a study (status 'draft') and protocol v1
create table workflow_drafts (
  id text primary key,
  condition text not null,
  draft jsonb not null,                     -- WorkflowDraft
  source text not null check (source in ('claude', 'template')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded')),
  study_id text references studies (id) on delete set null,
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- "Generate with Droid": one row per request, updated from the GitHub Actions run
create table droid_jobs (
  id text primary key,
  study_id text references studies (id) on delete set null,
  module text not null,
  request jsonb not null,
  status text not null default 'requested' check (status in ('requested', 'dispatched', 'running', 'succeeded', 'failed')),
  run_id bigint,
  run_url text,
  pr_url text,
  error text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on droid_jobs (created_at);

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger touch before update on agent_conversations for each row execute function touch_updated_at();
create trigger touch before update on droid_jobs for each row execute function touch_updated_at();

alter table agent_conversations enable row level security;
alter table workflow_drafts enable row level security;
alter table droid_jobs enable row level security;
-- (no policies: server-only, through the service role)

-- ---------- one capture, one transaction ----------
-- The web app's ingest (lib/ingest.ts) decides everything (acceptance, rewards, the next
-- check-in) and hands the result here, so a capture is recorded completely or not at all.
-- Safe to repeat: every insert ignores rows that already exist, so a retried request can't
-- duplicate points or reset a reviewed observation.
create function record_capture(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb := payload -> 'submission';
  o jsonb := payload -> 'observation';
  t jsonb := payload -> 'scheduled_task';
  n jsonb := payload -> 'next_task';
  a jsonb := payload -> 'audit';
  obs_inserted boolean := false;
  task_updated boolean := false;
  rewards_inserted int := 0;
begin
  if o is not null and o <> 'null'::jsonb then
    insert into observations (id, study_id, participant_id, submission_id, module, task_label, captured_at, media_url,
      quality, measurements, features, model_version, patient_report, context, review_status)
    values (o->>'id', o->>'study_id', o->>'participant_id', o->>'submission_id', o->>'module', o->>'task_label',
      (o->>'captured_at')::timestamptz, o->>'media_url', o->'quality', o->'measurements', coalesce(o->'features', '{}'),
      o->>'model_version', coalesce(o->'patient_report', '{}'), coalesce(o->'context', '{}'), 'pending')
    on conflict (id) do nothing;
    obs_inserted := found;
  end if;

  insert into submissions (id, participant_id, study_id, task_id, scheduled_task_id, attempt, source, media_type, media_url,
    analysis_runtime, quality, accepted, observation_id, escalated, created_at)
  values (s->>'id', s->>'participant_id', s->>'study_id', s->>'task_id', s->>'scheduled_task_id', (s->>'attempt')::int,
    s->>'source', s->>'media_type', s->>'media_url', s->>'analysis_runtime', s->'quality', (s->>'accepted')::boolean,
    s->>'observation_id', (s->>'escalated')::boolean, (s->>'created_at')::timestamptz)
  on conflict (id) do nothing;

  insert into reward_events (id, participant_id, kind, points, reason, created_at)
  select e->>'id', e->>'participant_id', e->>'kind', (e->>'points')::int, e->>'reason', (e->>'created_at')::timestamptz
  from jsonb_array_elements(coalesce(payload -> 'reward_events', '[]')) e
  on conflict (id) do nothing;
  get diagnostics rewards_inserted = row_count;

  if t is not null and t <> 'null'::jsonb then
    update scheduled_tasks
       set status = t->>'status', completed_at = coalesce((t->>'completed_at')::timestamptz, completed_at)
     where id = t->>'id' and status in ('pending', 'prompted');
    task_updated := found;
  end if;

  if n is not null and n <> 'null'::jsonb then
    insert into scheduled_tasks (id, participant_id, task_id, due_at, window_hours, status)
    values (coalesce(n->>'id', gen_random_uuid()::text), n->>'participant_id', n->>'task_id', (n->>'due_at')::timestamptz,
      coalesce((n->>'window_hours')::int, 48), 'pending')
    on conflict do nothing;
  end if;

  if a is not null and a <> 'null'::jsonb then
    insert into audit_log (actor, action, entity, entity_id, detail)
    values (a->>'actor', a->>'action', a->>'entity', a->>'entity_id', a->'detail');
  end if;

  return jsonb_build_object('observation_inserted', obs_inserted, 'scheduled_task_updated', task_updated, 'rewards_inserted', rewards_inserted);
end $$;

revoke all on function record_capture(jsonb) from public, anon, authenticated;
grant execute on function record_capture(jsonb) to service_role;

-- ---------- storage ----------
-- Captures (photos, videos, poster frames) in one private bucket, under
-- studies/<study>/<participant>/<yyyy-mm>/<uuid>.<ext>. Browsers only ever see signed URLs.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/*', 'video/*']
 where id = 'media';
-- RLS on storage.objects is on by default; no policy grants anon or signed-in users access to
-- 'media', so only the service role (server code) and signed URLs can read or write it.
