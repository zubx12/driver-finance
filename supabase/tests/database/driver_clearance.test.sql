-- L3: clearance before a driver is closed (Leaving -> Left), with a write-off.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('e7700000-0000-0000-0000-000000000001', 'Car', 'Clear', 2024, 'CLEAR-1');
INSERT INTO public.partners (id, name) VALUES ('e7710000-0000-0000-0000-000000000001', 'Clear Partner');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('e7700000-0000-0000-0000-000000000001', 'e7710000-0000-0000-0000-000000000001', 100, '2026-01-01');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('e7720000-0000-0000-0000-000000000001', 'Departing Driver', '00000000-0000-0000-0000-0000000000d1');
UPDATE public.driver_employment_periods SET joined_on = '2026-07-01' WHERE driver_id = 'e7720000-0000-0000-0000-000000000001';
INSERT INTO public.driver_compensation
  (driver_id, vehicle_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, pay_frequency, effective_from) VALUES
  ('e7720000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000001', 'commission', 30, NULL, 0, 'monthly', '2026-07-01');
-- August: cash 2,000; a handover of 1,000 still waiting for the office.
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('e7720000-0000-0000-0000-000000000001', 'e7700000-0000-0000-0000-000000000001', 2000, 'Cash', '2026-08-20');
INSERT INTO public.cash_handovers (id, driver_id, amount, handover_date) VALUES
  ('e7740000-0000-0000-0000-000000000001', 'e7720000-0000-0000-0000-000000000001', 1000, '2026-08-30');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT public.finalize_salary(public.calculate_salary('e7700000-0000-0000-0000-000000000001', '2026-08-01'));

SELECT throws_ok($$ SELECT public.approve_driver_clearance('e7720000-0000-0000-0000-000000000001', true) $$,
  '55000', NULL, 'an active driver cannot be cleared');

SELECT public.review_cash_handover('e7740000-0000-0000-0000-000000000001', 'confirmed');
-- August: 2,000 cash - 600 pay (30%) - 1,000 handed = 400 owed by the driver.
SELECT throws_ok($$ SELECT public.close_driver_settlement('e7720000-0000-0000-0000-000000000001', '2026-08-01', 300, 'cash', 'R-1', NULL, 100, 'small difference') $$,
  '22023', NULL, 'a balance cannot be written off for a driver who is not leaving');

SELECT lives_ok($$ SELECT public.start_driver_leaving('e7720000-0000-0000-0000-000000000001', '2026-08-31', 'Resigned') $$,
  'leaving starts with the last working day 31 August');

SELECT is((SELECT (l ->> 'ok')::boolean FROM jsonb_array_elements(public.get_driver_clearance('e7720000-0000-0000-0000-000000000001') -> 'lines') l
           WHERE l ->> 'key' = 'settlements'), false, 'checklist: August is not settled yet');
SELECT is((SELECT (l ->> 'ok')::boolean FROM jsonb_array_elements(public.get_driver_clearance('e7720000-0000-0000-0000-000000000001') -> 'lines') l
           WHERE l ->> 'key' = 'payouts'), true, 'checklist: the August payout is finalized');
SELECT throws_ok($$ SELECT public.approve_driver_clearance('e7720000-0000-0000-0000-000000000001', true) $$,
  '55000', NULL, 'clearance is refused while a month is not settled');

-- Final settlement: 300 received now, 100 written off.
SELECT throws_ok($$ SELECT public.close_driver_settlement('e7720000-0000-0000-0000-000000000001', '2026-08-01', 300, 'cash', 'R-1', NULL, 100, ' ') $$,
  '22023', NULL, 'a write-off needs a reason');
SELECT throws_ok($$ SELECT public.close_driver_settlement('e7720000-0000-0000-0000-000000000001', '2026-08-01', 300, 'cash', 'R-1', NULL, 200, 'too much') $$,
  '22023', NULL, 'payment plus write-off cannot exceed the balance');
SELECT lives_ok($$ SELECT public.close_driver_settlement('e7720000-0000-0000-0000-000000000001', '2026-08-01', 300, 'cash', 'R-1', NULL, 100, 'Fuel receipt lost, agreed with driver') $$,
  'the final settlement: 300 received, 100 written off with a reason');

SELECT ok((public.get_driver_clearance('e7720000-0000-0000-0000-000000000001') ->> 'ready')::boolean,
  'every checklist line is clear');
SELECT throws_ok($$ SELECT public.approve_driver_clearance('e7720000-0000-0000-0000-000000000001', false) $$,
  '22023', NULL, 'the office must confirm the phone''s entries were uploaded');
SELECT lives_ok($$ SELECT public.approve_driver_clearance('e7720000-0000-0000-0000-000000000001', true, 'Final payment done') $$,
  'the office approves clearance');

SELECT is((SELECT status FROM public.drivers WHERE id = 'e7720000-0000-0000-0000-000000000001'), 'Left', 'the driver is Left');
SELECT is((SELECT total_written_off FROM public.driver_clearances WHERE driver_id = 'e7720000-0000-0000-0000-000000000001'), 100.00::numeric,
  'the clearance record keeps the write-off');
SELECT is((SELECT count(*) FROM public.rides WHERE driver_id = 'e7720000-0000-0000-0000-000000000001')
        + (SELECT count(*) FROM public.cash_handovers WHERE driver_id = 'e7720000-0000-0000-0000-000000000001')
        + (SELECT count(*) FROM public.driver_settlements WHERE driver_id = 'e7720000-0000-0000-0000-000000000001'), 3::bigint,
  'every record is kept (ride, handover, settlement)');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
