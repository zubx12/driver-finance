-- Phase 2 payout engine tests. Worked examples A-F come from docs/payout-rules.md.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(43);

-- ─── Fixtures (as the migration owner) ───────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'driver1@test.local');

INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('11111111-0000-0000-0000-00000000000a', 'Car', 'A', 2024, 'EX-A'),
  ('11111111-0000-0000-0000-00000000000b', 'Car', 'B', 2024, 'EX-B'),
  ('11111111-0000-0000-0000-00000000000c', 'Car', 'C', 2024, 'EX-C'),
  ('11111111-0000-0000-0000-00000000000d', 'Car', 'D', 2024, 'EX-D'),
  ('11111111-0000-0000-0000-00000000000e', 'Car', 'E', 2024, 'EX-E'),
  ('11111111-0000-0000-0000-00000000000f', 'Car', 'F', 2024, 'EX-F'),
  ('11111111-0000-0000-0000-000000000010', 'Car', 'G', 2024, 'EX-G'),
  ('11111111-0000-0000-0000-000000000011', 'Car', 'H', 2024, 'EX-H'),
  ('11111111-0000-0000-0000-000000000012', 'Car', 'I', 2024, 'EX-I');

INSERT INTO public.partners (id, name) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Partner 1'),
  ('22222222-0000-0000-0000-000000000002', 'Partner 2'),
  ('22222222-0000-0000-0000-000000000003', 'Partner 3');

INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Driver 1', '00000000-0000-0000-0000-0000000000d1', '11111111-0000-0000-0000-00000000000b'),
  ('33333333-0000-0000-0000-000000000002', 'Driver 2', NULL, '11111111-0000-0000-0000-00000000000d'),
  ('33333333-0000-0000-0000-000000000003', 'Driver 3', NULL, '11111111-0000-0000-0000-000000000010'),
  ('33333333-0000-0000-0000-000000000004', 'Driver 4', NULL, '11111111-0000-0000-0000-000000000011');

INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from, effective_to) VALUES
  -- A: 35 / 32.5 / 32.5
  ('11111111-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-000000000001', 35, '2026-01-01', NULL),
  ('11111111-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-000000000002', 32.5, '2026-01-01', NULL),
  ('11111111-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-000000000003', 32.5, '2026-01-01', NULL),
  -- B: 50 / 50
  ('11111111-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-000000000001', 50, '2026-01-01', NULL),
  ('11111111-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-000000000002', 50, '2026-01-01', NULL),
  -- C: P1 100% for June 1-10, then P1 60 / P2 40 from June 11
  ('11111111-0000-0000-0000-00000000000c', '22222222-0000-0000-0000-000000000001', 100, '2026-01-01', '2026-06-11'),
  ('11111111-0000-0000-0000-00000000000c', '22222222-0000-0000-0000-000000000001', 60, '2026-06-11', NULL),
  ('11111111-0000-0000-0000-00000000000c', '22222222-0000-0000-0000-000000000002', 40, '2026-06-11', NULL),
  -- D, F, G, H, I: single partner
  ('11111111-0000-0000-0000-00000000000d', '22222222-0000-0000-0000-000000000001', 100, '2026-01-01', NULL),
  ('11111111-0000-0000-0000-00000000000f', '22222222-0000-0000-0000-000000000001', 100, '2026-01-01', NULL),
  ('11111111-0000-0000-0000-000000000010', '22222222-0000-0000-0000-000000000001', 100, '2026-01-01', NULL),
  ('11111111-0000-0000-0000-000000000011', '22222222-0000-0000-0000-000000000001', 100, '2026-01-01', NULL),
  ('11111111-0000-0000-0000-000000000012', '22222222-0000-0000-0000-000000000001', 100, '2026-01-01', NULL),
  -- E: 33.33 / 33.33 / 33.34
  ('11111111-0000-0000-0000-00000000000e', '22222222-0000-0000-0000-000000000001', 33.33, '2026-01-01', NULL),
  ('11111111-0000-0000-0000-00000000000e', '22222222-0000-0000-0000-000000000002', 33.33, '2026-01-01', NULL),
  ('11111111-0000-0000-0000-00000000000e', '22222222-0000-0000-0000-000000000003', 33.34, '2026-01-01', NULL);

INSERT INTO public.driver_compensation
  (driver_id, vehicle_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, pay_frequency, effective_from, effective_to) VALUES
  -- B: 35% commission
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000b', 'commission', 35, NULL, 0, 'monthly', '2026-01-01', NULL),
  -- D: salary 4000 + 8% bonus
  ('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-00000000000d', 'fixed_salary', NULL, 4000, 8, 'monthly', '2026-01-01', NULL),
  -- F: two drivers on 30% each
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000f', 'commission', 30, NULL, 0, 'monthly', '2026-01-01', NULL),
  ('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-00000000000f', 'commission', 30, NULL, 0, 'monthly', '2026-01-01', NULL),
  -- G: 20% until June 16, 30% from June 16
  ('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000010', 'commission', 20, NULL, 0, 'monthly', '2026-01-01', '2026-06-16'),
  ('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000010', 'commission', 30, NULL, 0, 'monthly', '2026-06-16', NULL),
  -- H: salary 3000 starting June 16 (15 of 30 days)
  ('33333333-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000011', 'fixed_salary', NULL, 3000, 0, 'monthly', '2026-06-16', NULL);

INSERT INTO public.daily_summary (summary_date, driver_id, vehicle_id, total_revenue, total_expenses, net_revenue) VALUES
  ('2026-06-10', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000a', 10000, 2000, 8000),
  ('2026-06-10', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000b', 10000, 2000, 8000),
  ('2026-06-05', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000c', 3000, 0, 3000),
  ('2026-06-20', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000c', 6000, 0, 6000),
  ('2026-06-10', '33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-00000000000d', 3000, 0, 3000),
  ('2026-06-10', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000e', 10, 0, 10),
  ('2026-06-10', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000f', 5000, 0, 5000),
  ('2026-06-10', '33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-00000000000f', 3000, 0, 3000),
  ('2026-06-10', '33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000010', 1000, 0, 1000),
  ('2026-06-20', '33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000010', 2000, 0, 2000),
  ('2026-06-20', '33333333-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000011', 10000, 0, 10000),
  ('2026-06-10', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000012', 0, 500, -500),
  ('2026-07-10', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000012', 2000, 0, 2000);

CREATE TEMP TABLE r AS
SELECT v.id AS vehicle_id, public._salary_compute(v.id, '2026-06-01') AS result
FROM public.vehicles v
WHERE v.plate_number LIKE 'EX-%' AND v.plate_number <> 'EX-I';
GRANT SELECT ON r TO authenticated;

CREATE FUNCTION pg_temp.share(p_vehicle text, p_partner text) RETURNS numeric LANGUAGE sql AS $$
  SELECT (s ->> 'share_amount')::numeric
  FROM r, jsonb_array_elements(r.result -> 'shares') s
  WHERE r.vehicle_id = ('11111111-0000-0000-0000-0000000000' || p_vehicle)::uuid
    AND s ->> 'partner_id' = '22222222-0000-0000-0000-00000000000' || p_partner $$;
CREATE FUNCTION pg_temp.val(p_vehicle text, p_key text) RETURNS numeric LANGUAGE sql AS $$
  SELECT (result ->> p_key)::numeric FROM r
  WHERE vehicle_id = ('11111111-0000-0000-0000-0000000000' || p_vehicle)::uuid $$;
CREATE FUNCTION pg_temp.pay(p_vehicle text, p_driver text) RETURNS numeric LANGUAGE sql AS $$
  SELECT sum((d ->> 'driver_pay_amount')::numeric)
  FROM r, jsonb_array_elements(r.result -> 'driver_pay') d
  WHERE r.vehicle_id = ('11111111-0000-0000-0000-0000000000' || p_vehicle)::uuid
    AND d ->> 'driver_id' = '33333333-0000-0000-0000-00000000000' || p_driver $$;

-- ─── Worked examples ─────────────────────────────────────────────────────────
SELECT is(pg_temp.share('0a', '1'), 2800.00, 'A: 35% partner gets 2,800');
SELECT is(pg_temp.share('0a', '2'), 2600.00, 'A: 32.5% partner gets 2,600');
SELECT is(pg_temp.share('0a', '3'), 2600.00, 'A: 32.5% partner gets 2,600');

SELECT is(pg_temp.pay('0b', '1'), 2800.00, 'B: 35% commission driver gets 2,800');
SELECT is(pg_temp.share('0b', '1'), 2600.00, 'B: partner 1 gets 2,600');
SELECT is(pg_temp.share('0b', '2'), 2600.00, 'B: partner 2 gets 2,600');

SELECT is(pg_temp.share('0c', '1'), 6600.00, 'C: mid-month split change, partner X gets 6,600');
SELECT is(pg_temp.share('0c', '2'), 2400.00, 'C: mid-month split change, partner Y gets 2,400');

SELECT is(pg_temp.pay('0d', '2'), 4240.00, 'D: salary 4,000 + 8% bonus on 3,000 = 4,240');
SELECT is(pg_temp.share('0d', '1'), 0.00, 'D: loss month, partner share is 0');
SELECT is(pg_temp.val('0d', 'loss_carried_forward'), 1240.00, 'D: loss of 1,240 carried forward');

SELECT is(pg_temp.share('0e', '3'), 3.34, 'E: leftover cent goes to the largest share');
SELECT is(pg_temp.share('0e', '1'), 3.33, 'E: other shares rounded down');
SELECT is(pg_temp.share('0e', '1') + pg_temp.share('0e', '2') + pg_temp.share('0e', '3'), 10.00, 'E: shares add up to the net exactly');

SELECT is(pg_temp.pay('0f', '1'), 1500.00, 'F: commission on own net (30% of 5,000)');
SELECT is(pg_temp.pay('0f', '2'), 900.00, 'F: commission on own net (30% of 3,000)');
SELECT is(pg_temp.share('0f', '1'), 5600.00, 'F: partner gets the rest');

-- ─── Regressions ─────────────────────────────────────────────────────────────
SELECT is(pg_temp.pay('10', '3'), 800.00, 'C4: pay terms changed mid-month still pay both parts (200 + 600)');
SELECT is(pg_temp.pay('11', '4'), 1500.00, 'D1: salary starting mid-month is pro-rated (15 of 30 days)');
SELECT is(pg_temp.share('11', '1'), 8500.00, 'D1: partner gets net minus pro-rated salary');

SELECT ok(
  (SELECT bool_and(
     (result ->> 'net_revenue')::numeric
     = (result ->> 'driver_pay_total')::numeric
       + (SELECT coalesce(sum((s ->> 'share_amount')::numeric), 0) FROM jsonb_array_elements(result -> 'shares') s)
       + (result ->> 'company_retained')::numeric
       + (result ->> 'loss_brought_forward')::numeric
       - (result ->> 'loss_carried_forward')::numeric)
   FROM r),
  'Every calculation balances to the cent');

-- ─── Carry-forward, finalize, immutability (as admin) ────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT lives_ok($$ SELECT public.calculate_salary('11111111-0000-0000-0000-000000000012', '2026-06-01') $$,
  'admin can calculate a draft');
SELECT is((SELECT loss_carried_forward FROM public.salary_calculations
           WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-06-01'), 500.00,
  'June loss of 500 recorded');
SELECT lives_ok($$ SELECT public.finalize_salary((SELECT id FROM public.salary_calculations
  WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-06-01')) $$,
  'admin can finalize');
SELECT throws_ok($$ SELECT public.finalize_salary((SELECT id FROM public.salary_calculations
  WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-06-01')) $$,
  '42501', NULL, 'C5: finalizing twice is refused');
SELECT throws_ok($$ UPDATE public.salary_calculations SET net_revenue = 0
  WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-06-01' $$,
  '42501', NULL, 'C5: a finalized calculation cannot be edited');
SELECT throws_ok($$ UPDATE public.salary_calculation_shares SET share_amount = 1
  WHERE calculation_id = (SELECT id FROM public.salary_calculations
    WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-06-01') $$,
  '42501', NULL, 'C5: lines of a finalized calculation cannot be edited');

SELECT lives_ok($$ SELECT public.calculate_salary('11111111-0000-0000-0000-000000000012', '2026-07-01') $$,
  'July draft calculated');
SELECT is((SELECT loss_brought_forward FROM public.salary_calculations
           WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-07-01'), 500.00,
  'D2: June loss brought into July');
SELECT is((SELECT share_amount FROM public.salary_calculation_shares WHERE calculation_id =
            (SELECT id FROM public.salary_calculations
             WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-07-01')), 1500.00,
  'D2: July partner share is 2,000 net minus 500 loss');

SELECT lives_ok($$ SELECT public.set_company_expenses((SELECT id FROM public.salary_calculations
  WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-07-01'), 200, 'insurance') $$,
  'company expenses saved');
SELECT is((SELECT share_amount FROM public.salary_calculation_shares WHERE calculation_id =
            (SELECT id FROM public.salary_calculations
             WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-07-01')), 1300.00,
  'C3: company expenses recalculate the whole draft');

RESET ROLE;
INSERT INTO public.daily_summary (summary_date, driver_id, vehicle_id, total_revenue, total_expenses, net_revenue)
VALUES ('2026-07-11', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000012', 100, 0, 100);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT throws_ok($$ SELECT public.finalize_salary((SELECT id FROM public.salary_calculations
  WHERE vehicle_id = '11111111-0000-0000-0000-000000000012' AND period_start = '2026-07-01')) $$,
  '40001', NULL, 'Finalizing a stale draft is refused');

-- ─── Vehicle setup rules ─────────────────────────────────────────────────────
SELECT throws_ok($$ SELECT public.set_vehicle_setup('11111111-0000-0000-0000-00000000000b',
  '[{"partner_id":"22222222-0000-0000-0000-000000000001","percentage":60},{"partner_id":null,"percentage":40}]') $$,
  '22023', NULL, 'H2: a split row with no partner is rejected');
SELECT lives_ok($$ SELECT public.set_vehicle_setup('11111111-0000-0000-0000-00000000000b',
  '[{"partner_id":"22222222-0000-0000-0000-000000000001","percentage":50},{"partner_id":"22222222-0000-0000-0000-000000000002","percentage":50}]',
  '{"compensation_type":"commission","commission_percentage":35,"bonus_rate":0}') $$,
  'Re-saving unchanged setup succeeds');
SELECT is((SELECT count(*) FROM public.driver_compensation
           WHERE driver_id = '33333333-0000-0000-0000-000000000001' AND vehicle_id = '11111111-0000-0000-0000-00000000000b'), 1::bigint,
  'C4: re-saving unchanged pay does not re-date it');
SELECT lives_ok($$ SELECT public.assign_driver('11111111-0000-0000-0000-00000000000c', '33333333-0000-0000-0000-000000000001') $$,
  'Driver moved to another vehicle');
SELECT ok((SELECT effective_to IS NOT NULL FROM public.driver_compensation
           WHERE driver_id = '33333333-0000-0000-0000-000000000001' AND vehicle_id = '11111111-0000-0000-0000-00000000000b'),
  'C4: moving a driver closes their pay on the old vehicle');

RESET ROLE;
SET CONSTRAINTS vehicle_partners_total_100 IMMEDIATE;
SELECT throws_ok($$ INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from)
  VALUES ('11111111-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-000000000003', 10, '2026-01-01') $$,
  '23514', NULL, 'H2: the database rejects splits that do not total 100');

-- ─── Rollup and expense allocation ───────────────────────────────────────────
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, ride_date)
VALUES ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000a', 100, 'Cash', '2026-08-01');
UPDATE public.rides SET ride_date = '2026-08-02' WHERE id = '44444444-0000-0000-0000-000000000001';
SELECT is((SELECT total_revenue FROM public.daily_summary WHERE summary_date = '2026-08-01'
           AND vehicle_id = '11111111-0000-0000-0000-00000000000a'), 0.00,
  'M1: moving a ride to another day empties the day it left');

INSERT INTO public.expenses (driver_id, vehicle_id, allocation, amount, category, payment_method, receipt_image_url, expense_date)
VALUES ('33333333-0000-0000-0000-000000000001', NULL, 'Company', 75, 'Office', 'Cash', '33333333-0000-0000-0000-000000000001/2026-08-03/r.jpg', '2026-08-03');
SELECT is((SELECT count(*) FROM public.daily_summary WHERE summary_date = '2026-08-03'), 0::bigint,
  'D5: company expenses do not reduce any vehicle net');
SELECT throws_ok($$ INSERT INTO public.expenses (driver_id, vehicle_id, allocation, amount, category, payment_method, receipt_image_url, expense_date)
  VALUES ('33333333-0000-0000-0000-000000000001', NULL, 'Vehicle', 10, 'Fuel', 'Cash', '33333333-0000-0000-0000-000000000001/2026-08-03/z.jpg', '2026-08-03') $$,
  '23514', NULL, 'D5: a vehicle expense must name the vehicle');

-- ─── Non-admins cannot run the engine ────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"},"user_metadata":{"role":"admin"}}';
SELECT throws_ok($$ SELECT public.run_salary_month('2026-06-01') $$, '42501', NULL,
  'A driver cannot run payouts');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
