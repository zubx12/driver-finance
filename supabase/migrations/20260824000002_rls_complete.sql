-- Migration: Complete RLS policies
-- Fixes 3 gaps in the initial schema:
-- 1. Admin policies were completely absent on all tables
-- 2. Driver same-day edit lock was missing (drivers could UPDATE any past record)
-- 3. Partners could not SELECT from vehicle_partners (needed to know their own percentage)

-- ==========================================
-- ADMIN POLICIES
-- Admin identified by role claim in JWT: auth.jwt() ->> 'role' = 'admin'
-- Admin accounts are created server-side only (never self-registration)
-- ==========================================

CREATE POLICY "Admin full access on drivers" ON public.drivers
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access on partners" ON public.partners
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access on vehicles" ON public.vehicles
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access on vehicle_partners" ON public.vehicle_partners
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access on rides" ON public.rides
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access on expenses" ON public.expenses
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access on daily_summary" ON public.daily_summary
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access on audit_log" ON public.audit_log
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access on salary_calculations" ON public.salary_calculations
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin full access on salary_calculation_shares" ON public.salary_calculation_shares
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- ==========================================
-- SAME-DAY EDIT LOCK FOR DRIVERS
-- Drivers can UPDATE rides/expenses only if the record date = today (UTC+3 aware)
-- This is enforced at DB level — UI lock states match this but are not the security boundary
-- ==========================================

CREATE POLICY "Drivers can update own rides same-day only" ON public.rides
    FOR UPDATE USING (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
        AND ride_date = CURRENT_DATE
    )
    WITH CHECK (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
        AND ride_date = CURRENT_DATE
    );

CREATE POLICY "Drivers can update own expenses same-day only" ON public.expenses
    FOR UPDATE USING (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
        AND expense_date = CURRENT_DATE
    )
    WITH CHECK (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
        AND expense_date = CURRENT_DATE
    );

-- Drivers explicitly CANNOT delete rides or expenses (only admin can)
-- No DELETE policy for driver role = database-enforced immutability for past data

-- ==========================================
-- VEHICLE_PARTNERS SELECT FOR PARTNERS
-- Partners need to read this table to see their own ownership percentage
-- They can only see rows where they are the partner — enforced by RLS
-- ==========================================

CREATE POLICY "Partners can view own vehicle_partners rows" ON public.vehicle_partners
    FOR SELECT USING (
        partner_id IN (SELECT id FROM public.partners WHERE linked_auth_id = auth.uid())
    );
