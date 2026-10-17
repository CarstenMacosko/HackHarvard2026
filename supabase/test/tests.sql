-- Database tests: run by supabase/test/run.sh after setup.sql (+ seed_demo.sql).
-- Everything runs in one transaction and is rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- a check-in to record against
insert into scheduled_tasks (id, participant_id, task_id, due_at, status)
values ('st_test_open', 'p_001', 'pd_finger_tap_right', now() + interval '200 days', 'pending');

-- ---------- accepted capture ----------
select pg_temp.check(
  (select record_capture(jsonb_build_object(
    'submission', jsonb_build_object('id', 'sub_t1', 'participant_id', 'p_001', 'study_id', 'study_pd', 'task_id', 'pd_finger_tap_right',
      'scheduled_task_id', 'st_test_open', 'attempt', 1, 'source', 'web', 'media_type', 'video', 'media_url', '/api/media/s/studies/study_pd/p_001/x.webm',
      'analysis_runtime', 'on-device', 'quality', '{"accepted": true, "checks": [], "retry_instructions": null}'::jsonb, 'accepted', true,
      'observation_id', 'obs_t1', 'escalated', false, 'created_at', now()),
    'observation', jsonb_build_object('id', 'obs_t1', 'study_id', 'study_pd', 'participant_id', 'p_001', 'submission_id', 'sub_t1',
      'module', 'finger_tapping', 'task_label', 'Finger tapping: right hand', 'captured_at', now(), 'media_url', '/api/media/s/studies/study_pd/p_001/x.webm',
      'quality', '{"accepted": true, "checks": [], "retry_instructions": null}'::jsonb,
      'measurements', '[{"name": "tap_rate_hz", "label": "Tap rate", "value": 2.5, "unit": "Hz", "uncertainty": null, "validation_status": "reusable_needs_validation"}]'::jsonb,
      'features', '{"tap_rate_hz": 2.5}'::jsonb, 'model_version', 'finger_tapping@0.4.0', 'patient_report', '{"hand": "Right"}'::jsonb,
      'context', '{"trim_start_s": 3.7}'::jsonb),
    'reward_events', '[{"id": "sub_t1:base", "participant_id": "p_001", "kind": "submission_accepted", "points": 50, "reason": "Usable check-in", "created_at": "2026-10-17T12:00:00Z"},
                       {"id": "sub_t1:on_time", "participant_id": "p_001", "kind": "on_time_bonus", "points": 10, "reason": "On time", "created_at": "2026-10-17T12:00:00Z"}]'::jsonb,
    'scheduled_task', jsonb_build_object('id', 'st_test_open', 'status', 'completed', 'completed_at', now()),
    'next_task', jsonb_build_object('participant_id', 'p_001', 'task_id', 'pd_finger_tap_right', 'due_at', now() + interval '207 days', 'window_hours', 48),
    'audit', jsonb_build_object('actor', 'p_001', 'action', 'submission.accepted', 'entity', 'submission', 'entity_id', 'sub_t1', 'detail', '{}'::jsonb)
  ))) = '{"observation_inserted": true, "scheduled_task_updated": true, "rewards_inserted": 2}'::jsonb,
  'record_capture reports what it wrote');
select pg_temp.check((select review_status = 'pending' and context->>'trim_start_s' = '3.7' from observations where id = 'obs_t1'), 'observation stored as pending with its context');
select pg_temp.check((select observation_id = 'obs_t1' and accepted from submissions where id = 'sub_t1'), 'submission linked to the observation');
select pg_temp.check((select sum(points) from reward_events where id like 'sub_t1:%') = 60, 'points awarded');
select pg_temp.check((select status = 'completed' and completed_at is not null from scheduled_tasks where id = 'st_test_open'), 'check-in completed');
select pg_temp.check((select count(*) from scheduled_tasks where participant_id = 'p_001' and status = 'pending' and due_at > now() + interval '206 days') = 1, 'next check-in scheduled');
select pg_temp.check((select count(*) from audit_log where entity_id = 'sub_t1') = 1, 'audited');

-- ---------- retried request: nothing duplicated, a reviewed observation is not reset ----------
update observations set review_status = 'accepted', reviewer = 'Dr. Test' where id = 'obs_t1';
select pg_temp.check(
  (select record_capture(jsonb_build_object(
    'submission', (select to_jsonb(s) from submissions s where id = 'sub_t1'),
    'observation', (select to_jsonb(o) - 'review_status' from observations o where id = 'obs_t1'),
    'reward_events', '[{"id": "sub_t1:base", "participant_id": "p_001", "kind": "submission_accepted", "points": 50, "reason": "Usable check-in", "created_at": "2026-10-17T12:00:00Z"}]'::jsonb,
    'scheduled_task', jsonb_build_object('id', 'st_test_open', 'status', 'completed', 'completed_at', now()),
    'next_task', jsonb_build_object('participant_id', 'p_001', 'task_id', 'pd_finger_tap_right', 'due_at', (select max(due_at) from scheduled_tasks where participant_id = 'p_001'))
  ))) = '{"observation_inserted": false, "scheduled_task_updated": false, "rewards_inserted": 0}'::jsonb,
  'a repeated capture changes nothing');
select pg_temp.check((select review_status = 'accepted' and reviewer = 'Dr. Test' from observations where id = 'obs_t1'), 'review kept');
select pg_temp.check((select sum(points) from reward_events where id like 'sub_t1:%') = 60, 'no double points');
select pg_temp.check((select count(*) from scheduled_tasks where participant_id = 'p_001' and due_at > now() + interval '206 days') = 1, 'no duplicate check-in');

-- ---------- third unusable attempt escalates, atomically ----------
insert into scheduled_tasks (id, participant_id, task_id, due_at, status) values ('st_test_esc', 'p_101', 'ad_photo_left_elbow', now() + interval '300 days', 'prompted');
select pg_temp.check((select record_capture(jsonb_build_object(
  'submission', jsonb_build_object('id', 'sub_t3', 'participant_id', 'p_101', 'study_id', 'study_ad', 'task_id', 'ad_photo_left_elbow',
    'scheduled_task_id', 'st_test_esc', 'attempt', 3, 'source', 'sms', 'media_type', 'photo', 'analysis_runtime', 'server',
    'quality', '{"accepted": false, "checks": [], "retry_instructions": "Too dark"}'::jsonb, 'accepted', false, 'escalated', true, 'created_at', now()),
  'observation', null,
  'scheduled_task', jsonb_build_object('id', 'st_test_esc', 'status', 'escalated')))) ->> 'scheduled_task_updated' = 'true', 'unusable capture recorded');
select pg_temp.check((select status from scheduled_tasks where id = 'st_test_esc') = 'escalated', 'prompted check-in escalated');
select pg_temp.check((select escalated and not accepted from submissions where id = 'sub_t3'), 'escalated attempt recorded');

do $$ begin
  perform record_capture('{"submission": {"id": "sub_bad", "participant_id": "nobody"}}'::jsonb);
  raise exception 'FAILED: a capture for an unknown participant was accepted';
exception when not_null_violation or foreign_key_violation then
  raise notice 'ok - an invalid capture is rejected as a whole';
end $$;

-- ---------- constraints ----------
do $$ begin
  insert into participants (id, study_id, display_name, invite_code) values ('p_dup', 'study_pd', 'Dup', (select invite_code from participants where id = 'p_001'));
  raise exception 'FAILED: duplicate invite code accepted';
exception when unique_violation then raise notice 'ok - invite codes are unique';
end $$;
do $$ begin
  insert into participants (id, study_id, display_name, invite_code) values ('p_low', 'study_pd', 'Low', 'pd-lower');
  raise exception 'FAILED: lower-case invite code accepted';
exception when check_violation then raise notice 'ok - invite codes are stored upper-case';
end $$;
do $$ begin
  insert into scheduled_tasks (participant_id, task_id, due_at) select participant_id, task_id, due_at from scheduled_tasks where id = 'st_test_open';
  raise exception 'FAILED: duplicate check-in accepted';
exception when unique_violation then raise notice 'ok - one check-in per task and due time';
end $$;
with t as (insert into scheduled_tasks (participant_id, task_id, due_at) values ('p_201', 'pd_rest_tremor_right', now() + interval '400 days') returning id)
select pg_temp.check((select id ~ '^[0-9a-f-]{36}$' from t), 'generated check-in ids are uuids');

-- ---------- browsers see nothing ----------
set local role anon;
select pg_temp.check((select count(*) from observations) = 0, 'anon reads no observations');
select pg_temp.check((select count(*) from participants) = 0, 'anon reads no participants');
select pg_temp.check((select count(*) from agent_conversations) = 0, 'anon reads no conversations');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'media') = 0, 'anon lists no media');
do $$ begin
  perform record_capture('{}'::jsonb);
  raise exception 'FAILED: anon may call record_capture';
exception when insufficient_privilege then raise notice 'ok - anon cannot call record_capture';
end $$;
reset role;
set local role authenticated;
select pg_temp.check((select count(*) from observations) = 0, 'a signed-in stranger reads no observations');
reset role;

-- ---------- storage bucket ----------
select pg_temp.check((select not public and file_size_limit = 52428800 and allowed_mime_types = array['image/*', 'video/*'] from storage.buckets where id = 'media'), 'media bucket is private, 50 MB, image/video only');

rollback;
\echo 'all database tests passed'
