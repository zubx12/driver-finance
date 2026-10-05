-- Phase 7G: month-end close checklist (money-flow plan §6).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(16);

-- ─── Fixtures (as the migration owner) ───────────────────────────────────────
-- Only this test's vehicle counts (other vehicles are set aside; rolled back).
UPDATE public.vehicles SET status = 'Inactive';

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number, status) VALUES
  ('a7700000-0000-0000-0000-000000000001', 'Hyundai', 'Staria', 2025, 'CLOSE-1', 'Active');
INSERT INTO public.partners (id, name) VALUES ('a7710000-0000-0000-0000-000000000001', 'Close Partner');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('a7700000-0000-0000-0000-000000000001', 'a7710000-0000-0000-0000-000000000001', 100, '2026-01-01');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('a7720000-0000-0000-0000-000000000001', 'Close Driver', '00000000-0000-0000-0000-0000000000d1');
INSERT INTO public.driver_compensation
  (driver_id, vehicle_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate, pay_frequency, effective_from) VALUES
  ('a7720000-0000-0000-0000-000000000001', 'a7700000-0000-0000-0000-000000000001', 'commission', 25, NULL, 0, 'monthly', '2026-01-01');

-- July: cash 4,000; a driver expense on the company card still unreviewed;
-- a handover of 1,000 still waiting for the office.
INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('a7720000-0000-0000-0000-000000000001', 'a7700000-0000-0000-0000-000000000001', 4000, 'Cash', '2026-07-10');
INSERT INTO public.expenses (id, driver_id, vehicle_id, allocation, amount, category, payment_method, receipt_image_url, expense_date) VALUES
  ('a7730000-0000-0000-0000-000000000001', 'a7720000-0000-0000-0000-000000000001', NULL, 'Company', 100, 'Office', 'Card',
   'a7720000-0000-0000-0000-000000000001/2026-07-12/a.jpg', '2026-07-12');
INSERT INTO public.cash_handovers (id, driver_id, amount, handover_date) VALUES
  ('a7740000-0000-0000-0000-000000000001', 'a7720000-0000-0000-0000-000000000001', 1000, '2026-07-20');

-- ─── Access ──────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT public.get_month_close_status('2026-07-01') $$, '42501', NULL, 'a driver cannot see the month-end checklist');

-- ─── Open items, in order ────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT is((public.get_month_close_status('2026-07-15') -> 'open_items'),
  '["1 cash handover(s) to confirm or dispute", "1 driver/company expense(s) to review", "Payout for CLOSE-1 is not calculated", "Driver Close Driver is not settled"]'::jsonb,
  'the checklist lists everything still open, in order');
SELECT throws_ok($$ SELECT public.close_month('2026-07-01') $$, '55000', NULL, 'a month with open items cannot be closed');

SELECT public.review_cash_handover('a7740000-0000-0000-0000-000000000001', 'confirmed');
SELECT public.review_unallocated_expense('a7730000-0000-0000-0000-000000000001', 'company_cost');
SELECT is((public.get_month_close_status('2026-07-01') #>> '{handovers_to_review,count}')::int, 0, 'reviewed handovers leave the list');
SELECT is((public.get_month_close_status('2026-07-01') #>> '{expenses_to_review,count}')::int, 0, 'reviewed expenses leave the list');

-- 1. Payout
SELECT public.calculate_salary('a7700000-0000-0000-0000-000000000001', '2026-07-01');
SELECT is((public.get_month_close_status('2026-07-01') #>> '{vehicles,0,status}'), 'draft', 'a draft payout is still open');
SELECT public.finalize_salary((SELECT id FROM public.salary_calculations
  WHERE vehicle_id = 'a7700000-0000-0000-0000-000000000001' AND period_start = '2026-07-01'));
SELECT is((public.get_month_close_status('2026-07-01') #>> '{vehicles,0,status}'), 'finalized', 'step 1: the payout is finalized');

-- 2. Driver: cash 4,000 - pay 1,000 (25%) - handed 1,000 = 2,000 owed to the office
SELECT is((public.get_month_close_status('2026-07-01') #>> '{drivers,0,closing_balance}')::numeric, 2000::numeric,
  'step 2: the driver owes the office 2,000');
SELECT public.close_driver_settlement('a7720000-0000-0000-0000-000000000001', '2026-07-01', 2000, 'cash', 'R-JUL');
SELECT is((public.get_month_close_status('2026-07-01') #>> '{drivers,0,status}'), 'closed', 'step 2: the driver is settled');

-- 3. Partner
SELECT is((public.get_month_close_status('2026-07-01') -> 'open_items'),
  '["Close Partner''s share for CLOSE-1 is not paid"]'::jsonb, 'step 3: only the partner payment is left');
SELECT public.pay_partner_settlement((SELECT (x ->> 'settlement_id')::uuid
  FROM jsonb_array_elements(public.get_month_close_status('2026-07-01') -> 'shares') x), 'bank_transfer', 'TRX-JUL');
SELECT ok((public.get_month_close_status('2026-07-01') ->> 'ready_to_close')::boolean, 'everything done: ready to close');

-- ─── Sign-off ────────────────────────────────────────────────────────────────
SELECT lives_ok($$ SELECT public.close_month('2026-07-01', 'All paid') $$, 'the office closes July');
SELECT throws_ok($$ SELECT public.close_month('2026-07-01') $$, '22023', NULL, 'a month is closed once');
SELECT throws_ok($$ SELECT public.reopen_month('2026-07-01', ' ') $$, '22023', NULL, 'reopening needs a reason');
SELECT lives_ok($$ SELECT public.reopen_month('2026-07-01', 'Late fuel receipt') $$, 'the office can reopen it with a reason');
SELECT ok((SELECT count(*) >= 3 FROM public.audit_log WHERE table_name = 'month_closes'),
  'closing and reopening are in the audit log');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
