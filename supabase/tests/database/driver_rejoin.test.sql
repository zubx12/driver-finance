-- L4: a driver who left can rejoin on the same record.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('f8800000-0000-0000-0000-000000000001', 'Car', 'Back', 2024, 'BACK-1');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('f8820000-0000-0000-0000-000000000001', 'Returning Driver', '00000000-0000-0000-0000-0000000000d1'),
  ('f8820000-0000-0000-0000-000000000002', 'Active Driver', NULL);
UPDATE public.driver_employment_periods SET joined_on = '2026-06-01'
WHERE driver_id = 'f8820000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
-- Leaves on 31 July; nothing to settle, so clearance is approved straight away.
SELECT public.start_driver_leaving('f8820000-0000-0000-0000-000000000001', '2026-07-31', 'Went home for a while');
SELECT public.approve_driver_clearance('f8820000-0000-0000-0000-000000000001', true);

SELECT throws_ok($$ SELECT public.rejoin_driver('f8820000-0000-0000-0000-000000000002', public.app_today()) $$,
  '22023', NULL, 'only a driver who has left can rejoin');
SELECT throws_ok($$ SELECT public.rejoin_driver('f8820000-0000-0000-0000-000000000001', public.app_today() + 1) $$,
  '22023', NULL, 'the new joining date cannot be in the future');
SELECT throws_ok($$ SELECT public.rejoin_driver('f8820000-0000-0000-0000-000000000001', public.app_today() - 1) $$,
  '22023', NULL, 'the new joining date cannot be before the driver left');
SELECT lives_ok($$ SELECT public.rejoin_driver('f8820000-0000-0000-0000-000000000001', public.app_today()) $$,
  'the office rejoins the driver from today');

SELECT is((SELECT status FROM public.drivers WHERE id = 'f8820000-0000-0000-0000-000000000001'), 'Active', 'the driver is Active again');
SELECT is((SELECT count(*) FROM public.driver_employment_periods WHERE driver_id = 'f8820000-0000-0000-0000-000000000001'), 2::bigint,
  'two employment periods on the same record');
SELECT lives_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('f8820000-0000-0000-0000-000000000001', 'f8800000-0000-0000-0000-000000000001', 300, 'Cash', public.app_today()) $$,
  'rides in the new period are accepted');
SELECT throws_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('f8820000-0000-0000-0000-000000000001', 'f8800000-0000-0000-0000-000000000001', 300, 'Cash', '2026-08-15') $$,
  '23514', NULL, 'a ride dated while the driver was away is refused');
SELECT is((public.get_driver_statement('f8820000-0000-0000-0000-000000000001', '2026-07-01') #>> '{employment,0,last_working_day}'),
  '2026-07-31', 'the July statement shows the last working day');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT is(public.my_driver_id(), 'f8820000-0000-0000-0000-000000000001'::uuid, 'the driver can log in again');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
