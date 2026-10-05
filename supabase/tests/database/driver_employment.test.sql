-- L1: driver employment record (joining date; leaving dates come in L2-L4).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('c7700000-0000-0000-0000-000000000001', 'Car', 'Emp', 2024, 'EMP-1');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('c7720000-0000-0000-0000-000000000001', 'New Joiner', '00000000-0000-0000-0000-0000000000d1'),
  ('c7720000-0000-0000-0000-000000000002', 'Other Driver', '00000000-0000-0000-0000-0000000000d2');
-- An entry from 10 days ago (e.g. logged before the account date was fixed).
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('c7720000-0000-0000-0000-000000000001', 'c7700000-0000-0000-0000-000000000001', 100, 'Cash', public.app_today() - 10);

SELECT is((SELECT joined_on FROM public.driver_employment_periods WHERE driver_id = 'c7720000-0000-0000-0000-000000000001'),
  public.app_today(), 'a new driver starts an employment period on the day the account is made');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT is((public.get_driver_employment('c7720000-0000-0000-0000-000000000001') #>> '{current,joined_on}')::date, public.app_today(),
  'a driver can see their own joining date');
SELECT throws_ok($$ SELECT public.get_driver_employment('c7720000-0000-0000-0000-000000000002') $$,
  '42501', NULL, 'a driver cannot see another driver''s record');
SELECT throws_ok($$ SELECT public.set_driver_joined_on('c7720000-0000-0000-0000-000000000001', public.app_today() - 30) $$,
  '42501', NULL, 'a driver cannot change their joining date');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT throws_ok($$ SELECT public.set_driver_joined_on('c7720000-0000-0000-0000-000000000001', public.app_today() + 1) $$,
  '22023', NULL, 'the joining date cannot be in the future');
SELECT throws_ok($$ SELECT public.set_driver_joined_on('c7720000-0000-0000-0000-000000000001', public.app_today() - 5) $$,
  '22023', NULL, 'the joining date cannot be after the driver''s first entry');
SELECT lives_ok($$ SELECT public.set_driver_joined_on('c7720000-0000-0000-0000-000000000001', public.app_today() - 30) $$,
  'the office corrects the joining date');
SELECT is((public.get_driver_employment('c7720000-0000-0000-0000-000000000001') ->> 'days_employed')::int, 31,
  'days with the company count from the corrected date');
SELECT throws_ok($$ INSERT INTO public.driver_employment_periods (driver_id, joined_on)
  VALUES ('c7720000-0000-0000-0000-000000000001', '2020-01-01') $$,
  '42501', NULL, 'periods are changed only through the office functions');
SELECT ok((SELECT count(*) >= 1 FROM public.audit_log WHERE table_name = 'driver_employment_periods'
           AND record_id IN (SELECT id FROM public.driver_employment_periods WHERE driver_id = 'c7720000-0000-0000-0000-000000000001')),
  'the change is in the audit log');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
