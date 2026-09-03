-- Section 1: Fix partner_settlement_view — add security_invoker
-- SEC-02: Recreate partner_settlement_view with security_invoker = true
-- Without this, the view runs as the owner (postgres) and bypasses RLS on all joined tables.
-- This means any partner could see ALL partners' settlement amounts across the fleet.
DROP VIEW IF EXISTS partner_settlement_view;
CREATE VIEW partner_settlement_view
WITH (security_invoker = true) AS
SELECT
    s.id,
    s.partner_id,
    p.name AS partner_name,
    s.amount,
    s.status,
    s.paid_at,
    s.payment_reference,
    s.notes,
    sc.period_start,
    sc.period_end,
    v.make || ' ' || v.model AS vehicle_name,
    v.plate_number,
    scs.ownership_percentage
FROM settlements s
JOIN partners p ON p.id = s.partner_id
JOIN salary_calculation_shares scs ON scs.id = s.share_id
JOIN salary_calculations sc ON sc.id = scs.calculation_id
JOIN vehicles v ON v.id = sc.vehicle_id;

-- Section 2: Fix storage RLS — wrong JWT path on storage.objects
-- SEC-03: Fix storage.objects admin policies to use correct JWT path
-- The old policies checked auth.jwt() ->> 'role' which is top-level and empty.
-- Admin role is stored in user_metadata, so we must use the nested path.
DROP POLICY IF EXISTS "Admin can read all receipts" ON storage.objects;
CREATE POLICY "Admin can read all receipts" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'receipts' AND (auth.jwt()->'user_metadata'->>'role') = 'admin');

DROP POLICY IF EXISTS "Admin can delete receipts" ON storage.objects;
CREATE POLICY "Admin can delete receipts" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'receipts' AND (auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Section 3: Fix SECURITY DEFINER trigger functions — add SET search_path
-- SEC-10: Add search_path to SECURITY DEFINER trigger functions
-- Without this, a malicious user could create objects in a different schema
-- that shadow the intended tables, leading to privilege escalation.

CREATE OR REPLACE FUNCTION log_audit_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        auth.uid()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Function to recalculate daily summary whenever a ride or expense is added/modified
CREATE OR REPLACE FUNCTION public.recalculate_daily_summary()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_date DATE;
    target_driver UUID;
    target_vehicle UUID;
    
    tot_revenue NUMERIC(12,2) := 0;
    c_revenue NUMERIC(12,2) := 0;
    v_revenue NUMERIC(12,2) := 0;
    
    tot_expenses NUMERIC(12,2) := 0;
    c_expenses NUMERIC(12,2) := 0;
    
    n_revenue NUMERIC(12,2) := 0;
BEGIN
    -- Determine the target dimensions based on whether it's INSERT/UPDATE or DELETE
    IF TG_OP = 'DELETE' THEN
        target_driver := OLD.driver_id;
        target_vehicle := OLD.vehicle_id;
        IF TG_TABLE_NAME = 'rides' THEN
            target_date := OLD.ride_date;
        ELSE
            target_date := OLD.expense_date;
        END IF;
    ELSE
        target_driver := NEW.driver_id;
        target_vehicle := NEW.vehicle_id;
        IF TG_TABLE_NAME = 'rides' THEN
            target_date := NEW.ride_date;
        ELSE
            target_date := NEW.expense_date;
        END IF;
    END IF;

    -- Calculate Revenue for this date/driver/vehicle combination
    SELECT 
        COALESCE(SUM(amount), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'Voucher' THEN amount ELSE 0 END), 0)
    INTO tot_revenue, c_revenue, v_revenue
    FROM public.rides
    WHERE driver_id = target_driver 
      AND vehicle_id = target_vehicle 
      AND ride_date = target_date;

    -- Calculate Expenses for this date/driver/vehicle combination
    SELECT 
        COALESCE(SUM(amount), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END), 0)
    INTO tot_expenses, c_expenses
    FROM public.expenses
    WHERE driver_id = target_driver 
      AND vehicle_id = target_vehicle 
      AND expense_date = target_date;
      
    n_revenue := tot_revenue - tot_expenses;

    -- Upsert the Daily Summary
    INSERT INTO public.daily_summary (
        summary_date, driver_id, vehicle_id, 
        total_revenue, cash_revenue, voucher_revenue, 
        total_expenses, cash_expenses, net_revenue, updated_at
    )
    VALUES (
        target_date, target_driver, target_vehicle, 
        tot_revenue, c_revenue, v_revenue, 
        tot_expenses, c_expenses, n_revenue, NOW()
    )
    ON CONFLICT (summary_date, driver_id, vehicle_id) 
    DO UPDATE SET 
        total_revenue = EXCLUDED.total_revenue,
        cash_revenue = EXCLUDED.cash_revenue,
        voucher_revenue = EXCLUDED.voucher_revenue,
        total_expenses = EXCLUDED.total_expenses,
        cash_expenses = EXCLUDED.cash_expenses,
        net_revenue = EXCLUDED.net_revenue,
        updated_at = NOW();

    -- If it's an UPDATE where driver/vehicle/date CHANGED, we must also recalculate the OLD grouping!
    IF TG_OP = 'UPDATE' THEN
        -- If driver, vehicle, or date changed, the old group's stats just got smaller.
        -- We won't do full dynamic triggers for moving records across dates here to keep it simple,
        -- but ideally you'd run a recalculation for OLD.driver_id, OLD.vehicle_id, OLD.date as well.
    END IF;

    RETURN NULL; -- AFTER trigger
END;
$$;
