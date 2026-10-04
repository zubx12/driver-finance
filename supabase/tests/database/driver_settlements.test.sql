-- Phase 7C/7D: who paid each expense, and the driver monthly settlement.
-- Worked cases come from docs/money-flow-plan.md §2.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(34);

-- ─── Fixtures (as the migration owner) ───────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('d7000000-0000-0000-0000-000000000001', 'Car', 'S', 2024, 'SET-1');
INSERT INTO public.partners (id, name) VALUES
  ('d7100000-0000-0000-0000-000000000001', 'Settlement partner');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('d7000000-0000-0000-0000-000000000001', 'd7100000-0000-0000-0000-000000000001', 100, '2026-01-01');
INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id) VALUES
  ('d7200000-0000-0000-0000-000000000001', 'Settle Ali', '00000000-0000-0000-0000-0000000000d1', 'd7000000-0000-0000-0000-000000000001'),
  ('d7200000-0000-0000-0000-000000000002', 'Settle Omar', '00000000-0000-0000-0000-0000000000d2', NULL);
-- August: commission 36%. September: salary 4,000.
INSERT INTO public.driver_compensation
  (driver_id, vehicle_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, pay_frequency, effective_from, effective_to) VALUES
  ('d7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'commission', 36, NULL, 0, 'monthly', '2026-01-01', '2026-09-01'),
  ('d7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'fixed_salary', NULL, 4000, 0, 'monthly', '2026-09-01', NULL);

-- ─── 7C: who paid ────────────────────────────────────────────────────────────
INSERT INTO public.expenses (id, driver_id, vehicle_id, allocation, amount, category, payment_method, receipt_image_url, expense_date) VALUES
  ('d7300000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'Vehicle',
   2000, 'Fuel', 'Cash', 'd7200000-0000-0000-0000-000000000001/2026-08-05/a.jpg', '2026-08-05'),
  ('d7300000-0000-0000-0000-000000000002', 'd7200000-0000-0000-0000-000000000001', NULL, 'Driver',
   500, 'Phone', 'Card', 'd7200000-0000-0000-0000-000000000001/2026-08-06/b.jpg', '2026-08-06');
SELECT is((SELECT paid_by FROM public.expenses WHERE id = 'd7300000-0000-0000-0000-000000000001'), 'driver',
  '7C: a cash expense without paid_by is paid by the driver');
SELECT is((SELECT paid_by FROM public.expenses WHERE id = 'd7300000-0000-0000-0000-000000000002'), 'company',
  '7C: a card expense without paid_by is paid by the company');
SELECT throws_ok($$ INSERT INTO public.expenses (driver_id, allocation, amount, category, payment_method, paid_by, receipt_image_url, expense_date)
  VALUES ('d7200000-0000-0000-0000-000000000001', 'Driver', 1, 'X', 'Card', 'partner', 'd7200000-0000-0000-0000-000000000001/2026-08-06/c.jpg', '2026-08-06') $$,
  '23514', NULL, '7C: paid_by only accepts driver, company or office');

-- ─── August (case 1): cash 7,000 − expenses 2,000 − pay 1,800 − handed 3,000 = +200
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('d7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 4000, 'Cash', '2026-08-10'),
  ('d7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 3000, 'Cash', '2026-08-20');
INSERT INTO public.cash_handovers (id, driver_id, amount, handover_date, status, reviewed_at) VALUES
  ('d7400000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 3000, '2026-08-21', 'confirmed', now());
INSERT INTO public.cash_handovers (id, driver_id, amount, handover_date) VALUES
  ('d7400000-0000-0000-0000-000000000002', 'd7200000-0000-0000-0000-000000000001', 400, '2026-08-25');

-- ─── September (case 2): cash 3,000 + voucher 600 − 500 − own money 100 − salary 4,000 = −1,000
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('d7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 3000, 'Cash', '2026-09-03');
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('d7500000-0000-0000-0000-000000000001', 'd7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 600, 'Voucher', '2026-09-05');
UPDATE public.rides SET payment_status = 'Collected', collected_by_role = 'driver',
  collected_by = '00000000-0000-0000-0000-0000000000d1', collected_at = '2026-09-10 12:00+03'
WHERE id = 'd7500000-0000-0000-0000-000000000001';
INSERT INTO public.expenses (driver_id, vehicle_id, allocation, amount, category, payment_method, paid_by, receipt_image_url, expense_date) VALUES
  ('d7200000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'Vehicle',
   500, 'Fuel', 'Cash', 'driver', 'd7200000-0000-0000-0000-000000000001/2026-09-07/d.jpg', '2026-09-07'),
  ('d7200000-0000-0000-0000-000000000001', NULL, 'Driver',
   100, 'Parking', 'Card', 'driver', 'd7200000-0000-0000-0000-000000000001/2026-09-08/e.jpg', '2026-09-08');

-- ─── Driver view ─────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') ->> 'cash_collected')::numeric, 7000::numeric,
  'a driver can see their own settlement');
SELECT throws_ok($$ SELECT public.close_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') $$,
  '42501', NULL, 'a driver cannot close a settlement');
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') $$,
  '42501', NULL, 'a driver cannot see another driver''s settlement');

-- ─── Office: August ──────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') ->> 'driver_pay')::numeric, 0::numeric,
  'driver pay counts only once the payout is finalized');
SELECT throws_ok($$ SELECT public.close_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') $$,
  '55000', NULL, 'cannot settle before the vehicle payout is finalized');

SELECT public.finalize_salary(public.calculate_salary('d7000000-0000-0000-0000-000000000001', '2026-08-01'));

SELECT throws_ok($$ SELECT public.close_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') $$,
  '55000', 'Cannot settle yet: 1 cash handover(s) waiting for the office to confirm',
  'cannot settle while a handover waits for review');
SELECT public.review_cash_handover('d7400000-0000-0000-0000-000000000002', 'disputed', 'Not received');

SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') ->> 'driver_pay')::numeric, 1800::numeric,
  'case 1: driver pay is the finalized 36% commission (1,800)');
SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') ->> 'expenses_paid')::numeric, 2000::numeric,
  'case 1: only driver-paid expenses count (the company-card 500 does not)');
SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') ->> 'handovers_confirmed')::numeric, 3000::numeric,
  'case 1: only confirmed handovers count (the disputed 400 does not)');
SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01') ->> 'closing_balance')::numeric, 200::numeric,
  'case 1: closing balance +200, the driver owes the office');

SELECT throws_ok($$ SELECT public.close_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-09-01') $$,
  '55000', NULL, 'September cannot be settled before August');
SELECT throws_ok($$ SELECT public.close_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01', 300, 'cash') $$,
  '22023', NULL, 'cannot record more than the balance as paid');
SELECT throws_ok($$ SELECT public.close_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01', 200) $$,
  '22023', NULL, 'a payment needs a method');
SELECT lives_ok($$ SELECT public.close_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01', 200, 'cash', 'R-1') $$,
  'August settled: the driver hands over 200');
SELECT is((SELECT carried_forward FROM public.driver_settlements
           WHERE driver_id = 'd7200000-0000-0000-0000-000000000001' AND period_start = '2026-08-01'), 0::numeric,
  'nothing is carried after a full settlement');

-- ─── Lock on a closed month ──────────────────────────────────────────────────
SELECT throws_ok($$ INSERT INTO public.expenses (driver_id, allocation, amount, category, payment_method, paid_by, receipt_image_url, expense_date)
  VALUES ('d7200000-0000-0000-0000-000000000001', 'Driver', 50, 'Water', 'Cash', 'driver', 'd7200000-0000-0000-0000-000000000001/2026-08-28/f.jpg', '2026-08-28') $$,
  '23514', NULL, 'lock: no driver-paid expense can be added to a settled month');
SELECT lives_ok($$ INSERT INTO public.expenses (driver_id, allocation, amount, category, payment_method, paid_by, receipt_image_url, expense_date)
  VALUES ('d7200000-0000-0000-0000-000000000001', 'Company', 50, 'Office', 'Card', 'company', 'd7200000-0000-0000-0000-000000000001/2026-08-28/g.jpg', '2026-08-28') $$,
  'lock: a company-paid expense does not touch the settlement and is still allowed');
SELECT throws_ok($$ SELECT public.review_cash_handover('d7400000-0000-0000-0000-000000000002', 'confirmed', 'found it') $$,
  '23514', NULL, 'lock: a handover in a settled month cannot be confirmed later');
SELECT throws_ok($$ INSERT INTO public.cash_handovers (driver_id, amount, handover_date) VALUES ('d7200000-0000-0000-0000-000000000001', 10, '2026-08-30') $$,
  '23514', NULL, 'lock: no handover can be added to a settled month');

-- ─── Office: September ───────────────────────────────────────────────────────
SELECT public.finalize_salary(public.calculate_salary('d7000000-0000-0000-0000-000000000001', '2026-09-01'));
SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-09-01') ->> 'vouchers_collected')::numeric, 600::numeric,
  'case 2: a voucher the driver collected counts as cash in hand');
SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-09-01') ->> 'expenses_paid')::numeric, 600::numeric,
  'case 2: cash and own-money expenses both count (500 + 100)');
SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-09-01') ->> 'closing_balance')::numeric, -1000::numeric,
  'case 2: closing balance −1,000, the office owes the driver');
SELECT lives_ok($$ SELECT public.close_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-09-01', 400, 'bank_transfer', 'TRX-9', 'rest next month') $$,
  'September settled: the office pays 400 now');
SELECT is((SELECT carried_forward FROM public.driver_settlements
           WHERE driver_id = 'd7200000-0000-0000-0000-000000000001' AND period_start = '2026-09-01'), -600::numeric,
  'case 2: −600 is carried to October');
SELECT is((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-10-01') ->> 'opening_balance')::numeric, -600::numeric,
  'October opens with the carried −600');
SELECT ok((public.get_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-10-01') -> 'blockers') ? 'The month has not ended yet',
  'the current month cannot be settled yet');
SELECT is(jsonb_array_length(public.get_driver_settlements('2026-09-01')), 1,
  'the month overview lists only drivers with something to settle');

-- ─── Reopen ──────────────────────────────────────────────────────────────────
SELECT throws_ok($$ SELECT public.reopen_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-08-01', 'mistake') $$,
  '55000', NULL, 'reopen: only the latest settled month can be reopened');
SELECT throws_ok($$ SELECT public.reopen_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-09-01', '') $$,
  '22023', NULL, 'reopen: a reason is required');
SELECT lives_ok($$ SELECT public.reopen_driver_settlement('d7200000-0000-0000-0000-000000000001', '2026-09-01', 'wrong reference') $$,
  'reopen: the latest month can be reopened with a reason');
SELECT ok((SELECT count(*) >= 3 FROM public.audit_log WHERE table_name = 'driver_settlements'),
  'closing and reopening are in the audit log');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
