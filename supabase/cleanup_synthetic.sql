-- Removes the synthetic demo data an earlier setup.sql / seed_demo.sql put in a project, keeping
-- everything real. Paste into the Supabase SQL editor once; safe to run again.
--
-- Seeded rows have recognisable ids (obs_p_…, sub_p_…, st_p_…); real uploads never do
-- (obs_<random>, sub_<random>, uuid check-ins). The seeded participant accounts are removed only
-- if nobody has uploaded anything with them. The three study definitions and the accounts
-- p_001, p_101, p_201 (plus the open invitations p_006, p_106, p_204) stay.
begin;

-- points, history and reviews generated for the demo (reviews go with their observations)
delete from reward_events where id like 'sub\_p\_%';
delete from audit_log where entity_id like 'obs\_p\_%' or entity_id like 'sub\_p\_%';
delete from submissions where id like 'sub\_p\_%';
delete from observations where id like 'obs\_p\_%';
delete from scheduled_tasks t
 where t.id like 'st\_p\_%'
   and not exists (select 1 from submissions s where s.scheduled_task_id = t.id);

-- the generated participants, unless someone has really used the account
delete from participants p
 where p.id in ('p_002', 'p_003', 'p_004', 'p_005', 'p_102', 'p_103', 'p_104', 'p_105', 'p_202', 'p_203')
   and not exists (select 1 from submissions s where s.participant_id = p.id)
   and not exists (select 1 from observations o where o.participant_id = p.id);

-- the kept demo accounts no longer pretend to have six weeks of history
update participants set enrolled_at = now(), consented_at = now()
 where id in ('p_001', 'p_101', 'p_201')
   and not exists (select 1 from submissions s where s.participant_id = participants.id);

commit;

select 'participants' as table_name, count(*) as rows from participants
union all select 'observations', count(*) from observations
union all select 'submissions', count(*) from submissions
union all select 'reward_events', count(*) from reward_events;
