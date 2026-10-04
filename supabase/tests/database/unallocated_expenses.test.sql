-- Phase 3D (D5): review of driver/company expenses.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(13);

-- ─── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'driver1@test.local');

INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'Car', 'Open', 2024, 'UA-1'),
  ('dddddddd-0000-0000-0000-000000000002', 'Car', 'Finalized', 2024, 'UA-2');
INSERT INTO public.partners (id, name) VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'Partner');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 100, '2020-01-01'),
  ('dddddddd-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 100, '2020-01-01');
INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'Driver', '00000000-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-000000000001');
INSERT INTO public.driver_compensation (driver_id, vehicle_id, compensation_type, commission_percentage, pay_frequency, effective_from)
VALUES ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'commission', 50, 'monthly', '2020-01-01');

-- Revenue of 1,000 today on the open vehicle.
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
VALUES ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 1000, 'Cash', public.app_today());

-- This month is already finalized for the second vehicle.
INSERT INTO public.salary_calculations (vehicle_id, period_start, period_end, total_revenue, total_expenses, net_revenue, status)
VALUES ('dddddddd-0000-0000-0000-000000000002',
        date_trunc('month', public.app_today()::timestamp)::date,
        (date_trunc('month', public.app_today()::timestamp) + interval '1 month - 1 day')::date,
        0, 0, 0, 'finalized');

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('receipts', 'ffffffff-0000-0000-0000-000000000001/2026-01-01/meal.jpg');

-- ─── Driver files a company expense ──────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';

SELECT lives_ok($$ INSERT INTO public.expenses (id, driver_id, vehicle_id, allocation, amount, category, payment_method, receipt_image_url, expense_date)
  VALUES ('99999999-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', NULL, 'Company', 100, 'Office', 'Cash',
          'ffffffff-0000-0000-0000-000000000001/2026-01-01/meal.jpg', public.app_today()) $$,
  'driver can file a company expense');
SELECT throws_ok($$ UPDATE public.expenses SET review_status = 'charged', charged_vehicle_id = 'dddddddd-0000-0000-0000-000000000001'
  WHERE id = '99999999-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'driver cannot charge their own expense to a vehicle');
SELECT throws_ok($$ SELECT public.review_unallocated_expense('99999999-0000-0000-0000-000000000001', 'company_cost') $$,
  '42501', NULL, 'driver cannot use the review function');

-- ─── Office reviews it ───────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT is((SELECT review_status FROM public.expenses WHERE id = '99999999-0000-0000-0000-000000000001'), 'unreviewed',
  'new driver/company expenses start unreviewed');
SELECT lives_ok($$ SELECT public.review_unallocated_expense('99999999-0000-0000-0000-000000000001', 'charged', 'dddddddd-0000-0000-0000-000000000001') $$,
  'admin can charge it to a vehicle');

RESET ROLE;
SELECT is((public._salary_compute('dddddddd-0000-0000-0000-000000000001', public.app_today()) ->> 'charged_expenses')::numeric, 100.00,
  'D5: charged expense appears in the vehicle month');
SELECT is((SELECT sum((d ->> 'driver_pay_amount')::numeric) FROM jsonb_array_elements(
            public._salary_compute('dddddddd-0000-0000-0000-000000000001', public.app_today()) -> 'driver_pay') d), 500.00,
  'D5: driver commission is unaffected (50% of own net 1,000)');
SELECT is((SELECT (s ->> 'share_amount')::numeric FROM jsonb_array_elements(
            public._salary_compute('dddddddd-0000-0000-0000-000000000001', public.app_today()) -> 'shares') s), 400.00,
  'D5: partner pool is reduced (1,000 - 500 driver pay - 100 charged)');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT lives_ok($$ SELECT public.review_unallocated_expense('99999999-0000-0000-0000-000000000001', 'company_cost') $$,
  'admin can change it to a company cost');
SELECT throws_ok($$ SELECT public.review_unallocated_expense('99999999-0000-0000-0000-000000000001', 'charged', 'dddddddd-0000-0000-0000-000000000002') $$,
  '23514', NULL, 'nothing can be charged into a finalized month');
SELECT throws_ok($$ SELECT public.review_unallocated_expense('99999999-0000-0000-0000-000000000001', 'charged') $$,
  '22023', NULL, 'charging requires a vehicle');

RESET ROLE;
SELECT is((public._salary_compute('dddddddd-0000-0000-0000-000000000001', public.app_today()) ->> 'charged_expenses')::numeric, 0.00,
  'company cost no longer affects the vehicle');
SELECT ok((SELECT count(*) > 0 FROM public.audit_log WHERE record_id = '99999999-0000-0000-0000-000000000001'),
  'review decisions are written to the audit log');

SELECT * FROM finish();
ROLLBACK;
