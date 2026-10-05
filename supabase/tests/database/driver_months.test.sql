-- W2: a driver's figures month by month (Overview tab).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('c8800000-0000-0000-0000-000000000001', 'Car', 'Months', 2024, 'MON-1');
INSERT INTO public.partners (id, name) VALUES ('c8810000-0000-0000-0000-000000000001', 'Months Partner');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('c8800000-0000-0000-0000-000000000001', 'c8810000-0000-0000-0000-000000000001', 100, '2026-01-01');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('c8820000-0000-0000-0000-000000000001', 'Months Driver', '00000000-0000-0000-0000-0000000000d1');
INSERT INTO public.driver_compensation
  (driver_id, vehicle_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, pay_frequency, effective_from) VALUES
  ('c8820000-0000-0000-0000-000000000001', 'c8800000-0000-0000-0000-000000000001', 'commission', 25, NULL, 0, 'monthly', '2026-01-01');

-- July: 2 cash rides 1,000 + 600, one voucher 400 (outstanding); fuel 200 from cash.
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('c8820000-0000-0000-0000-000000000001', 'c8800000-0000-0000-0000-000000000001', 1000, 'Cash', '2026-07-05'),
  ('c8820000-0000-0000-0000-000000000001', 'c8800000-0000-0000-0000-000000000001', 600, 'Cash', '2026-07-20');
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('c8840000-0000-0000-0000-000000000001', 'c8820000-0000-0000-0000-000000000001', 'c8800000-0000-0000-0000-000000000001', 400, 'Voucher', '2026-07-21');
UPDATE public.rides SET payment_status = 'Outstanding' WHERE id = 'c8840000-0000-0000-0000-000000000001';
INSERT INTO public.expenses (driver_id, vehicle_id, allocation, amount, category, payment_method, receipt_image_url, expense_date) VALUES
  ('c8820000-0000-0000-0000-000000000001', 'c8800000-0000-0000-0000-000000000001', 'Vehicle', 200, 'Fuel', 'Cash',
   'c8820000-0000-0000-0000-000000000001/2026-07-06/a.jpg', '2026-07-06');
-- August: one cash ride 900.
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('c8820000-0000-0000-0000-000000000001', 'c8800000-0000-0000-0000-000000000001', 900, 'Cash', '2026-08-03');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT public.get_driver_months('c8820000-0000-0000-0000-000000000001', '2026-07-01', '2026-08-01') $$,
  '42501', NULL, 'a driver cannot read the office''s month-by-month view');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT public.finalize_salary(public.calculate_salary('c8800000-0000-0000-0000-000000000001', '2026-07-01'));
CREATE TEMP TABLE t_m AS SELECT public.get_driver_months('c8820000-0000-0000-0000-000000000001', '2026-06-15', '2026-08-31') AS m;

SELECT is((SELECT jsonb_array_length(m) FROM t_m), 3, 'one row per month (June, July, August)');
SELECT is((SELECT m #>> '{1,month}' FROM t_m), '2026-07', 'months come oldest first');
SELECT is((SELECT (m #>> '{1,rides}')::int FROM t_m), 3, 'July: 3 bookings');
SELECT is((SELECT (m #>> '{1,cash}')::numeric || '/' || (m #>> '{1,vouchers}')::numeric FROM t_m), '1600.00/400.00',
  'July: cash 1,600, vouchers 400');
SELECT is((SELECT (m #>> '{1,vouchers_outstanding}')::numeric FROM t_m), 400::numeric, 'July: the voucher is outstanding');
SELECT is((SELECT (m #>> '{1,expenses_paid_by_driver}')::numeric FROM t_m), 200::numeric, 'July: expenses paid by the driver');
SELECT is((SELECT m #>> '{1,pay_status}' FROM t_m), 'finalized', 'July pay is final once the payout is finalized');
SELECT is((SELECT (m #>> '{1,closing_balance}')::numeric FROM t_m),
  (public.get_driver_settlement('c8820000-0000-0000-0000-000000000001', '2026-07-01') ->> 'closing_balance')::numeric,
  'the closing balance is the settlement''s figure');
SELECT is((SELECT m #>> '{2,pay_status}' FROM t_m), 'none', 'August has no payout yet');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
