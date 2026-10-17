-- Visual Follow-Up Platform: initial schema.
-- Observation columns mirror packages/shared/src/schemas.ts (PRD §4 common format).

create extension if not exists "pgcrypto";

-- ---------- people ----------
create table researchers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  institution text,
  created_at timestamptz not null default now()
);

create table studies (
  id text primary key,
  name text not null,
  condition text not null,                  -- 'parkinsons' | 'eczema' | ...
  owner_id uuid references researchers (id),
  status text not null default 'active' check (status in ('draft', 'active', 'closed')),
  created_at timestamptz not null default now()
);

create table study_members (
  study_id text references studies (id) on delete cascade,
  researcher_id uuid references researchers (id) on delete cascade,
  role text not null default 'investigator' check (role in ('investigator', 'coordinator', 'reviewer')),
  primary key (study_id, researcher_id)
);

-- Versioned protocol: tasks (module configs) + reward rules as JSON validated by the shared zod schema.
create table protocols (
  id uuid primary key default gen_random_uuid(),
  study_id text not null references studies (id) on delete cascade,
  version int not null,
  config jsonb not null,
  approved_by uuid references researchers (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (study_id, version)
);

create table participants (
  id text primary key,
  study_id text not null references studies (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,   -- set when they create an account
  display_name text not null,
  phone text unique,                        -- Photon address
  invite_code text unique not null,
  preferred_time time,
  timezone text default 'America/New_York',
  consented_at timestamptz,
  status text not null default 'invited' check (status in ('invited', 'active', 'paused', 'withdrawn', 'completed')),
  enrolled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- collection ----------
create table scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null references participants (id) on delete cascade,
  task_id text not null,                    -- TaskConfig.id within the protocol
  due_at timestamptz not null,
  window_hours int not null default 48,
  status text not null default 'pending' check (status in ('pending', 'prompted', 'completed', 'missed', 'escalated')),
  prompted_at timestamptz,
  completed_at timestamptz
);
create index on scheduled_tasks (status, due_at);

create table submissions (
  id text primary key,
  participant_id text not null references participants (id) on delete cascade,
  scheduled_task_id uuid references scheduled_tasks (id),
  task_id text not null,
  attempt int not null default 1,
  media_path text,                          -- Supabase Storage path in the 'media' bucket
  quality jsonb,                            -- QualityReport
  accepted boolean,
  created_at timestamptz not null default now()
);

create table observations (
  id text primary key,
  study_id text not null references studies (id) on delete cascade,
  participant_id text not null references participants (id) on delete cascade,
  submission_id text not null,
  module text not null,
  task_label text not null,
  captured_at timestamptz not null,
  media_url text,
  quality jsonb not null,
  measurements jsonb not null,              -- Measurement[] with value, unit, uncertainty, validation_status
  model_version text not null,
  patient_report jsonb not null default '{}',
  context jsonb not null default '{}',
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'corrected', 'rejected')),
  reviewer text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index on observations (participant_id, captured_at);
create index on observations (study_id, review_status);

-- Every clinician decision, including corrections to individual measurements.
create table reviews (
  id uuid primary key default gen_random_uuid(),
  observation_id text not null references observations (id) on delete cascade,
  reviewer_id uuid references researchers (id),
  decision text not null check (decision in ('accepted', 'corrected', 'rejected')),
  corrected_measurements jsonb,
  note text,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  participant_id text references participants (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  channel text not null default 'photon',
  body text,
  media_path text,
  created_at timestamptz not null default now()
);

-- ---------- rewards (simulated) ----------
create table reward_events (
  id text primary key,
  participant_id text not null references participants (id) on delete cascade,
  kind text not null check (kind in ('submission_accepted', 'on_time_bonus', 'streak_bonus', 'badge', 'redemption')),
  points int not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index on reward_events (participant_id);

create table redemptions (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null references participants (id) on delete cascade,
  tier text not null,
  points int not null,
  payout_label text not null,
  mock_code text not null,                  -- simulated; no real payment is issued
  created_at timestamptz not null default now()
);

-- ---------- audit ----------
create table audit_log (
  id bigint generated always as identity primary key,
  actor text not null,                      -- 'agent', 'cv', researcher id, participant id
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------- row level security ----------
-- Server code (agent, API routes) uses the service role key and bypasses RLS.
alter table researchers enable row level security;
alter table studies enable row level security;
alter table study_members enable row level security;
alter table protocols enable row level security;
alter table participants enable row level security;
alter table scheduled_tasks enable row level security;
alter table submissions enable row level security;
alter table observations enable row level security;
alter table reviews enable row level security;
alter table messages enable row level security;
alter table reward_events enable row level security;
alter table redemptions enable row level security;
alter table audit_log enable row level security;

create function is_study_member(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from study_members where study_id = sid and researcher_id = auth.uid())
      or exists (select 1 from studies where id = sid and owner_id = auth.uid());
$$;

create function my_participant_id() returns text
language sql stable security definer set search_path = public as $$
  select id from participants where user_id = auth.uid();
$$;

create policy "self" on researchers for all using (id = auth.uid());
create policy "members read studies" on studies for select using (is_study_member(id));
create policy "members read membership" on study_members for select using (is_study_member(study_id));
create policy "members read protocols" on protocols for select using (is_study_member(study_id));
create policy "members manage participants" on participants for all using (is_study_member(study_id));
create policy "participant reads self" on participants for select using (user_id = auth.uid());
create policy "members read observations" on observations for select using (is_study_member(study_id));
create policy "members review observations" on observations for update using (is_study_member(study_id));
create policy "participant reads own observations" on observations for select using (participant_id = my_participant_id());
create policy "members read reviews" on reviews for select using (
  exists (select 1 from observations o where o.id = observation_id and is_study_member(o.study_id)));
create policy "participant reads own rewards" on reward_events for select using (participant_id = my_participant_id());
create policy "participant reads own redemptions" on redemptions for select using (participant_id = my_participant_id());
create policy "participant reads own tasks" on scheduled_tasks for select using (participant_id = my_participant_id());

-- Media bucket (private; access through signed URLs).
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict do nothing;
