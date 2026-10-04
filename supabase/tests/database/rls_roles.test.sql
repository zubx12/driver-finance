-- Phase 1 remediation tests: role source, cross-account isolation, voucher bypass.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(16);

-- ─── Fixtures (as the migration owner, RLS bypassed) ──────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'driver1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'driver2@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'partner1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'partner2@test.local');

INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2024, 'TEST-1'),
  ('10000000-0000-0000-0000-000000000002', 'Hyundai', 'Staria', 2024, 'TEST-2');

INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Driver One', '00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Driver Two', '00000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-000000000002');

INSERT INTO public.partners (id, name, linked_auth_id) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Partner One', '00000000-0000-0000-0000-0000000000e1'),
  ('30000000-0000-0000-0000-000000000002', 'Partner Two', '00000000-0000-0000-0000-0000000000e2');

INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 100, '2026-01-01'),
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 100, '2026-01-01');

-- r1: driver 1, five days ago, outstanding voucher (the C2 target)
-- r2: driver 1, today, cash
-- r3: driver 2, five days ago, outstanding voucher
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, payment_status, ride_date) VALUES
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 100, 'Voucher', 'Outstanding', public.app_today() - 5),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 50, 'Cash', 'Received', public.app_today()),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 70, 'Voucher', 'Outstanding', public.app_today() - 5);

INSERT INTO public.audit_log (table_name, record_id, field_changed, old_value, new_value)
VALUES ('rides', '40000000-0000-0000-0000-000000000001', 'amount', '90', '100');

-- ─── Driver 1 who has tampered with user_metadata to claim admin ──────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"},"user_metadata":{"role":"admin"}}';

SELECT is((SELECT count(*) FROM public.partners), 0::bigint,
  'C1: user_metadata.role=admin does not grant access to partners');
SELECT is((SELECT count(*) FROM public.rides), 2::bigint,
  'driver sees only own rides');
SELECT is((SELECT count(*) FROM public.rides WHERE driver_id = '20000000-0000-0000-0000-000000000002'), 0::bigint,
  'driver cannot see another driver''s rides');
SELECT is((SELECT count(*) FROM public.audit_log), 0::bigint,
  'driver cannot read the audit log');

-- C2: attempt to rewrite a past voucher ride while "collecting" it
UPDATE public.rides SET amount = 1, payment_status = 'Collected'
WHERE id = '40000000-0000-0000-0000-000000000001';
-- same-day edit is still allowed
UPDATE public.rides SET amount = 55 WHERE id = '40000000-0000-0000-0000-000000000002';

SELECT lives_ok($$ SELECT public.collect_voucher('40000000-0000-0000-0000-000000000001') $$,
  'driver can collect own voucher through collect_voucher');
SELECT throws_ok($$ SELECT public.collect_voucher('40000000-0000-0000-0000-000000000003') $$,
  '42501', NULL, 'driver cannot collect another driver''s voucher');

RESET ROLE;
SELECT is((SELECT amount FROM public.rides WHERE id = '40000000-0000-0000-0000-000000000001'), 100.00::numeric,
  'C2: past voucher amount unchanged by direct update');
SELECT is((SELECT payment_status FROM public.rides WHERE id = '40000000-0000-0000-0000-000000000001'), 'Collected',
  'collect_voucher set the status');
SELECT is((SELECT collected_by_role FROM public.rides WHERE id = '40000000-0000-0000-0000-000000000001'), 'driver',
  'collect_voucher recorded the collector role');
SELECT is((SELECT amount FROM public.rides WHERE id = '40000000-0000-0000-0000-000000000002'), 55.00::numeric,
  'same-day edit still works');

-- ─── Partner 1 ────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"partner"}}';

SELECT is((SELECT count(*) FROM public.rides WHERE vehicle_id = '10000000-0000-0000-0000-000000000002'), 0::bigint,
  'partner cannot see rides of a vehicle they are not linked to');
SELECT is((SELECT count(*) FROM public.vehicle_partners), 1::bigint,
  'partner sees only their own ownership rows');
UPDATE public.rides SET amount = 1 WHERE id = '40000000-0000-0000-0000-000000000002';

RESET ROLE;
SELECT is((SELECT amount FROM public.rides WHERE id = '40000000-0000-0000-0000-000000000002'), 55.00::numeric,
  'partner cannot update rides');

-- ─── Admin (role in app_metadata) ────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT is((SELECT count(*) FROM public.partners), 2::bigint, 'admin reads all partners');
DELETE FROM public.audit_log;
SELECT is((SELECT count(*) FROM public.audit_log) > 0, true, 'admin can read the audit log');

RESET ROLE;
SELECT is((SELECT count(*) FROM public.audit_log WHERE field_changed = 'amount' AND new_value = '100'), 1::bigint,
  'admin cannot delete audit history');

SELECT * FROM finish();
ROLLBACK;
