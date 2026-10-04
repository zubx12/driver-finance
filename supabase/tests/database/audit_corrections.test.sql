-- Phase 4: audit trail coverage and corrections that take effect.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(20);

-- ─── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'driver1@test.local');

INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('a4000000-0000-0000-0000-000000000001', 'Car', 'Open', 2024, 'AC-1'),
  ('a4000000-0000-0000-0000-000000000002', 'Car', 'Paid', 2024, 'AC-2');
INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id) VALUES
  ('b4000000-0000-0000-0000-000000000001', 'Driver One', '00000000-0000-0000-0000-0000000000d1', 'a4000000-0000-0000-0000-000000000001');

-- R1: today on the open vehicle. R2: first day of last month on vehicle 2,
-- whose last-month payout is then finalized.
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('c4000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 100, 'Cash', public.app_today()),
  ('c4000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 100, 'Cash',
   date_trunc('month', public.app_today()::timestamp - interval '1 month')::date),
  ('c4000000-0000-0000-0000-000000000003', 'b4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 30, 'Cash', public.app_today());
INSERT INTO public.salary_calculations (vehicle_id, period_start, period_end, total_revenue, total_expenses, net_revenue, status)
VALUES ('a4000000-0000-0000-0000-000000000002',
        date_trunc('month', public.app_today()::timestamp - interval '1 month')::date,
        (date_trunc('month', public.app_today()::timestamp - interval '1 month') + interval '1 month - 1 day')::date,
        100, 0, 100, 'finalized');

-- ─── Driver files requests ───────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';

SELECT lives_ok($$ INSERT INTO public.correction_requests (id, driver_id, record_type, record_id, reason) VALUES
  ('e4000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'ride', 'c4000000-0000-0000-0000-000000000001', 'Typed 100 instead of 80'),
  ('e4000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001', 'ride', 'c4000000-0000-0000-0000-000000000002', 'Fare was 150'),
  ('e4000000-0000-0000-0000-000000000003', 'b4000000-0000-0000-0000-000000000001', 'ride', 'c4000000-0000-0000-0000-000000000003', 'Not sure') $$,
  'driver can file correction requests');
SELECT throws_ok($$ INSERT INTO public.correction_requests (driver_id, record_type, record_id, reason, status)
  VALUES ('b4000000-0000-0000-0000-000000000001', 'ride', 'c4000000-0000-0000-0000-000000000001', 'x', 'approved') $$,
  '42501', NULL, 'driver cannot file an already-approved request');
SELECT throws_ok($$ SELECT * FROM public.get_audit_log() $$, '42501', NULL, 'driver cannot read the audit log');
SELECT throws_ok($$ SELECT public.apply_correction('e4000000-0000-0000-0000-000000000001', 1) $$,
  '42501', NULL, 'driver cannot approve corrections');

-- ─── Admin resolves them ─────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT is(public.apply_correction('e4000000-0000-0000-0000-000000000001', 80, NULL, 'Checked receipt'), 'edited',
  'open month: the entry itself is corrected');
SELECT is((SELECT amount FROM public.rides WHERE id = 'c4000000-0000-0000-0000-000000000001'), 80.00::numeric,
  'open month: ride amount is now 80');
SELECT throws_ok($$ SELECT public.apply_correction('e4000000-0000-0000-0000-000000000001', 70) $$,
  '22023', NULL, 'a resolved request cannot be applied twice');
SELECT is((SELECT resolution FROM public.correction_requests WHERE id = 'e4000000-0000-0000-0000-000000000001'), 'edited',
  'request records how it was resolved');

SELECT throws_ok($$ SELECT public.apply_correction('e4000000-0000-0000-0000-000000000002', 150, public.app_today()) $$,
  '22023', NULL, 'paid month: the date cannot be changed');
SELECT is(public.apply_correction('e4000000-0000-0000-0000-000000000002', 150), 'adjusted',
  'paid month: the correction becomes an adjustment');
SELECT is((SELECT amount FROM public.rides WHERE id = 'c4000000-0000-0000-0000-000000000002'), 100.00::numeric,
  'paid month: the paid ride is left untouched');
SELECT is((SELECT amount FROM public.salary_adjustments WHERE correction_request_id = 'e4000000-0000-0000-0000-000000000002'), 50.00::numeric,
  'adjustment carries the difference (+50 revenue)');
-- The engine's internal function is not callable by app users; check as owner.
RESET ROLE;
SELECT is((public._salary_compute('a4000000-0000-0000-0000-000000000002', public.app_today()) ->> 'adjustments_total')::numeric, 50.00,
  'this month''s payout for the vehicle includes the adjustment');
SELECT is((public._salary_compute('a4000000-0000-0000-0000-000000000002', public.app_today()) ->> 'net_revenue')::numeric, 50.00,
  'the adjustment raises the vehicle net');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT lives_ok($$ SELECT public.reject_correction('e4000000-0000-0000-0000-000000000003', 'Receipt matches') $$,
  'admin can reject a request');

-- ─── Audit trail ─────────────────────────────────────────────────────────────
SELECT ok((SELECT count(*) = 1 FROM public.get_audit_log(p_record_id => 'c4000000-0000-0000-0000-000000000001') WHERE action = 'INSERT'),
  'H7: creating a ride is recorded');
SELECT is((SELECT (changes -> 'amount' ->> 'to')::numeric FROM public.get_audit_log(p_record_id => 'c4000000-0000-0000-0000-000000000001') WHERE action = 'UPDATE'),
  80.00, 'the audit view shows the amount change');
SELECT is((SELECT actor FROM public.get_audit_log(p_record_id => 'c4000000-0000-0000-0000-000000000001') WHERE action = 'UPDATE'),
  'admin@test.local', 'the audit view names who made the change');

DELETE FROM public.rides WHERE id = 'c4000000-0000-0000-0000-000000000003';
SELECT ok((SELECT count(*) = 1 FROM public.get_audit_log(p_record_id => 'c4000000-0000-0000-0000-000000000003') WHERE action = 'DELETE'),
  'H7: deleting a ride is recorded');

-- Once this month's payout for vehicle 2 is finalized, its adjustment is frozen.
RESET ROLE;
INSERT INTO public.salary_calculations (vehicle_id, period_start, period_end, total_revenue, total_expenses, net_revenue, status)
VALUES ('a4000000-0000-0000-0000-000000000002',
        date_trunc('month', public.app_today()::timestamp)::date,
        (date_trunc('month', public.app_today()::timestamp) + interval '1 month - 1 day')::date,
        0, 0, 50, 'finalized');
SELECT throws_ok($$ DELETE FROM public.salary_adjustments WHERE correction_request_id = 'e4000000-0000-0000-0000-000000000002' $$,
  '42501', NULL, 'adjustments in a finalized month cannot be removed');

SELECT * FROM finish();
ROLLBACK;
