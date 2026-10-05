-- W5: a driver's change history (History tab).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'office@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('e8800000-0000-0000-0000-000000000001', 'Car', 'Hist', 2024, 'HIST-1');
INSERT INTO public.drivers (id, name, linked_auth_id, phone) VALUES
  ('e8820000-0000-0000-0000-000000000001', 'History Driver', '00000000-0000-0000-0000-0000000000d1', '0500000001'),
  ('e8820000-0000-0000-0000-000000000002', 'Other Driver', NULL, '0500000002');
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('e8840000-0000-0000-0000-000000000001', 'e8820000-0000-0000-0000-000000000001', 'e8800000-0000-0000-0000-000000000001', 300, 'Cash', public.app_today()),
  ('e8840000-0000-0000-0000-000000000002', 'e8820000-0000-0000-0000-000000000002', 'e8800000-0000-0000-0000-000000000001', 999, 'Cash', public.app_today());

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
UPDATE public.rides SET amount = 350 WHERE id = 'e8840000-0000-0000-0000-000000000001';
UPDATE public.drivers SET phone = '0500000009' WHERE id = 'e8820000-0000-0000-0000-000000000001';

CREATE TEMP TABLE t_h AS SELECT * FROM public.get_driver_history('e8820000-0000-0000-0000-000000000001', 200, 0);

SELECT ok((SELECT count(*) > 0 FROM t_h WHERE table_name = 'rides' AND action = 'UPDATE'
           AND (changes #>> '{amount,from}')::numeric = 300 AND (changes #>> '{amount,to}')::numeric = 350),
  'a ride amount change shows old and new values');
SELECT is((SELECT actor FROM t_h WHERE table_name = 'rides' AND action = 'UPDATE' LIMIT 1), 'office@test.local',
  'it shows who made the change');
SELECT ok((SELECT count(*) > 0 FROM t_h WHERE table_name = 'drivers' AND changes #>> '{phone,to}' = '0500000009'),
  'changes to the driver record itself are included');
SELECT ok((SELECT count(*) > 0 FROM t_h WHERE table_name = 'driver_employment_periods'),
  'the employment period is included');
SELECT is((SELECT count(*) FROM t_h WHERE record_id = 'e8840000-0000-0000-0000-000000000002'), 0::bigint,
  'another driver''s ride is not included');
SELECT ok(NOT EXISTS (
    SELECT 1 FROM (SELECT changed_at, lag(changed_at) OVER () AS before
                   FROM public.get_driver_history('e8820000-0000-0000-0000-000000000001', 200, 0)) x
    WHERE x.before < x.changed_at),
  'newest first');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT * FROM public.get_driver_history('e8820000-0000-0000-0000-000000000001') $$, '42501', NULL,
  'a driver cannot read the office''s history view');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
