-- =============================================================================
-- Phase 5 remediation: reporting accuracy and partner visibility by date
-- =============================================================================
-- Fixes:
--   H3  dashboards summed rows in the browser; the API returns at most 1,000
--       rows, so totals were silently cut off. Totals are now computed here.
--   M3  partner visibility was inconsistent: summaries and salary runs were
--       visible for any time, rides/expenses vanished once a partner left.
--       A partner now sees a vehicle's data for the dates they held a share.
--   M7  the partner dashboard showed net x percentage, ignoring driver pay,
--       so "your share" never matched the payout. partner_period_summary()
--       uses the payout engine itself.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Partner visibility by ownership dates
-- -----------------------------------------------------------------------------
-- True when the calling partner held a share in the vehicle on that date.
-- SECURITY DEFINER so the lookup does not re-enter row-level security.
CREATE OR REPLACE FUNCTION public.partner_linked_on(p_vehicle_id uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vehicle_partners vp
    JOIN partners p ON p.id = vp.partner_id
    WHERE p.linked_auth_id = auth.uid()
      AND vp.vehicle_id = p_vehicle_id
      AND vp.effective_from <= p_date
      AND (vp.effective_to IS NULL OR vp.effective_to > p_date)
  )
$$;

-- True when the calling partner held a share at any point in [p_start, p_end].
CREATE OR REPLACE FUNCTION public.partner_linked_during(p_vehicle_id uuid, p_start date, p_end date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vehicle_partners vp
    JOIN partners p ON p.id = vp.partner_id
    WHERE p.linked_auth_id = auth.uid()
      AND vp.vehicle_id = p_vehicle_id
      AND vp.effective_from <= p_end
      AND (vp.effective_to IS NULL OR vp.effective_to > p_start)
  )
$$;

REVOKE ALL ON FUNCTION public.partner_linked_on(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.partner_linked_during(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_linked_on(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_linked_during(uuid, date, date) TO authenticated;

-- Prevents a partner from seeing a vehicle's entries outside the dates they
-- held a share (before buying in, or after leaving).
DROP POLICY IF EXISTS "partner_read_linked" ON public.rides;
CREATE POLICY "partner_read_linked" ON public.rides FOR SELECT TO authenticated
  USING (public.partner_linked_on(vehicle_id, ride_date));

DROP POLICY IF EXISTS "partner_read_linked" ON public.expenses;
CREATE POLICY "partner_read_linked" ON public.expenses FOR SELECT TO authenticated
  USING (
    public.partner_linked_on(vehicle_id, expense_date)
    OR (review_status = 'charged' AND public.partner_linked_on(charged_vehicle_id, expense_date))
  );

DROP POLICY IF EXISTS "partner_read_linked" ON public.daily_summary;
CREATE POLICY "partner_read_linked" ON public.daily_summary FOR SELECT TO authenticated
  USING (public.partner_linked_on(vehicle_id, summary_date));

DROP POLICY IF EXISTS "partner_read_linked" ON public.salary_calculations;
CREATE POLICY "partner_read_linked" ON public.salary_calculations FOR SELECT TO authenticated
  USING (public.partner_linked_during(vehicle_id, period_start, period_end));

DROP POLICY IF EXISTS "partner_read_linked" ON public.salary_adjustments;
CREATE POLICY "partner_read_linked" ON public.salary_adjustments FOR SELECT TO authenticated
  USING (public.partner_linked_during(
    vehicle_id, period_start, (period_start + interval '1 month - 1 day')::date));

-- Vehicle name/plate stay visible for any vehicle the partner ever held, so
-- their past settlements and payouts still display.
DROP POLICY IF EXISTS "partner_read_linked" ON public.vehicles;
CREATE POLICY "partner_read_linked" ON public.vehicles FOR SELECT TO authenticated
  USING (id IN (SELECT public.my_partner_vehicle_ids(true)));

-- -----------------------------------------------------------------------------
-- 2. Totals computed in the database (no 1,000-row cap)
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER: the caller's row-level security applies, so an admin gets
-- every vehicle, a partner only their ownership dates, a driver their own.
CREATE OR REPLACE FUNCTION public.get_period_financials(p_start date, p_end date)
RETURNS TABLE (
  vehicle_id uuid,
  total_revenue numeric,
  cash_revenue numeric,
  voucher_revenue numeric,
  total_expenses numeric,
  cash_expenses numeric,
  net_revenue numeric
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT ds.vehicle_id,
         coalesce(sum(ds.total_revenue), 0),
         coalesce(sum(ds.cash_revenue), 0),
         coalesce(sum(ds.voucher_revenue), 0),
         coalesce(sum(ds.total_expenses), 0),
         coalesce(sum(ds.cash_expenses), 0),
         coalesce(sum(ds.net_revenue), 0)
  FROM daily_summary ds
  WHERE ds.summary_date BETWEEN p_start AND p_end
  GROUP BY ds.vehicle_id
$$;

CREATE OR REPLACE FUNCTION public.get_daily_totals(p_start date, p_end date)
RETURNS TABLE (summary_date date, total_revenue numeric, total_expenses numeric, net_revenue numeric)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT ds.summary_date,
         coalesce(sum(ds.total_revenue), 0),
         coalesce(sum(ds.total_expenses), 0),
         coalesce(sum(ds.net_revenue), 0)
  FROM daily_summary ds
  WHERE ds.summary_date BETWEEN p_start AND p_end
  GROUP BY ds.summary_date
  ORDER BY ds.summary_date
$$;

REVOKE ALL ON FUNCTION public.get_period_financials(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_daily_totals(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_period_financials(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_totals(date, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. The calling partner's own share per vehicle for a month
-- -----------------------------------------------------------------------------
-- status: 'estimate' (no run yet: live figure from the payout engine),
-- 'draft', 'finalized' or 'paid'. Only the caller's share is returned; other
-- partners' percentages and amounts stay hidden.
CREATE OR REPLACE FUNCTION public.partner_period_summary(p_month date)
RETURNS TABLE (
  vehicle_id uuid,
  vehicle_label text,
  status text,
  ownership_percentage numeric,
  total_revenue numeric,
  total_expenses numeric,
  net_revenue numeric,
  driver_pay_total numeric,
  partner_pool numeric,
  my_share numeric,
  loss_carried_forward numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_partner uuid := public.my_partner_id();
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date;
  v record;
  c salary_calculations%ROWTYPE;
  r jsonb;
  v_settlement text;
BEGIN
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Partner access required' USING ERRCODE = '42501';
  END IF;

  FOR v IN
    SELECT DISTINCT ve.id, ve.make || ' ' || ve.model || ' (' || ve.plate_number || ')' AS label
    FROM vehicle_partners vp
    JOIN vehicles ve ON ve.id = vp.vehicle_id
    WHERE vp.partner_id = v_partner
      AND vp.effective_from <= v_end
      AND (vp.effective_to IS NULL OR vp.effective_to > v_start)
  LOOP
    vehicle_id := v.id;
    vehicle_label := v.label;

    SELECT * INTO c FROM salary_calculations sc
    WHERE sc.vehicle_id = v.id AND sc.period_start = v_start;

    IF c.id IS NOT NULL THEN
      SELECT scs.ownership_percentage, scs.share_amount, st.status
        INTO ownership_percentage, my_share, v_settlement
      FROM salary_calculation_shares scs
      LEFT JOIN settlements st ON st.share_id = scs.id AND st.status <> 'void'
      WHERE scs.calculation_id = c.id AND scs.partner_id = v_partner;

      status := CASE WHEN v_settlement = 'paid' THEN 'paid' ELSE c.status END;
      total_revenue := c.total_revenue;
      -- Everything between revenue and net (vehicle, company and charged
      -- expenses, less adjustments), same as for estimates below.
      total_expenses := c.total_revenue - c.net_revenue;
      net_revenue := c.net_revenue;
      driver_pay_total := c.driver_pay_total;
      partner_pool := c.net_revenue - c.driver_pay_total - c.loss_brought_forward + c.loss_carried_forward - c.company_retained;
      loss_carried_forward := c.loss_carried_forward;
      my_share := coalesce(my_share, 0);
    ELSE
      BEGIN
        r := public._salary_compute(v.id, v_start);
      EXCEPTION WHEN OTHERS THEN
        -- e.g. splits not totalling 100 on some day: no reliable estimate.
        status := 'unavailable';
        ownership_percentage := NULL; total_revenue := NULL; total_expenses := NULL;
        net_revenue := NULL; driver_pay_total := NULL; partner_pool := NULL;
        my_share := NULL; loss_carried_forward := NULL;
        RETURN NEXT;
        CONTINUE;
      END;
      status := 'estimate';
      SELECT (s ->> 'ownership_percentage')::numeric, (s ->> 'share_amount')::numeric
        INTO ownership_percentage, my_share
      FROM jsonb_array_elements(r -> 'shares') s
      WHERE (s ->> 'partner_id')::uuid = v_partner;
      total_revenue := (r ->> 'total_revenue')::numeric;
      total_expenses := (r ->> 'total_revenue')::numeric - (r ->> 'net_revenue')::numeric;
      net_revenue := (r ->> 'net_revenue')::numeric;
      driver_pay_total := (r ->> 'driver_pay_total')::numeric;
      partner_pool := (r ->> 'partner_pool')::numeric - (r ->> 'company_retained')::numeric;
      loss_carried_forward := (r ->> 'loss_carried_forward')::numeric;
      my_share := coalesce(my_share, 0);
    END IF;

    RETURN NEXT;
    c := NULL;
    v_settlement := NULL;
    ownership_percentage := NULL;
    my_share := NULL;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_period_summary(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_period_summary(date) TO authenticated;
