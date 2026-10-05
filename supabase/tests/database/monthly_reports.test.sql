-- Phase 7F: monthly vehicle report and driver statement (money-flow plan §5).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(20);

-- ─── Fixtures (as the migration owner) ───────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('f7000000-0000-0000-0000-000000000001', 'Toyota', 'Camry', 2024, 'REP-1');
INSERT INTO public.partners (id, name) VALUES
  ('f7100000-0000-0000-0000-000000000001', 'Report Sixty'),
  ('f7100000-0000-0000-0000-000000000002', 'Report Forty');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('f7000000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000001', 60, '2026-01-01'),
  ('f7000000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000002', 40, '2026-01-01');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('f7200000-0000-0000-0000-000000000001', 'Report Ali', '00000000-0000-0000-0000-0000000000d1'),
  ('f7200000-0000-0000-0000-000000000002', 'Report Omar', '00000000-0000-0000-0000-0000000000d2');
INSERT INTO public.driver_vehicle_assignments (driver_id, vehicle_id, assigned_from, assigned_to) VALUES
  ('f7200000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-21');
INSERT INTO public.driver_compensation
  (driver_id, vehicle_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, pay_frequency, effective_from) VALUES
  ('f7200000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'commission', 30, NULL, 0, 'monthly', '2026-01-01');

-- August: cash 5,000 + 2,000, voucher 1,000 (outstanding), vehicle fuel 1,000 from cash.
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('f7200000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 5000, 'Cash', '2026-08-05'),
  ('f7200000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 2000, 'Cash', '2026-08-18');
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, reference, ride_date) VALUES
  ('f7400000-0000-0000-0000-000000000001', 'f7200000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 1000, 'Voucher', 'V-1000', '2026-08-10');
UPDATE public.rides SET payment_status = 'Outstanding' WHERE id = 'f7400000-0000-0000-0000-000000000001';
INSERT INTO public.expenses (driver_id, vehicle_id, allocation, amount, category, payment_method, receipt_image_url, expense_date) VALUES
  ('f7200000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'Vehicle', 1000, 'Fuel', 'Cash',
   'f7200000-0000-0000-0000-000000000001/2026-08-06/a.jpg', '2026-08-06'),
  -- A company expense not charged to the vehicle: not on the vehicle report.
  ('f7200000-0000-0000-0000-000000000001', NULL, 'Company', 300, 'Office', 'Card',
   'f7200000-0000-0000-0000-000000000001/2026-08-07/b.jpg', '2026-08-07');
INSERT INTO public.salary_adjustments (vehicle_id, period_start, amount, reason) VALUES
  ('f7000000-0000-0000-0000-000000000001', '2026-08-01', 100, 'Missed ride added after review');
INSERT INTO public.cash_handovers (driver_id, amount, handover_date, status, reviewed_at) VALUES
  ('f7200000-0000-0000-0000-000000000001', 3000, '2026-08-25', 'confirmed', now());

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT public.finalize_salary(public.calculate_salary('f7000000-0000-0000-0000-000000000001', '2026-08-01'));
SELECT public.pay_partner_settlement(st.id, 'bank_transfer', 'TRX-REP')
FROM public.settlements st WHERE st.partner_id = 'f7100000-0000-0000-0000-000000000001'
  AND st.share_id IN (SELECT scs.id FROM public.salary_calculation_shares scs
                      JOIN public.salary_calculations sc ON sc.id = scs.calculation_id
                      WHERE sc.vehicle_id = 'f7000000-0000-0000-0000-000000000001');

-- ─── Vehicle report (office) ─────────────────────────────────────────────────
CREATE TEMP TABLE t_rep AS SELECT public.get_vehicle_month_report('f7000000-0000-0000-0000-000000000001', '2026-08-15') AS r;

SELECT is((SELECT r #>> '{vehicle,plate_number}' FROM t_rep), 'REP-1', 'report: the vehicle, for the whole month of the date given');
SELECT is((SELECT jsonb_array_length(r -> 'owners') FROM t_rep), 2, 'report: both owners with their percentages');
SELECT is((SELECT r #>> '{drivers,0,to}' FROM t_rep), '2026-08-21', 'report: the driver with their dates on the vehicle');
SELECT is((SELECT jsonb_array_length(r -> 'revenue_by_day') FROM t_rep), 3, 'report: revenue for each day with rides');
SELECT is((SELECT (r #>> '{revenue_totals,total}')::numeric FROM t_rep), 8000::numeric, 'report: revenue total 8,000');
SELECT is((SELECT (r #>> '{revenue_totals,vouchers_outstanding}')::numeric FROM t_rep), 1000::numeric, 'report: 1,000 of vouchers outstanding');
SELECT is((SELECT r #>> '{vouchers,0,handed_to,0,partner}' FROM t_rep), 'Report Sixty',
  'report: the voucher shows which partner holds it');
SELECT is((SELECT jsonb_array_length(r -> 'expenses') FROM t_rep), 1,
  'report: vehicle expenses only (an uncharged company expense is left out)');
SELECT is((SELECT r #>> '{expenses,0,paid_by}' FROM t_rep), 'driver', 'report: each expense shows who paid');
SELECT is((SELECT jsonb_array_length(r -> 'adjustments') FROM t_rep), 1, 'report: corrections (adjustments) are listed');
SELECT is((SELECT (r #>> '{payout,net_revenue}')::numeric FROM t_rep),
  (SELECT net_revenue FROM public.salary_calculations WHERE vehicle_id = 'f7000000-0000-0000-0000-000000000001' AND period_start = '2026-08-01'),
  'report: the balance to share is the payout engine''s figure');
SELECT is((SELECT (r #>> '{driver_pay,0,amount}')::numeric FROM t_rep),
  (SELECT driver_pay_total FROM public.salary_calculations WHERE vehicle_id = 'f7000000-0000-0000-0000-000000000001' AND period_start = '2026-08-01'),
  'report: driver pay matches the payout');
SELECT is((SELECT (r #>> '{shares,0,voucher_amount}')::numeric FROM t_rep), 600::numeric,
  'report: the 60% partner was paid 600 of it in vouchers');
SELECT is((SELECT r #>> '{shares,1,settlement_status}' FROM t_rep), 'pending', 'report: the 40% partner is still to be paid');

-- ─── Access ──────────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT public.get_vehicle_month_report('f7000000-0000-0000-0000-000000000001', '2026-08-01') $$,
  '42501', NULL, 'a driver cannot open the vehicle report');

-- ─── Driver statement ────────────────────────────────────────────────────────
CREATE TEMP TABLE t_st AS SELECT public.get_driver_statement('f7200000-0000-0000-0000-000000000001', '2026-08-01') AS s;
SELECT is((SELECT jsonb_array_length(s -> 'cash_rides') FROM t_st), 2, 'statement: the driver sees each cash ride');
SELECT is((SELECT sum((x ->> 'amount')::numeric) FROM t_st, jsonb_array_elements(s -> 'cash_rides') x),
  (SELECT (s #>> '{settlement,cash_collected}')::numeric FROM t_st),
  'statement: the rides add up to the settlement''s cash collected');
SELECT is((SELECT s #>> '{expenses_paid,0,from}' FROM t_st), 'cash in hand', 'statement: expenses paid from the cash in hand');
SELECT is((SELECT jsonb_array_length(s -> 'handovers') FROM t_st), 1, 'statement: handovers with their status');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT public.get_driver_statement('f7200000-0000-0000-0000-000000000001', '2026-08-01') $$,
  '42501', NULL, 'a driver cannot see another driver''s statement');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
