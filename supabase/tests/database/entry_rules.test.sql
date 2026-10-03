-- Phase 3 entry rules: dates, vehicles, receipts, finalized months.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

-- ─── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'driver1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'driver2@test.local');

INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Car', 'Assigned', 2024, 'ER-1'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Car', 'Previous', 2024, 'ER-2'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Car', 'Finalized', 2024, 'ER-3'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Car', 'Other', 2024, 'ER-4');

INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Driver One', '00000000-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Driver Two', '00000000-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-000000000004');

-- Driver One also has pay terms on vehicles 2 and 3 (worked them recently).
INSERT INTO public.driver_compensation (driver_id, vehicle_id, compensation_type, commission_percentage, pay_frequency, effective_from) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'commission', 30, 'monthly', '2020-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'commission', 30, 'monthly', '2020-01-01');

-- A voucher ride from yesterday on vehicle 3, then vehicle 3's month is finalized.
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, payment_status, ride_date) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 80, 'Voucher', 'Outstanding', public.app_today() - 1);
INSERT INTO public.salary_calculations (vehicle_id, period_start, period_end, total_revenue, total_expenses, net_revenue, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003',
        date_trunc('month', (public.app_today() - 1)::timestamp)::date,
        (date_trunc('month', (public.app_today() - 1)::timestamp) + interval '1 month - 1 day')::date,
        80, 0, 80, 'finalized');

-- Receipt photos already uploaded to storage.
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('receipts', 'bbbbbbbb-0000-0000-0000-000000000001/2026-01-01/ok.jpg'),
  ('receipts', 'bbbbbbbb-0000-0000-0000-000000000002/2026-01-01/theirs.jpg');

-- ─── As Driver One ───────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';

SELECT lives_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 50, 'Cash', public.app_today() - 3) $$,
  'driver can log a ride from 3 days ago (offline grace)');
SELECT throws_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 50, 'Cash', public.app_today() + 1) $$,
  '23514', NULL, 'driver cannot date an entry in the future');
SELECT throws_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 50, 'Cash', public.app_today() - 10) $$,
  '23514', NULL, 'H6: driver cannot back-date more than 7 days');
SELECT lives_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 50, 'Cash', public.app_today() - 2) $$,
  'driver can log on a vehicle they had pay terms on that day (offline sync after reassignment)');
SELECT throws_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 50, 'Cash', public.app_today()) $$,
  '23514', NULL, 'H6: driver cannot log against a vehicle they do not drive');
SELECT throws_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 50, 'Cash', public.app_today() - 1) $$,
  '23514', NULL, 'H6: nobody can add an entry to a finalized month');
SELECT lives_ok($$ SELECT public.collect_voucher('cccccccc-0000-0000-0000-000000000001') $$,
  'collecting a voucher in a finalized month still works (no money changes)');

SELECT throws_ok($$ INSERT INTO public.expenses (driver_id, vehicle_id, amount, category, payment_method, receipt_image_url, expense_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 20, 'Fuel', 'Cash',
          'bbbbbbbb-0000-0000-0000-000000000001/2026-01-01/never-uploaded.jpg', public.app_today()) $$,
  '23514', NULL, 'M6: expense needs a receipt that was actually uploaded');
SELECT throws_ok($$ INSERT INTO public.expenses (driver_id, vehicle_id, amount, category, payment_method, receipt_image_url, expense_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 20, 'Fuel', 'Cash',
          'bbbbbbbb-0000-0000-0000-000000000002/2026-01-01/theirs.jpg', public.app_today()) $$,
  '23514', NULL, 'M6: expense cannot reuse another driver''s receipt');
SELECT lives_ok($$ INSERT INTO public.expenses (driver_id, vehicle_id, amount, category, payment_method, receipt_image_url, expense_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 20, 'Fuel', 'Cash',
          'bbbbbbbb-0000-0000-0000-000000000001/2026-01-01/ok.jpg', public.app_today()) $$,
  'expense with an uploaded receipt is accepted');

-- ─── Admin ───────────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT throws_ok($$ UPDATE public.rides SET amount = 1 WHERE id = 'cccccccc-0000-0000-0000-000000000001' $$,
  '23514', NULL, 'admin cannot change money inside a finalized month');
SELECT lives_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 50, 'Cash', public.app_today() - 30) $$,
  'admin can add an older entry to an open month');

RESET ROLE;
SELECT is((SELECT amount FROM public.rides WHERE id = 'cccccccc-0000-0000-0000-000000000001'), 80.00::numeric,
  'finalized-month ride amount unchanged');
SELECT throws_ok($$ INSERT INTO public.expenses (driver_id, vehicle_id, amount, category, payment_method, receipt_image_url, expense_date)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 20, 'Fuel', 'Cash', '', public.app_today()) $$,
  '23514', NULL, 'M6: an empty receipt path is rejected for everyone');

SELECT * FROM finish();
ROLLBACK;
