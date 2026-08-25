-- ─────────────────────────────────────────────────────────────────────────────
-- Enable Supabase Realtime publications
-- This allows the Admin and Partner dashboards to receive live push updates
-- whenever a driver syncs a ride, expense, or when a salary calculation changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- Core activity tables: emit change events to subscribed clients
ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;

-- Rollup table: Admin and Partner subscribe to this for live KPI updates.
-- Every INSERT/UPDATE here is triggered automatically by the DB triggers 
-- already in place (recalculate_daily_summary function).
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_summary;

-- Salary tables: Partner is notified when a calculation is finalized
ALTER PUBLICATION supabase_realtime ADD TABLE public.salary_calculations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settlements;

-- NOTE: correction_requests Realtime is enabled at the end of 20260825000002_correction_requests.sql
-- after the table is created.
