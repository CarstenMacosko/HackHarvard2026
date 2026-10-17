-- Demo data for `supabase db reset`. All participants are synthetic.
-- The web app's built-in demo mode (apps/web/lib/demo-data.ts) generates 6 weeks of matching history.

insert into studies (id, name, condition, status) values
  ('study_pd', 'PD-FOLLOW: post-trial motor follow-up', 'parkinsons', 'active'),
  ('study_ad', 'AD-SKIN: atopic dermatitis extension follow-up', 'eczema', 'active');

insert into participants (id, study_id, display_name, phone, invite_code, status, consented_at, enrolled_at) values
  ('p_001', 'study_pd', 'Participant 001', '+15550000001', 'PD-7Q2K', 'active', now() - interval '42 days', now() - interval '42 days'),
  ('p_002', 'study_pd', 'Participant 002', '+15550000003', 'PD-9XMA', 'active', now() - interval '40 days', now() - interval '40 days'),
  ('p_003', 'study_pd', 'Participant 003', '+15550000004', 'PD-4HBT', 'active', now() - interval '35 days', now() - interval '35 days'),
  ('p_004', 'study_pd', 'Participant 004', null, 'PD-JOIN', 'invited', null, null),
  ('p_101', 'study_ad', 'Participant 101', '+15550000002', 'AD-3LWE', 'active', now() - interval '42 days', now() - interval '42 days'),
  ('p_102', 'study_ad', 'Participant 102', '+15550000005', 'AD-8RNV', 'active', now() - interval '38 days', now() - interval '38 days'),
  ('p_103', 'study_ad', 'Participant 103', '+15550000006', 'AD-2PZC', 'paused', now() - interval '30 days', now() - interval '30 days'),
  ('p_104', 'study_ad', 'Participant 104', null, 'AD-JOIN', 'invited', null, null);
