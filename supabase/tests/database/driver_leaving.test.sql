-- L2: a driver leaving (Active -> Leaving -> Left).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(17);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('d7700000-0000-0000-0000-000000000001', 'Car', 'Leave', 2024, 'LEAVE-1');
INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id) VALUES
  ('d7720000-0000-0000-0000-000000000001', 'Leaving Driver', '00000000-0000-0000-0000-0000000000d1', 'd7700000-0000-0000-0000-000000000001');
UPDATE public.driver_employment_periods SET joined_on = public.app_today() - 60
WHERE driver_id = 'd7720000-0000-0000-0000-000000000001';
INSERT INTO public.driver_compensation
  (driver_id, vehicle_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, pay_frequency, effective_from) VALUES
  ('d7720000-0000-0000-0000-000000000001', 'd7700000-0000-0000-0000-000000000001', 'commission', 30, NULL, 0, 'monthly', public.app_today() - 60);
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('d7720000-0000-0000-0000-000000000001', 'd7700000-0000-0000-0000-000000000001', 400, 'Cash', public.app_today() - 5);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT public.start_driver_leaving('d7720000-0000-0000-0000-000000000001', public.app_today(), 'resigned') $$,
  '42501', NULL, 'a driver cannot start their own leaving');

-- ─── Office starts leaving ───────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT throws_ok($$ SELECT public.start_driver_leaving('d7720000-0000-0000-0000-000000000001', public.app_today() + 1, 'resigned') $$,
  '22023', NULL, 'the last working day cannot be in the future');
SELECT throws_ok($$ SELECT public.start_driver_leaving('d7720000-0000-0000-0000-000000000001', public.app_today() - 3, ' ') $$,
  '22023', NULL, 'a reason is required');
SELECT throws_ok($$ SELECT public.start_driver_leaving('d7720000-0000-0000-0000-000000000001', public.app_today() - 6, 'resigned') $$,
  '55000', NULL, 'not before entries the driver already has (a ride 5 days ago)');
SELECT throws_ok($$ UPDATE public.drivers SET status = 'Left' WHERE id = 'd7720000-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'the status cannot be set to Left by hand');
SELECT lives_ok($$ SELECT public.start_driver_leaving('d7720000-0000-0000-0000-000000000001', public.app_today() - 3, 'Resigned, going home') $$,
  'the office starts leaving with the last working day 3 days ago');

SELECT is((SELECT status FROM public.drivers WHERE id = 'd7720000-0000-0000-0000-000000000001'), 'Leaving', 'status is Leaving');
SELECT is((SELECT vehicle_id FROM public.drivers WHERE id = 'd7720000-0000-0000-0000-000000000001'), NULL, 'the vehicle is released');
SELECT is((SELECT effective_to FROM public.driver_compensation WHERE driver_id = 'd7720000-0000-0000-0000-000000000001'),
  public.app_today() - 2, 'pay terms end on the last working day');
SELECT throws_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('d7720000-0000-0000-0000-000000000001', 'd7700000-0000-0000-0000-000000000001', 50, 'Cash', public.app_today() - 1) $$,
  '23514', NULL, 'nobody can add a ride after the last working day');

-- ─── While leaving, the driver can still finish up ───────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT lives_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('d7720000-0000-0000-0000-000000000001', 'd7700000-0000-0000-0000-000000000001', 70, 'Cash', public.app_today() - 3) $$,
  'the driver can still upload a ride from the last working day (offline phone)');
SELECT lives_ok($$ INSERT INTO public.cash_handovers (driver_id, amount, handover_date)
  VALUES ('d7720000-0000-0000-0000-000000000001', 470, public.app_today()) $$,
  'the driver can hand over the cash after the last day');

-- ─── Keep the driver after all ───────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT lives_ok($$ SELECT public.cancel_driver_leaving('d7720000-0000-0000-0000-000000000001') $$, 'the office can cancel leaving');
SELECT is((SELECT status || ' ' || coalesce(last_working_day::text, 'none')
           FROM public.drivers d JOIN public.driver_employment_periods p ON p.driver_id = d.id
           WHERE d.id = 'd7720000-0000-0000-0000-000000000001'), 'Active none', 'back to Active, last working day cleared');
RESET ROLE;

-- ─── Left: the database shuts the driver out (status set by clearance, L3) ──
SELECT public.start_driver_leaving('d7720000-0000-0000-0000-000000000001', public.app_today(), 'Contract ended')
FROM (SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}', true)) c;
UPDATE public.drivers SET status = 'Left' WHERE id = 'd7720000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT is(public.my_driver_id(), NULL, 'a Left driver is no longer recognised as a driver');
SELECT is((SELECT count(*) FROM public.rides), 0::bigint, 'a Left driver sees no data');
SELECT throws_ok($$ INSERT INTO public.cash_handovers (driver_id, amount, handover_date)
  VALUES ('d7720000-0000-0000-0000-000000000001', 10, public.app_today()) $$,
  '42501', NULL, 'a Left driver cannot add anything');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
