-- Phase 7E: uncollected vouchers handed to partners (money-flow plan §3).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);

-- ─── Fixtures (as the migration owner) ───────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'p1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'p2@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('e7000000-0000-0000-0000-000000000001', 'Car', 'V', 2024, 'VOU-1'),
  ('e7000000-0000-0000-0000-000000000002', 'Car', 'W', 2024, 'VOU-2');
INSERT INTO public.partners (id, name, linked_auth_id) VALUES
  ('e7100000-0000-0000-0000-000000000001', 'Partner Sixty', '00000000-0000-0000-0000-0000000000e1'),
  ('e7100000-0000-0000-0000-000000000002', 'Partner Forty', '00000000-0000-0000-0000-0000000000e2');
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from) VALUES
  ('e7000000-0000-0000-0000-000000000001', 'e7100000-0000-0000-0000-000000000001', 60, '2026-01-01'),
  ('e7000000-0000-0000-0000-000000000001', 'e7100000-0000-0000-0000-000000000002', 40, '2026-01-01'),
  ('e7000000-0000-0000-0000-000000000002', 'e7100000-0000-0000-0000-000000000001', 100, '2026-01-01');
INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id) VALUES
  ('e7200000-0000-0000-0000-000000000001', 'Voucher Driver', '00000000-0000-0000-0000-0000000000d1', 'e7000000-0000-0000-0000-000000000001');
INSERT INTO public.payers (id, name) VALUES ('e7300000-0000-0000-0000-000000000001', 'Hotel Makkah');

-- VOU-1, August: cash 8,000 + vouchers 500 + 300 + 200 = 9,000, no costs -> 5,400 / 3,600.
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, payer_id, reference, ride_date) VALUES
  ('e7400000-0000-0000-0000-000000000001', 'e7200000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 8000, 'Cash', NULL, NULL, '2026-08-03'),
  ('e7400000-0000-0000-0000-000000000002', 'e7200000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 500, 'Voucher', 'e7300000-0000-0000-0000-000000000001', 'V-500', '2026-08-10'),
  ('e7400000-0000-0000-0000-000000000003', 'e7200000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 300, 'Voucher', 'e7300000-0000-0000-0000-000000000001', 'V-300', '2026-08-11'),
  ('e7400000-0000-0000-0000-000000000004', 'e7200000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 200, 'Voucher', 'e7300000-0000-0000-0000-000000000001', 'V-200', '2026-08-12');
UPDATE public.rides SET payment_status = 'Outstanding' WHERE payment_method = 'Voucher' AND vehicle_id = 'e7000000-0000-0000-0000-000000000001';
-- V-300 was collected before the partners were paid: it is not handed over.
UPDATE public.rides SET payment_status = 'Collected', collected_by_role = 'admin', collected_at = '2026-08-25 10:00+03'
WHERE id = 'e7400000-0000-0000-0000-000000000003';

-- VOU-2, August: voucher 1,000 outstanding, vehicle expense 600 -> share 400.
INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('e7400000-0000-0000-0000-000000000005', 'e7200000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002', 1000, 'Voucher', '2026-08-15');
INSERT INTO public.expenses (driver_id, vehicle_id, allocation, amount, category, payment_method, receipt_image_url, expense_date) VALUES
  ('e7200000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002', 'Vehicle', 600, 'Repair', 'Transfer',
   'e7200000-0000-0000-0000-000000000001/2026-08-16/r.jpg', '2026-08-16');
UPDATE public.rides SET payment_status = 'Outstanding' WHERE id = 'e7400000-0000-0000-0000-000000000005';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT public.finalize_salary(public.calculate_salary('e7000000-0000-0000-0000-000000000001', '2026-08-01'));
SELECT public.finalize_salary(public.calculate_salary('e7000000-0000-0000-0000-000000000002', '2026-08-01'));
RESET ROLE;

CREATE TEMP TABLE t_ids AS
SELECT s.id, s.partner_id, sc.vehicle_id, s.amount
FROM public.settlements s
JOIN public.salary_calculation_shares scs ON scs.id = s.share_id
JOIN public.salary_calculations sc ON sc.id = scs.calculation_id
WHERE sc.vehicle_id IN ('e7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002');
GRANT SELECT ON t_ids TO authenticated;
SET LOCAL ROLE authenticated;

SELECT is((SELECT amount FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000001'),
  5400.00::numeric, 'fixture: the 60% partner''s share is 5,400');

-- ─── Paying a share only through the function ────────────────────────────────
SELECT throws_ok($$ UPDATE public.settlements SET status = 'paid', paid_at = now()
  WHERE id = (SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000001') $$,
  '42501', NULL, 'a share cannot be marked paid directly');

SELECT is((public.preview_partner_settlement((SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000001')) ->> 'voucher_amount')::numeric,
  420.00::numeric, 'preview: 60% of the uncollected vouchers 500 + 200 = 420 (the collected 300 is not handed)');
SELECT throws_ok($$ SELECT public.pay_partner_settlement((SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000001'), 'cash', '') $$,
  '22023', NULL, 'a payment needs a reference');
SELECT lives_ok($$ SELECT public.pay_partner_settlement((SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000001'), 'bank_transfer', 'TRX-60') $$,
  'the office pays the 60% partner');
SELECT is((SELECT cash_amount FROM public.settlements WHERE id = (SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000001')),
  4980.00::numeric, 'cash part: 5,400 - 420 = 4,980');
SELECT is((SELECT count(*) FROM public.partner_voucher_shares WHERE partner_id = 'e7100000-0000-0000-0000-000000000001'), 2::bigint,
  'two vouchers are handed to the partner, each listed');
SELECT throws_ok($$ SELECT public.pay_partner_settlement((SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000001'), 'cash', 'again') $$,
  '22023', NULL, 'a share cannot be paid twice');
SELECT throws_ok($$ UPDATE public.settlements SET cash_amount = 5400, voucher_amount = 0
  WHERE id = (SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000001') $$,
  '23514', NULL, 'a paid share cannot be changed');

-- ─── Partners see their own vouchers ─────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"partner"}}';
SELECT is((SELECT count(*) FROM public.get_partner_vouchers() WHERE holder_status = 'with_you'), 2::bigint,
  'the partner sees both vouchers as theirs to collect');
SELECT lives_ok($$ SELECT public.collect_voucher('e7400000-0000-0000-0000-000000000004') $$,
  'the partner can mark a handed voucher collected');
SELECT is((SELECT holder_status FROM public.get_partner_vouchers() WHERE ride_id = 'e7400000-0000-0000-0000-000000000004'), 'collected_by_you',
  'it shows as collected by the partner');
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"role":"partner"}}';
SELECT throws_ok($$ SELECT * FROM public.get_partner_vouchers('e7100000-0000-0000-0000-000000000001') $$,
  '42501', NULL, 'a partner cannot see another partner''s vouchers');
SELECT is((SELECT count(*) FROM public.partner_voucher_shares), 0::bigint,
  'the 40% partner has no vouchers before being paid');

-- ─── The driver collects a handed voucher: the office owes the partner ───────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT public.collect_voucher('e7400000-0000-0000-0000-000000000002');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT is((SELECT holder_status FROM public.get_partner_vouchers('e7100000-0000-0000-0000-000000000001') WHERE ride_id = 'e7400000-0000-0000-0000-000000000002'),
  'owed_to_you', 'collected by the driver: the office owes the partner 300');
SELECT lives_ok($$ SELECT public.pay_out_voucher_share(
  (SELECT id FROM public.partner_voucher_shares WHERE ride_id = 'e7400000-0000-0000-0000-000000000002'), 'cash', 'R-300') $$,
  'the office pays the partner their part');
SELECT is((SELECT holder_status FROM public.get_partner_vouchers('e7100000-0000-0000-0000-000000000001') WHERE ride_id = 'e7400000-0000-0000-0000-000000000002'),
  'paid_to_you', 'and it shows as paid');
SELECT throws_ok($$ SELECT public.pay_out_voucher_share(
  (SELECT id FROM public.partner_voucher_shares WHERE ride_id = 'e7400000-0000-0000-0000-000000000004'), 'cash', 'x') $$,
  '22023', NULL, 'a voucher the partner collected themselves is not paid out');

-- The 40% partner is paid after every voucher was collected: all cash.
SELECT lives_ok($$ SELECT public.pay_partner_settlement((SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000002'), 'cash', 'C-40') $$,
  'the office pays the 40% partner');
SELECT is((SELECT cash_amount FROM public.settlements WHERE id = (SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000001' AND partner_id = 'e7100000-0000-0000-0000-000000000002')),
  3600.00::numeric, 'no voucher is still outstanding, so 3,600 is paid in cash');

-- ─── Vouchers worth more than the share ──────────────────────────────────────
SELECT throws_ok($$ SELECT public.pay_partner_settlement((SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000002'), 'cash', 'K-1') $$,
  '55000', NULL, 'vouchers (1,000) worth more than the share (400) cannot be handed over');
SELECT is((public.pay_partner_settlement((SELECT id FROM t_ids WHERE vehicle_id = 'e7000000-0000-0000-0000-000000000002'), 'cash', 'K-1', NULL, true) ->> 'cash_amount')::numeric,
  400.00::numeric, 'the office keeps the vouchers and pays the 400 share in cash');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
