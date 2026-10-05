-- W1: driver codes and the admin driver page's data (get_driver_profile).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(13);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'p1@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('b8800000-0000-0000-0000-000000000001', 'Toyota', 'Hiace', 2023, 'WS-1');
INSERT INTO public.partners (id, name, linked_auth_id) VALUES
  ('b8810000-0000-0000-0000-000000000001', 'Workspace Partner', '00000000-0000-0000-0000-0000000000e1');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('b8800000-0000-0000-0000-000000000001', 'b8810000-0000-0000-0000-000000000001', 100, '2026-01-01');

-- ─── Driver codes ────────────────────────────────────────────────────────────
INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id, driver_code) VALUES
  ('b8820000-0000-0000-0000-000000000001', 'Workspace Driver', '00000000-0000-0000-0000-0000000000d1',
   'b8800000-0000-0000-0000-000000000001', 'DRV-99999');
INSERT INTO public.drivers (id, name) VALUES ('b8820000-0000-0000-0000-000000000002', 'Next Driver');

SELECT ok((SELECT driver_code ~ '^DRV-[0-9]{5,}$' FROM public.drivers WHERE id = 'b8820000-0000-0000-0000-000000000001'),
  'a new driver gets a code in the DRV-00000 format');
SELECT ok((SELECT driver_code <> 'DRV-99999' FROM public.drivers WHERE id = 'b8820000-0000-0000-0000-000000000001'),
  'the code is set by the database (a code sent by the app is ignored)');
SELECT is((SELECT substr(b.driver_code, 5)::int - substr(a.driver_code, 5)::int
           FROM public.drivers a, public.drivers b
           WHERE a.id = 'b8820000-0000-0000-0000-000000000001' AND b.id = 'b8820000-0000-0000-0000-000000000002'), 1,
  'the next driver gets the next number');
SELECT is((SELECT count(*) FROM public.drivers WHERE driver_code IS NULL), 0::bigint, 'every driver has a code');
SELECT throws_ok($$ UPDATE public.drivers SET driver_code = 'DRV-00001' WHERE id = 'b8820000-0000-0000-0000-000000000002' $$,
  '42501', NULL, 'a code can never be changed');

INSERT INTO public.driver_compensation
  (driver_id, vehicle_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, pay_frequency, effective_from) VALUES
  ('b8820000-0000-0000-0000-000000000001', 'b8800000-0000-0000-0000-000000000001', 'commission', 35, NULL, 0, 'monthly', '2026-01-01');
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('b8820000-0000-0000-0000-000000000001', 'b8800000-0000-0000-0000-000000000001', 500, 'Cash', '2026-08-10'),
  ('b8820000-0000-0000-0000-000000000001', 'b8800000-0000-0000-0000-000000000001', 300, 'Cash', '2026-09-02');
INSERT INTO public.expenses (driver_id, vehicle_id, allocation, amount, category, payment_method, receipt_image_url, expense_date) VALUES
  ('b8820000-0000-0000-0000-000000000001', 'b8800000-0000-0000-0000-000000000001', 'Vehicle', 80, 'Fuel', 'Cash',
   'b8820000-0000-0000-0000-000000000001/2026-08-11/a.jpg', '2026-08-11');

-- ─── get_driver_profile ──────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT public.get_driver_profile('b8820000-0000-0000-0000-000000000001', '2026-08-01') $$,
  '42501', NULL, 'a driver cannot read the admin driver page, not even their own');
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"partner"}}';
SELECT throws_ok($$ SELECT public.get_driver_profile('b8820000-0000-0000-0000-000000000001', '2026-08-01') $$,
  '42501', NULL, 'a partner cannot read it');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
CREATE TEMP TABLE t_prof AS SELECT public.get_driver_profile('b8820000-0000-0000-0000-000000000001', '2026-08-20') AS p;
SELECT is((SELECT p #>> '{driver,driver_code}' FROM t_prof),
  (SELECT driver_code FROM public.drivers WHERE id = 'b8820000-0000-0000-0000-000000000001'), 'the profile shows the driver code');
SELECT is((SELECT jsonb_array_length(p -> 'rides') FROM t_prof), 1, 'only the chosen month''s rides (August)');
SELECT is((SELECT (p #>> '{expenses,0,amount}')::numeric FROM t_prof), 80::numeric, 'the month''s expenses with who paid');
SELECT is((SELECT p #>> '{expenses,0,paid_by}' FROM t_prof), 'driver', 'who paid is included');
SELECT is((SELECT (p #>> '{driverCompensation,commission_percentage}')::numeric FROM t_prof), 35::numeric,
  'this driver''s pay terms for the month');
SELECT is((SELECT p #>> '{vehiclePartners,0,partners,name}' FROM t_prof), 'Workspace Partner', 'the month''s owners of the vehicle');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
