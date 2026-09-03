-- =============================================================================
-- Migration: Fix RLS Policies and Add Driver Pay Calculations
-- Part 1: Add missing driver SELECT policy on daily_summary
-- Part 2: Drop and recreate broken admin RLS policies (user_metadata JWT fix)
-- Part 3: Create driver_pay_calculations table & update salary_calculations
-- =============================================================================

-- =============================================================================
-- Part 1 — Add missing driver SELECT policy on daily_summary
-- =============================================================================

-- Prevents drivers from being unable to see their own daily summary data
-- (this policy was missing from the initial schema, causing empty results)
CREATE POLICY "Drivers can view own daily_summary" ON public.daily_summary
    FOR SELECT TO authenticated
    USING (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
    );

-- =============================================================================
-- Part 2 — Drop and recreate ALL broken admin RLS policies
-- =============================================================================

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on drivers" ON public.drivers;
CREATE POLICY "Admin full access on drivers" ON public.drivers
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on partners" ON public.partners;
CREATE POLICY "Admin full access on partners" ON public.partners
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on vehicles" ON public.vehicles;
CREATE POLICY "Admin full access on vehicles" ON public.vehicles
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on vehicle_partners" ON public.vehicle_partners;
CREATE POLICY "Admin full access on vehicle_partners" ON public.vehicle_partners
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on rides" ON public.rides;
CREATE POLICY "Admin full access on rides" ON public.rides
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on expenses" ON public.expenses;
CREATE POLICY "Admin full access on expenses" ON public.expenses
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on daily_summary" ON public.daily_summary;
CREATE POLICY "Admin full access on daily_summary" ON public.daily_summary
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on audit_log" ON public.audit_log;
CREATE POLICY "Admin full access on audit_log" ON public.audit_log
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on salary_calculations" ON public.salary_calculations;
CREATE POLICY "Admin full access on salary_calculations" ON public.salary_calculations
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on salary_calculation_shares" ON public.salary_calculation_shares;
CREATE POLICY "Admin full access on salary_calculation_shares" ON public.salary_calculation_shares
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Prevents admin from being locked out due to wrong JWT path
DROP POLICY IF EXISTS "Admin full access on driver_compensation" ON public.driver_compensation;
CREATE POLICY "Admin full access on driver_compensation" ON public.driver_compensation
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- =============================================================================
-- Part 3 — Create driver_pay_calculations table & update salary_calculations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driver_pay_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL REFERENCES public.salary_calculations(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    driver_compensation_id UUID REFERENCES public.driver_compensation(id) ON DELETE SET NULL,
    compensation_type TEXT NOT NULL CHECK (compensation_type IN ('commission', 'fixed_salary')),
    -- Snapshot of rates at calculation time (so historical records stay correct)
    commission_percentage NUMERIC(5,2),
    fixed_salary_amount NUMERIC(10,2),
    bonus_rate NUMERIC(5,2) DEFAULT 0,
    -- The computed result
    driver_pay_amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_pay_calc_id ON public.driver_pay_calculations(calculation_id);
CREATE INDEX IF NOT EXISTS idx_driver_pay_driver ON public.driver_pay_calculations(driver_id);

ALTER TABLE public.driver_pay_calculations ENABLE ROW LEVEL SECURITY;

-- Prevents drivers from seeing other drivers' pay calculations
CREATE POLICY "Drivers can view own pay calculations" ON public.driver_pay_calculations
    FOR SELECT TO authenticated
    USING (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
    );

-- Prevents admin from being locked out
CREATE POLICY "Admin full access on driver_pay_calculations" ON public.driver_pay_calculations
    FOR ALL TO authenticated
    USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
    WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Add to Realtime publication for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_pay_calculations;

-- Track total driver pay deducted in salary calculations
ALTER TABLE public.salary_calculations
    ADD COLUMN IF NOT EXISTS driver_pay_total NUMERIC(12,2) NOT NULL DEFAULT 0;
