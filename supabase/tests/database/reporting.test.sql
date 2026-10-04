-- Phase 5: database totals, partner visibility by ownership dates, and the
-- partner's own share matching the payout.
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);

-- ─── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'p1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'p2@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'p3@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');

INSERT INTO public.vehicles (id, make, model, year, plate_number) VALUES
  ('a5000000-0000-0000-0000-00000000000a', 'Car', 'Shared', 2024, 'RP-A'),
  ('a5000000-0000-0000-0000-00000000000b', 'Car', 'Estimate', 2024, 'RP-B'),
  ('a5000000-0000-0000-0000-00000000000c', 'Car', 'Busy', 2024, 'RP-C');
INSERT INTO public.partners (id, name, linked_auth_id) VALUES
  ('b5000000-0000-0000-0000-000000000001', 'Partner One', '00000000-0000-0000-0000-0000000000e1'),
  ('b5000000-0000-0000-0000-000000000002', 'Partner Two', '00000000-0000-0000-0000-0000000000e2'),
  ('b5000000-0000-0000-0000-000000000003', 'Partner Three', '00000000-0000-0000-0000-0000000000e3');
INSERT INTO public.drivers (id, name, linked_auth_id, vehicle_id) VALUES
  ('c5000000-0000-0000-0000-000000000001', 'Driver One', '00000000-0000-0000-0000-0000000000d1', 'a5000000-0000-0000-0000-00000000000a'),
  ('c5000000-0000-0000-0000-000000000002', 'Driver Two', NULL, 'a5000000-0000-0000-0000-00000000000b');

-- Vehicle A changed hands 10 days ago: Partner One before, Partner Two after.
INSERT INTO public.vehicle_partners (vehicle_id, partner_id, percentage, effective_from, effective_to) VALUES
  ('a5000000-0000-0000-0000-00000000000a', 'b5000000-0000-0000-0000-000000000001', 100, '2020-01-01', public.app_today() - 10),
  ('a5000000-0000-0000-0000-00000000000a', 'b5000000-0000-0000-0000-000000000002', 100, public.app_today() - 10, NULL),
  ('a5000000-0000-0000-0000-00000000000b', 'b5000000-0000-0000-0000-000000000003', 100, '2020-01-01', NULL);
INSERT INTO public.driver_compensation (driver_id, vehicle_id, compensation_type, commission_percentage, pay_frequency, effective_from)
VALUES ('c5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-00000000000b', 'commission', 30, 'monthly', '2020-01-01');

INSERT INTO public.rides (id, driver_id, vehicle_id, amount, payment_method, ride_date) VALUES
  ('d5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 100, 'Cash', public.app_today() - 20),
  ('d5000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 200, 'Cash', public.app_today()),
  ('d5000000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-00000000000b', 1000, 'Cash', public.app_today());

-- 1,200 daily rows on vehicle C: more than the API's 1,000-row page.
INSERT INTO public.daily_summary (summary_date, driver_id, vehicle_id, total_revenue, total_expenses, net_revenue)
SELECT '2020-01-01'::date + n, 'c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000c', 1, 0, 1
FROM generate_series(0, 1199) n;

-- ─── Partner One (left 10 days ago) ──────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"partner"}}';

SELECT is((SELECT count(*) FROM public.rides WHERE id = 'd5000000-0000-0000-0000-000000000001'), 1::bigint,
  'M3: a former partner still sees rides from when they held a share');
SELECT is((SELECT count(*) FROM public.rides WHERE id = 'd5000000-0000-0000-0000-000000000002'), 0::bigint,
  'M3: a former partner does not see rides after they left');
SELECT is((SELECT count(*) FROM public.vehicles WHERE id = 'a5000000-0000-0000-0000-00000000000a'), 1::bigint,
  'a former partner still sees the vehicle name for past payouts');
SELECT is((SELECT total_revenue FROM public.get_period_financials(public.app_today() - 30, public.app_today())
           WHERE vehicle_id = 'a5000000-0000-0000-0000-00000000000a'), 100.00::numeric,
  'M3: a former partner''s totals cover only their ownership dates');

-- ─── Partner Two (joined 10 days ago) ────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"role":"partner"}}';

SELECT is((SELECT array_agg(id) FROM public.rides WHERE vehicle_id = 'a5000000-0000-0000-0000-00000000000a'),
          ARRAY['d5000000-0000-0000-0000-000000000002'::uuid],
  'M3: a new partner sees only rides from when they joined');
SELECT is((SELECT total_revenue FROM public.get_period_financials(public.app_today() - 30, public.app_today())
           WHERE vehicle_id = 'a5000000-0000-0000-0000-00000000000a'), 200.00::numeric,
  'M3: a new partner''s totals start when they joined');

-- ─── Admin ───────────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';

SELECT is((SELECT total_revenue FROM public.get_period_financials(public.app_today() - 30, public.app_today())
           WHERE vehicle_id = 'a5000000-0000-0000-0000-00000000000a'), 300.00::numeric,
  'admin totals include every partner period');
SELECT is((SELECT total_revenue FROM public.get_period_financials('2020-01-01', '2030-12-31')
           WHERE vehicle_id = 'a5000000-0000-0000-0000-00000000000c'), 1200.00::numeric,
  'H3: totals over 1,200 rows are complete (computed in the database)');
SELECT is((SELECT total_revenue FROM public.get_daily_totals(public.app_today(), public.app_today())), 1200.00::numeric,
  'daily totals add every vehicle for the day');

-- ─── Partner Three: share follows the payout through every stage ─────────────
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"role":"partner"}}';

SELECT is((SELECT status || ' ' || my_share FROM public.partner_period_summary(public.app_today())), 'estimate 700.00',
  'M7: estimate already deducts driver pay (1,000 - 30% commission)');
SELECT is((SELECT count(*) FROM public.partner_period_summary(public.app_today())), 1::bigint,
  'a partner only gets vehicles they hold a share in');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT public.calculate_salary('a5000000-0000-0000-0000-00000000000b', public.app_today());
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"role":"partner"}}';
SELECT is((SELECT status || ' ' || my_share FROM public.partner_period_summary(public.app_today())), 'draft 700.00',
  'draft shows the stored payout figure');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT public.finalize_salary((SELECT id FROM public.salary_calculations
  WHERE vehicle_id = 'a5000000-0000-0000-0000-00000000000b' AND period_start = date_trunc('month', public.app_today()::timestamp)::date));
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"role":"partner"}}';
SELECT is((SELECT status FROM public.partner_period_summary(public.app_today())), 'finalized',
  'finalized payout is shown as finalized');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","app_metadata":{"role":"admin"}}';
UPDATE public.settlements SET status = 'paid', paid_at = now() WHERE partner_id = 'b5000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"role":"partner"}}';
SELECT is((SELECT status FROM public.partner_period_summary(public.app_today())), 'paid',
  'paid settlement is shown as paid');

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"driver"}}';
SELECT throws_ok($$ SELECT * FROM public.partner_period_summary(public.app_today()) $$, '42501', NULL,
  'only partners can ask for a partner summary');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
