-- Phase 7B: cash handovers submitted by drivers and confirmed by the office.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('b8000000-0000-0000-0000-000000000001', 'Ali', '00000000-0000-0000-0000-0000000000d1'),
  ('b8000000-0000-0000-0000-000000000002', 'Omar', '00000000-0000-0000-0000-0000000000d2');

-- ─── Driver submits ──────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';

SELECT lives_ok($$ INSERT INTO public.cash_handovers (id, driver_id, amount, handover_date, handed_to)
  VALUES ('c8000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001', 3000, public.app_today(), 'Office manager') $$,
  'a driver can submit a handover');
SELECT lives_ok($$ INSERT INTO public.cash_handovers (id, driver_id, amount, handover_date)
  VALUES ('c8000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001', 3000, public.app_today())
  ON CONFLICT (id) DO NOTHING $$,
  'sync: re-sending the same handover is accepted');
SELECT is((SELECT count(*) FROM public.cash_handovers), 1::bigint, 'sync: re-sending does not duplicate it');
SELECT throws_ok($$ INSERT INTO public.cash_handovers (driver_id, amount, handover_date, status, reviewed_at)
  VALUES ('b8000000-0000-0000-0000-000000000001', 500, public.app_today(), 'confirmed', now()) $$,
  '42501', NULL, 'a driver cannot submit a handover as already confirmed');
SELECT throws_ok($$ INSERT INTO public.cash_handovers (driver_id, amount, handover_date)
  VALUES ('b8000000-0000-0000-0000-000000000001', 500, public.app_today() - 10) $$,
  '23514', NULL, 'a driver cannot back-date a handover more than 7 days');
UPDATE public.cash_handovers SET amount = 9999 WHERE id = 'c8000000-0000-0000-0000-000000000001';
SELECT throws_ok($$ SELECT public.review_cash_handover('c8000000-0000-0000-0000-000000000001', 'confirmed') $$,
  '42501', NULL, 'a driver cannot confirm their own handover');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT is((SELECT count(*) FROM public.cash_handovers), 0::bigint, 'another driver cannot see it');

-- ─── Office reviews ──────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT is((SELECT amount FROM public.cash_handovers WHERE id = 'c8000000-0000-0000-0000-000000000001'), 3000.00::numeric,
  'the driver could not change the amount after submitting');
SELECT throws_ok($$ SELECT public.review_cash_handover('c8000000-0000-0000-0000-000000000001', 'disputed') $$,
  '22023', NULL, 'disputing needs a reason');
SELECT lives_ok($$ SELECT public.review_cash_handover('c8000000-0000-0000-0000-000000000001', 'disputed', 'Only 2,800 received') $$,
  'the office can dispute a handover');
SELECT lives_ok($$ SELECT public.review_cash_handover('c8000000-0000-0000-0000-000000000001', 'confirmed', 'Driver brought the rest') $$,
  'a disputed handover can be confirmed later');
SELECT ok((SELECT count(*) >= 3 FROM public.get_audit_log(p_record_id => 'c8000000-0000-0000-0000-000000000001')),
  'submission and every review are in the audit log');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
