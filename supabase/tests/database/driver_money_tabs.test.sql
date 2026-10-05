-- W3: data for "Cash & vouchers" and "Settlements & pay" on the driver page.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(11);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('d8800000-0000-0000-0000-000000000001', 'Car', 'Money', 2024, 'MONEY-1');
INSERT INTO public.partners (id, name) VALUES ('d8810000-0000-0000-0000-000000000001', 'Money Partner');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('d8800000-0000-0000-0000-000000000001', 'd8810000-0000-0000-0000-000000000001', 100, '2026-01-01');
INSERT INTO public.payers (id, name) VALUES ('d8830000-0000-0000-0000-000000000001', 'Hotel Madinah');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('d8820000-0000-0000-0000-000000000001', 'Money Driver', '00000000-0000-0000-0000-0000000000d1');
INSERT INTO public.driver_compensation
  (driver_id, vehicle_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, pay_frequency, effective_from) VALUES
  ('d8820000-0000-0000-0000-000000000001', 'd8800000-0000-0000-0000-000000000001', 'commission', 20, NULL, 0, 'monthly', '2026-01-01');

-- June: cash 1,000; two vouchers 300 (outstanding) and 200 (collected by the driver).
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('d8820000-0000-0000-0000-000000000001', 'd8800000-0000-0000-0000-000000000001', 1000, 'Cash', '2026-06-04');
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, payer_id, reference, ride_date) VALUES
  ('d8840000-0000-0000-0000-000000000001', 'd8820000-0000-0000-0000-000000000001', 'd8800000-0000-0000-0000-000000000001', 300, 'Voucher', 'd8830000-0000-0000-0000-000000000001', 'HM-1', '2026-06-10'),
  ('d8840000-0000-0000-0000-000000000002', 'd8820000-0000-0000-0000-000000000001', 'd8800000-0000-0000-0000-000000000001', 200, 'Voucher', 'd8830000-0000-0000-0000-000000000001', 'HM-2', '2026-06-11');
UPDATE public.rides SET payment_status = 'Outstanding' WHERE id = 'd8840000-0000-0000-0000-000000000001';
UPDATE public.rides SET payment_status = 'Collected', collected_by_role = 'driver', collected_by_name = 'Money Driver',
  collected_at = '2026-06-20 10:00+03' WHERE id = 'd8840000-0000-0000-0000-000000000002';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT public.get_driver_vouchers('d8820000-0000-0000-0000-000000000001') $$, '42501', NULL,
  'a driver cannot read the office''s voucher view');
SELECT throws_ok($$ SELECT public.get_driver_money_history('d8820000-0000-0000-0000-000000000001') $$, '42501', NULL,
  'a driver cannot read the office''s settlement and pay history');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT is(jsonb_array_length(public.get_driver_vouchers('d8820000-0000-0000-0000-000000000001', '2026-06-01', '2026-06-30')), 2,
  'both June vouchers');
SELECT is(jsonb_array_length(public.get_driver_vouchers('d8820000-0000-0000-0000-000000000001', NULL, NULL, true)), 1,
  'only the outstanding one when asked');
SELECT is((SELECT v ->> 'collected_by' FROM jsonb_array_elements(public.get_driver_vouchers('d8820000-0000-0000-0000-000000000001')) v
           WHERE v ->> 'reference' = 'HM-2'), 'Money Driver', 'who collected a voucher is shown');
SELECT is((SELECT v ->> 'payer' FROM jsonb_array_elements(public.get_driver_vouchers('d8820000-0000-0000-0000-000000000001')) v LIMIT 1),
  'Hotel Madinah', 'the payer is shown');

-- Finalize June, settle it, then read the history.
SELECT public.finalize_salary(public.calculate_salary('d8800000-0000-0000-0000-000000000001', '2026-06-01'));
SELECT public.close_driver_settlement('d8820000-0000-0000-0000-000000000001', '2026-06-01',
  abs((public.get_driver_settlement('d8820000-0000-0000-0000-000000000001', '2026-06-01') ->> 'closing_balance')::numeric),
  'cash', 'JUN-1');
CREATE TEMP TABLE t_h AS SELECT public.get_driver_money_history('d8820000-0000-0000-0000-000000000001') AS h;

SELECT is((SELECT jsonb_array_length(h -> 'settlements') FROM t_h), 1, 'the June settlement is listed');
SELECT is((SELECT (h #>> '{settlements,0,carried_forward}')::numeric FROM t_h), 0::numeric, 'settled in full, nothing carried');
SELECT is((SELECT (h #>> '{pay,0,amount}')::numeric FROM t_h),
  (SELECT (public.get_driver_settlement('d8820000-0000-0000-0000-000000000001', '2026-06-01') ->> 'driver_pay')::numeric),
  'pay history equals the settlement''s driver pay');
SELECT is((SELECT h #>> '{pay,0,status}' FROM t_h), 'finalized', 'the payout status is shown');
SELECT is((SELECT (h #>> '{pay_terms,0,commission_percentage}')::numeric FROM t_h), 20::numeric, 'the pay terms are listed');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
