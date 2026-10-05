-- N3: counts of what is waiting for the office (sidebar and tabs).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

-- Start from a known state inside this transaction (rolled back).
UPDATE public.cash_handovers SET status = 'confirmed', reviewed_at = coalesce(reviewed_at, now()) WHERE status = 'submitted';

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');
INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('a8800000-0000-0000-0000-000000000001', 'Car', 'Count', 2024, 'COUNT-1');
INSERT INTO public.drivers (id, name, linked_auth_id) VALUES
  ('a8820000-0000-0000-0000-000000000001', 'Count Driver', '00000000-0000-0000-0000-0000000000d1');
INSERT INTO public.cash_handovers (driver_id, amount, handover_date) VALUES
  ('a8820000-0000-0000-0000-000000000001', 100, public.app_today()),
  ('a8820000-0000-0000-0000-000000000001', 200, public.app_today());

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT public.get_admin_nav_counts() $$, '42501', NULL, 'a driver cannot read the office counts');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT is((public.get_admin_nav_counts() ->> 'handovers')::int, 2, 'handovers waiting are counted');
SELECT is((public.get_admin_nav_counts() ->> 'inbox')::int,
  (SELECT count(*)::int FROM public.cash_handovers WHERE status = 'submitted')
  + (SELECT count(*)::int FROM public.expenses WHERE allocation <> 'Vehicle' AND review_status = 'unreviewed')
  + (SELECT count(*)::int FROM public.correction_requests WHERE status = 'pending'),
  'the inbox count is handovers + expenses + corrections');

SELECT public.review_cash_handover((SELECT id FROM public.cash_handovers WHERE amount = 100 AND driver_id = 'a8820000-0000-0000-0000-000000000001'), 'confirmed');
SELECT is((public.get_admin_nav_counts() ->> 'handovers')::int, 1, 'a confirmed handover leaves the count');

INSERT INTO public.rides (driver_id, vehicle_id, amount, payment_method, ride_date)
VALUES ('a8820000-0000-0000-0000-000000000001', 'a8800000-0000-0000-0000-000000000001', 500, 'Voucher', public.app_today());
UPDATE public.rides SET payment_status = 'Outstanding'
WHERE driver_id = 'a8820000-0000-0000-0000-000000000001' AND payment_method = 'Voucher';
SELECT is((public.get_admin_nav_counts() ->> 'vouchers_outstanding')::int,
  (SELECT count(*)::int FROM public.rides WHERE payment_method = 'Voucher' AND payment_status = 'Outstanding'),
  'outstanding vouchers are counted');
SELECT ok((public.get_admin_nav_counts() ? 'vouchers_owed_to_partners'), 'voucher parts owed to partners are counted');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
