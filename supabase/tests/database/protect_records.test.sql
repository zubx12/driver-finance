-- L0: drivers, vehicles and partners with money records cannot be deleted
-- (their rides, expenses and pay records would be deleted with them).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000000a', 'admin@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('b7700000-0000-0000-0000-000000000001', 'Car', 'Used', 2024, 'KEEP-1'),
  ('b7700000-0000-0000-0000-000000000002', 'Car', 'Mistake', 2024, 'OOPS-1');
INSERT INTO public.partners (id, name) VALUES
  ('b7710000-0000-0000-0000-000000000001', 'Paid Partner'),
  ('b7710000-0000-0000-0000-000000000002', 'Mistake Partner');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('b7700000-0000-0000-0000-000000000001', 'b7710000-0000-0000-0000-000000000001', 100, '2026-01-01');
INSERT INTO public.drivers (id, name) VALUES
  ('b7720000-0000-0000-0000-000000000001', 'Working Driver'),
  ('b7720000-0000-0000-0000-000000000002', 'Mistake Driver');
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('b7720000-0000-0000-0000-000000000001', 'b7700000-0000-0000-0000-000000000001', 900, 'Cash', '2026-06-10');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT public.finalize_salary(public.calculate_salary('b7700000-0000-0000-0000-000000000001', '2026-06-01'));

SELECT throws_ok($$ DELETE FROM public.drivers WHERE id = 'b7720000-0000-0000-0000-000000000001' $$,
  '23503', 'This driver has rides and cannot be deleted. Mark the driver as Left instead; every record is kept.',
  'an admin cannot delete a driver who has rides');
SELECT throws_ok($$ DELETE FROM public.vehicles WHERE id = 'b7700000-0000-0000-0000-000000000001' $$,
  '23503', NULL, 'an admin cannot delete a vehicle with rides and payouts');
SELECT throws_ok($$ DELETE FROM public.partners WHERE id = 'b7710000-0000-0000-0000-000000000001' $$,
  '23503', NULL, 'an admin cannot delete a partner with payout shares');
RESET ROLE;

-- Not even directly in the database (SQL editor / service role).
SELECT throws_ok($$ DELETE FROM public.drivers WHERE id = 'b7720000-0000-0000-0000-000000000001' $$,
  '23503', NULL, 'the database owner cannot delete them either');
SELECT is((SELECT count(*) FROM public.rides WHERE driver_id = 'b7720000-0000-0000-0000-000000000001'), 1::bigint,
  'the ride is still there');
SELECT is((SELECT count(*) FROM public.vehicle_partners WHERE vehicle_id = 'b7700000-0000-0000-0000-000000000001'), 1::bigint,
  'the ownership history is still there');

-- Records made by mistake, with no money records, can still be removed.
SELECT lives_ok($$ DELETE FROM public.drivers WHERE id = 'b7720000-0000-0000-0000-000000000002' $$,
  'a driver with no records can be deleted');
SELECT lives_ok($$ DELETE FROM public.vehicles WHERE id = 'b7700000-0000-0000-0000-000000000002' $$,
  'a vehicle with no records can be deleted');
SELECT lives_ok($$ DELETE FROM public.partners WHERE id = 'b7710000-0000-0000-0000-000000000002' $$,
  'a partner with no records can be deleted');

SELECT * FROM finish();
ROLLBACK;
