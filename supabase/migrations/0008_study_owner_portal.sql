-- Portal researcher ownership for studies (app uses portal_users, not auth.users researchers).
-- Service-role backend enforces access in app code; column is the source of truth.

alter table studies
  add column if not exists owner_portal_user_id text;

create index if not exists studies_owner_portal_user_id_idx
  on studies (owner_portal_user_id)
  where owner_portal_user_id is not null;
