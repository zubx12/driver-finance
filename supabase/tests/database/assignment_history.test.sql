-- Phase 7A (M3): driver-vehicle assignment history.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

-- ─── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'p1@test.local');

INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('a7000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2024, 'AH-1'),
  ('a7000000-0000-0000-0000-000000000002', 'Hyundai', 'Staria', 2024, 'AH-2'),
  ('a7000000-0000-0000-0000-000000000003', 'Kia', 'Carnival', 2024, 'AH-3');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('b7000000-0000-0000-0000-000000000001', 'Ali', '00000000-0000-0000-0000-0000000000d1'),
  ('b7000000-0000-0000-0000-000000000002', 'Omar', NULL),
  ('b7000000-0000-0000-0000-000000000003', 'Saeed', NULL);
INSERT INTO public.partners (id, name, linked_auth_id) VALUES
  ('c7000000-0000-0000-0000-000000000001', 'Camry Partner', '00000000-0000-0000-0000-0000000000e1');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from)
VALUES ('a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 100, '2020-01-01');

-- ─── Admin moves drivers on chosen dates ─────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT public.assign_driver('a7000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001', public.app_today() - 20);
SELECT public.assign_driver('a7000000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-000000000001', public.app_today() - 5);
SELECT public.assign_driver('a7000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000002', public.app_today() - 5);

SELECT is((SELECT count(*) FROM public.driver_vehicle_assignments WHERE driver_id = 'b7000000-0000-0000-0000-000000000001'), 2::bigint,
  'M3: a mid-month move keeps both periods');
SELECT is((SELECT assigned_from || ' to ' || assigned_to FROM public.driver_vehicle_assignments
           WHERE driver_id = 'b7000000-0000-0000-0000-000000000001' AND vehicle_id = 'a7000000-0000-0000-0000-000000000001'),
          (public.app_today() - 20) || ' to ' || (public.app_today() - 5),
  'M3: the first vehicle is kept with its dates');
SELECT is((SELECT assigned_from FROM public.driver_vehicle_assignments
           WHERE driver_id = 'b7000000-0000-0000-0000-000000000001' AND vehicle_id = 'a7000000-0000-0000-0000-000000000002' AND assigned_to IS NULL),
          public.app_today() - 5,
  'M3: the new vehicle starts on the move date');

SELECT public.assign_driver('a7000000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-000000000003');
SELECT public.unassign_driver('b7000000-0000-0000-0000-000000000003');
SELECT is((SELECT count(*) FROM public.driver_vehicle_assignments WHERE driver_id = 'b7000000-0000-0000-0000-000000000003'), 0::bigint,
  'assigned and removed on the same day leaves no empty period');

RESET ROLE;
SELECT throws_ok($$ INSERT INTO public.driver_vehicle_assignments (driver_id, vehicle_id, assigned_from)
  VALUES ('b7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000003', public.app_today() - 10) $$,
  '23P01', NULL, 'a driver cannot be on two vehicles at the same time');

-- ─── Who can see what ────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"partner"}}';
SELECT is((SELECT count(*) FROM public.get_assignment_history('a7000000-0000-0000-0000-000000000001')), 2::bigint,
  'the Camry partner sees who drove the Camry and when');
SELECT is((SELECT count(*) FROM public.get_assignment_history('a7000000-0000-0000-0000-000000000002')), 0::bigint,
  'the Camry partner does not see other vehicles');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT is((SELECT count(*) FROM public.get_assignment_history()), 2::bigint,
  'a driver sees only their own history');

-- Ali is now on the Staria with no pay terms on either vehicle: entries on the
-- Camry are accepted only for the days he drove it.
SELECT lives_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('b7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 60, 'Cash', public.app_today() - 7) $$,
  'an offline ride from the old vehicle, dated while assigned, is accepted');
SELECT throws_ok($$ INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
  VALUES ('b7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 60, 'Cash', public.app_today() - 3) $$,
  '23514', NULL, 'a ride on the old vehicle after the move is refused');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
