-- SEC-05: Fix partner SELECT policy on salary_calculation_shares
-- The initial schema created this table with partner_id (not vehicle_partner_id).
-- Migration 20260824000005 tried to recreate with vehicle_partner_id but used
-- IF NOT EXISTS, so the original schema won. The actual column is partner_id.
DROP POLICY IF EXISTS "Partners can view own calculation shares" ON public.salary_calculation_shares;
CREATE POLICY "Partners can view own calculation shares" ON public.salary_calculation_shares
    FOR SELECT TO authenticated
    USING (
        (auth.jwt()->'user_metadata'->>'role') = 'partner'
        AND partner_id IN (
            SELECT p.id FROM public.partners p
            WHERE p.linked_auth_id = auth.uid()
        )
    );

-- PTR-03: Allow partners to read rides for their vehicles (read-only)  
-- Partners need this for the transactions view showing individual ride entries.
DROP POLICY IF EXISTS "Partners can view rides for their vehicles" ON public.rides;
CREATE POLICY "Partners can view rides for their vehicles" ON public.rides
    FOR SELECT TO authenticated
    USING (
        (auth.jwt()->'user_metadata'->>'role') = 'partner'
        AND vehicle_id IN (
            SELECT vp.vehicle_id FROM public.vehicle_partners vp
            WHERE vp.partner_id IN (
                SELECT p.id FROM public.partners p
                WHERE p.linked_auth_id = auth.uid()
            )
            AND vp.effective_to IS NULL
        )
    );

-- PTR-03: Allow partners to read expenses for their vehicles (read-only)
-- Partners need this for the expense tracking view.
DROP POLICY IF EXISTS "Partners can view expenses for their vehicles" ON public.expenses;
CREATE POLICY "Partners can view expenses for their vehicles" ON public.expenses
    FOR SELECT TO authenticated
    USING (
        (auth.jwt()->'user_metadata'->>'role') = 'partner'
        AND vehicle_id IN (
            SELECT vp.vehicle_id FROM public.vehicle_partners vp
            WHERE vp.partner_id IN (
                SELECT p.id FROM public.partners p
                WHERE p.linked_auth_id = auth.uid()
            )
            AND vp.effective_to IS NULL
        )
    );

-- PTR-03: Allow partners to read driver names (read-only)
-- Partners need basic driver info for transaction displays.
DROP POLICY IF EXISTS "Partners can view drivers for their vehicles" ON public.drivers;
CREATE POLICY "Partners can view drivers for their vehicles" ON public.drivers
    FOR SELECT TO authenticated
    USING (
        (auth.jwt()->'user_metadata'->>'role') = 'partner'
        AND (
            vehicle_id IN (
                SELECT vp.vehicle_id FROM public.vehicle_partners vp
                WHERE vp.partner_id IN (
                    SELECT p.id FROM public.partners p
                    WHERE p.linked_auth_id = auth.uid()
                )
                AND vp.effective_to IS NULL
            )
            OR id IN (
                SELECT DISTINCT e.driver_id FROM public.expenses e
                WHERE e.vehicle_id IN (
                    SELECT vp.vehicle_id FROM public.vehicle_partners vp
                    WHERE vp.partner_id IN (
                        SELECT p.id FROM public.partners p
                        WHERE p.linked_auth_id = auth.uid()
                    )
                    AND vp.effective_to IS NULL
                )
            )
        )
    );
