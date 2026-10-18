-- Portal accounts (email/password), per-participant task assignment, freeform observation notes.

create table if not exists portal_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('researcher', 'participant')),
  display_name text not null,
  participant_id text references participants (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists portal_users_email_idx on portal_users (email);
alter table portal_users enable row level security;

-- null enabled_task_ids = all protocol tasks; otherwise only listed task ids are scheduled/shown
alter table participants add column if not exists enabled_task_ids jsonb;
-- map of task_id → custom capture instructions for that participant
alter table participants add column if not exists task_instructions jsonb not null default '{}'::jsonb;

create table if not exists observation_notes (
  id text primary key,
  observation_id text not null references observations (id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists observation_notes_obs_idx on observation_notes (observation_id, created_at);
alter table observation_notes enable row level security;
