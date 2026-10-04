-- =============================================================================
-- Phase 4 remediation: complete audit trail and corrections that take effect
-- =============================================================================
-- Fixes H7:
--   * the audit trigger only covered UPDATE on rides/expenses; inserts and
--     deletes, and every other money table, were not recorded
--   * approving a correction request changed nothing
--   * a driver could file a correction request that was already "approved"
--
-- Audit: INSERT/UPDATE/DELETE on every table that decides money or access is
-- recorded. The log is append-only (admins can only read it; see
-- 20260930000001) and is read through get_audit_log(), which adds names and
-- a field-by-field "from -> to" view.
--
-- Corrections (apply_correction):
--   * entry in an OPEN month  -> the entry itself is corrected (audited);
--   * entry in a FINALIZED month -> the paid record is left untouched and a
--     salary adjustment for the difference is added to the current month's
--     payout for that vehicle (its own line, partner pool only).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Audit trigger on every money/access table
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), NULL, auth.uid());
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Skip no-op updates so the log only holds real changes.
    IF to_jsonb(OLD) = to_jsonb(NEW) THEN
      RETURN NEW;
    END IF;
    INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, TG_OP, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, changed_by)
  VALUES (TG_TABLE_NAME, NEW.id, TG_OP, NULL, to_jsonb(NEW), auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rides_audit_trigger ON public.rides;
DROP TRIGGER IF EXISTS expenses_audit_trigger ON public.expenses;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rides', 'expenses', 'vehicle_partners', 'driver_compensation',
    'salary_calculations', 'settlements', 'correction_requests',
    'drivers', 'partners', 'vehicles', 'payers'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_audit', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_changes()',
      t || '_audit', t
    );
  END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON public.audit_log (changed_at DESC);

-- -----------------------------------------------------------------------------
-- 2. Salary adjustments (corrections to entries in finalized months)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  -- First day of the payout month the adjustment is included in.
  period_start date NOT NULL CHECK (period_start = date_trunc('month', period_start::timestamp)::date),
  -- Effect on the vehicle's net: positive raises it, negative lowers it.
  amount numeric(12,2) NOT NULL CHECK (amount <> 0),
  reason text NOT NULL,
  correction_request_id uuid UNIQUE REFERENCES public.correction_requests(id),
  source_type text CHECK (source_type IN ('ride', 'expense')),
  source_id uuid,
  original_values jsonb,
  corrected_values jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_adjustments_vehicle_month
  ON public.salary_adjustments (vehicle_id, period_start);

ALTER TABLE public.salary_adjustments ENABLE ROW LEVEL SECURITY;

-- Prevents non-admins from creating or changing adjustments.
CREATE POLICY "admin_all" ON public.salary_adjustments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- Partners see adjustments on vehicles they hold or held a share in.
CREATE POLICY "partner_read_linked" ON public.salary_adjustments FOR SELECT TO authenticated
  USING (vehicle_id IN (SELECT public.my_partner_vehicle_ids(true)));

-- An adjustment belongs to a payout month; once that month is finalized the
-- adjustment is part of the paid record (AGENTS.md rule 7).
CREATE OR REPLACE FUNCTION public._salary_adjustments_month_open()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vehicle uuid;
  v_period date;
BEGIN
  FOR i IN 1..2 LOOP
    IF i = 1 AND TG_OP <> 'DELETE' THEN
      v_vehicle := NEW.vehicle_id; v_period := NEW.period_start;
    ELSIF i = 2 AND TG_OP <> 'INSERT' THEN
      v_vehicle := OLD.vehicle_id; v_period := OLD.period_start;
    ELSE
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM salary_calculations
      WHERE vehicle_id = v_vehicle AND period_start = v_period AND status = 'finalized'
    ) THEN
      RAISE EXCEPTION 'The % payout for this vehicle is finalized; its adjustments cannot change',
        to_char(v_period, 'FMMonth YYYY') USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER salary_adjustments_month_open
  BEFORE INSERT OR UPDATE OR DELETE ON public.salary_adjustments
  FOR EACH ROW EXECUTE FUNCTION public._salary_adjustments_month_open();

CREATE TRIGGER salary_adjustments_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.salary_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_changes();

ALTER TABLE public.salary_calculations
  ADD COLUMN IF NOT EXISTS adjustments_total numeric(12,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.salary_calculations.adjustments_total IS
  'Sum of salary_adjustments for this vehicle and month (positive raises net).';
COMMENT ON COLUMN public.salary_calculations.net_revenue IS
  'total_revenue - total_expenses - company_expenses - charged_expenses + adjustments_total.';

-- -----------------------------------------------------------------------------
-- 3. Correction requests: outcome fields; drivers can only file pending ones
-- -----------------------------------------------------------------------------
ALTER TABLE public.correction_requests
  ADD COLUMN IF NOT EXISTS resolution text CHECK (resolution IN ('edited', 'adjusted', 'rejected')),
  ADD COLUMN IF NOT EXISTS salary_adjustment_id uuid REFERENCES public.salary_adjustments(id),
  ADD COLUMN IF NOT EXISTS applied_values jsonb;

DROP POLICY IF EXISTS "driver_insert_own" ON public.correction_requests;
-- Prevents a driver from filing a request for someone else, or one that is
-- already resolved.
CREATE POLICY "driver_insert_own" ON public.correction_requests FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = (SELECT public.my_driver_id())
    AND status = 'pending'
    AND resolution IS NULL AND resolved_at IS NULL AND resolved_by IS NULL
    AND admin_note IS NULL AND salary_adjustment_id IS NULL AND applied_values IS NULL
  );

-- -----------------------------------------------------------------------------
-- 4. Engine: include salary adjustments (copied from 20261004000001 with the
--    adjustment line added)
-- -----------------------------------------------------------------------------
-- Pure calculation: reads data, writes nothing, returns the full result.
CREATE OR REPLACE FUNCTION public._salary_compute(p_vehicle_id uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_next date := (date_trunc('month', p_month::timestamp) + interval '1 month')::date;
  v_end date := v_next - 1;
  v_days int := v_next - v_start;
  v_total_weight numeric := 100 * v_days;

  v_revenue numeric(12,2);
  v_expenses numeric(12,2);
  v_net numeric(12,2);
  v_company numeric(12,2) := 0;
  v_charged numeric(12,2) := 0;
  v_adjust numeric(12,2) := 0;
  v_loss_in numeric(12,2) := 0;
  v_driver_total numeric(12,2) := 0;
  v_distributable numeric(12,2);
  v_loss_out numeric(12,2) := 0;
  v_retained numeric(12,2) := 0;
  v_partner_weight numeric := 0;
  v_partner_count int := 0;
  v_rounded_sum numeric(12,2) := 0;
  v_remainder numeric(12,2) := 0;
  v_bad_day date;
  v_bad_total numeric;

  c record;
  v_seg_days int;
  v_seg_net numeric(12,2);
  v_commission numeric(12,2);
  v_salary numeric(12,2);
  v_bonus numeric(12,2);

  v_driver_pay jsonb := '[]'::jsonb;
  v_shares jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vehicles WHERE id = p_vehicle_id) THEN
    RAISE EXCEPTION 'Vehicle % not found', p_vehicle_id USING ERRCODE = 'P0002';
  END IF;

  -- Vehicle totals for the month, summed in the database (no row cap).
  SELECT coalesce(sum(total_revenue), 0), coalesce(sum(total_expenses), 0)
    INTO v_revenue, v_expenses
  FROM daily_summary
  WHERE vehicle_id = p_vehicle_id AND summary_date >= v_start AND summary_date < v_next;
  v_net := v_revenue - v_expenses;

  SELECT coalesce(company_expenses, 0) INTO v_company
  FROM salary_calculations
  WHERE vehicle_id = p_vehicle_id AND period_start = v_start;
  v_company := coalesce(v_company, 0);

  -- D5: driver/company expenses the office charged to this vehicle for this
  -- month. Treated like company expenses: they reduce the partner pool but
  -- not any driver's commission base.
  SELECT coalesce(sum(amount), 0) INTO v_charged
  FROM expenses
  WHERE charged_vehicle_id = p_vehicle_id AND review_status = 'charged'
    AND expense_date >= v_start AND expense_date < v_next;

  -- Phase 4: corrections to entries in finalized months, carried into this
  -- month (positive raises the net). Partner pool only.
  SELECT coalesce(sum(amount), 0) INTO v_adjust
  FROM salary_adjustments
  WHERE vehicle_id = p_vehicle_id AND period_start = v_start;

  -- D2: unrecovered loss from the latest finalized earlier month.
  SELECT loss_carried_forward INTO v_loss_in
  FROM salary_calculations
  WHERE vehicle_id = p_vehicle_id AND status = 'finalized' AND period_start < v_start
  ORDER BY period_start DESC
  LIMIT 1;
  v_loss_in := coalesce(v_loss_in, 0);

  -- Every day of the month must have splits totalling 0 or 100.
  SELECT d::date, t.total INTO v_bad_day, v_bad_total
  FROM generate_series(v_start::timestamp, v_end::timestamp, interval '1 day') d
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(vp.percentage), 0) AS total
    FROM vehicle_partners vp
    WHERE vp.vehicle_id = p_vehicle_id
      AND vp.effective_from <= d::date
      AND (vp.effective_to IS NULL OR vp.effective_to > d::date)
  ) t
  WHERE t.total NOT IN (0, 100)
  ORDER BY d
  LIMIT 1;
  IF v_bad_day IS NOT NULL THEN
    RAISE EXCEPTION 'Ownership splits total % percent on % (must be 100 percent). Fix the vehicle setup first.', v_bad_total, v_bad_day
      USING ERRCODE = '23514';
  END IF;

  -- D1/D2/D8: driver pay per set of terms, on that driver's own net.
  FOR c IN
    SELECT dc.id, dc.driver_id, dc.compensation_type, dc.commission_percentage,
           dc.fixed_salary_amount, coalesce(dc.bonus_rate, 0) AS bonus_rate,
           greatest(dc.effective_from, v_start) AS seg_from,
           least(coalesce(dc.effective_to, v_next), v_next) AS seg_to
    FROM driver_compensation dc
    WHERE dc.vehicle_id = p_vehicle_id
      AND dc.effective_from < v_next
      AND (dc.effective_to IS NULL OR dc.effective_to > v_start)
    ORDER BY dc.driver_id, dc.effective_from
  LOOP
    v_seg_days := c.seg_to - c.seg_from;
    CONTINUE WHEN v_seg_days <= 0;

    SELECT coalesce(sum(net_revenue), 0) INTO v_seg_net
    FROM daily_summary
    WHERE vehicle_id = p_vehicle_id AND driver_id = c.driver_id
      AND summary_date >= c.seg_from AND summary_date < c.seg_to;

    v_commission := 0;
    v_salary := 0;
    v_bonus := 0;
    IF c.compensation_type = 'commission' THEN
      v_commission := round(greatest(v_seg_net, 0) * c.commission_percentage / 100, 2);
    ELSE
      v_salary := round(coalesce(c.fixed_salary_amount, 0) * v_seg_days / v_days, 2);
      IF v_seg_net > 0 AND c.bonus_rate > 0 THEN
        v_bonus := round(v_seg_net * c.bonus_rate / 100, 2);
      END IF;
    END IF;

    v_driver_total := v_driver_total + v_commission + v_salary + v_bonus;
    v_driver_pay := v_driver_pay || jsonb_build_object(
      'driver_id', c.driver_id,
      'driver_compensation_id', c.id,
      'compensation_type', c.compensation_type,
      'commission_percentage', c.commission_percentage,
      'fixed_salary_amount', c.fixed_salary_amount,
      'bonus_rate', c.bonus_rate,
      'days_applied', v_seg_days,
      'base_net', v_seg_net,
      'commission_amount', v_commission,
      'salary_amount', v_salary,
      'bonus_amount', v_bonus,
      'driver_pay_amount', v_commission + v_salary + v_bonus
    );
  END LOOP;

  -- Legacy "any vehicle" terms are not charged to any vehicle: surface them.
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
           'type', 'unassigned_compensation', 'driver_id', dc.driver_id,
           'message', 'Driver has pay terms with no vehicle; they were not included. Set pay on the vehicle setup screen.')), '[]'::jsonb)
    INTO v_warnings
  FROM driver_compensation dc
  WHERE dc.vehicle_id IS NULL
    AND dc.effective_from < v_next
    AND (dc.effective_to IS NULL OR dc.effective_to > v_start)
    AND EXISTS (
      SELECT 1 FROM daily_summary ds
      WHERE ds.vehicle_id = p_vehicle_id AND ds.driver_id = dc.driver_id
        AND ds.summary_date >= v_start AND ds.summary_date < v_next
    );

  -- D2: pool for partners after company expenses, driver pay and old losses.
  v_distributable := v_net - v_company - v_charged + v_adjust - v_driver_total - v_loss_in;
  IF v_distributable < 0 THEN
    v_loss_out := -v_distributable;
    v_distributable := 0;
  END IF;

  -- D1: each partner's weight = sum over their rows of percentage x days.
  SELECT coalesce(sum(w.weight), 0), count(*)
    INTO v_partner_weight, v_partner_count
  FROM (
    SELECT vp.partner_id,
           sum(vp.percentage * (least(coalesce(vp.effective_to, v_next), v_next) - greatest(vp.effective_from, v_start))) AS weight
    FROM vehicle_partners vp
    WHERE vp.vehicle_id = p_vehicle_id
      AND vp.effective_from < v_next
      AND (vp.effective_to IS NULL OR vp.effective_to > v_start)
    GROUP BY vp.partner_id
  ) w;

  -- D4: round each amount, then give leftover cents to the largest share.
  SELECT coalesce(sum(round(v_distributable * w.weight / v_total_weight, 2)), 0)
    INTO v_rounded_sum
  FROM (
    SELECT sum(vp.percentage * (least(coalesce(vp.effective_to, v_next), v_next) - greatest(vp.effective_from, v_start))) AS weight
    FROM vehicle_partners vp
    WHERE vp.vehicle_id = p_vehicle_id
      AND vp.effective_from < v_next
      AND (vp.effective_to IS NULL OR vp.effective_to > v_start)
    GROUP BY vp.partner_id
  ) w;

  v_retained := round(v_distributable * (v_total_weight - v_partner_weight) / v_total_weight, 2);
  v_remainder := v_distributable - v_rounded_sum - v_retained;
  IF v_partner_count = 0 THEN
    v_retained := v_retained + v_remainder;
    v_remainder := 0;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'partner_id', r.partner_id,
           'ownership_percentage', round(r.weight / v_days, 2),
           'share_amount', r.amount + CASE WHEN r.rn = 1 THEN v_remainder ELSE 0 END
         ) ORDER BY r.rn), '[]'::jsonb)
    INTO v_shares
  FROM (
    -- Leftover cents go to the largest owner for the month (not the largest
    -- rounded amount, which ties whenever shares round to the same value).
    SELECT a.*, row_number() OVER (ORDER BY a.weight DESC, a.first_from, a.partner_id) AS rn
    FROM (
      SELECT vp.partner_id,
             min(vp.effective_from) AS first_from,
             sum(vp.percentage * (least(coalesce(vp.effective_to, v_next), v_next) - greatest(vp.effective_from, v_start))) AS weight,
             round(v_distributable * sum(vp.percentage * (least(coalesce(vp.effective_to, v_next), v_next) - greatest(vp.effective_from, v_start))) / v_total_weight, 2) AS amount
      FROM vehicle_partners vp
      WHERE vp.vehicle_id = p_vehicle_id
        AND vp.effective_from < v_next
        AND (vp.effective_to IS NULL OR vp.effective_to > v_start)
      GROUP BY vp.partner_id
    ) a
  ) r;

  -- The books must balance to the cent, or nothing is returned.
  IF v_net - v_company - v_charged + v_adjust
     <> v_driver_total
        + (SELECT coalesce(sum((s ->> 'share_amount')::numeric), 0) FROM jsonb_array_elements(v_shares) s)
        + v_retained + v_loss_in - v_loss_out THEN
    RAISE EXCEPTION 'Payout does not reconcile for vehicle % in % (internal error)', p_vehicle_id, v_start;
  END IF;

  RETURN jsonb_build_object(
    'vehicle_id', p_vehicle_id,
    'period_start', v_start,
    'period_end', v_end,
    'total_revenue', v_revenue,
    'total_expenses', v_expenses,
    'company_expenses', v_company,
    'charged_expenses', v_charged,
    'adjustments_total', v_adjust,
    'net_revenue', v_net - v_company - v_charged + v_adjust,
    'driver_pay_total', v_driver_total,
    'loss_brought_forward', v_loss_in,
    'loss_carried_forward', v_loss_out,
    'company_retained', v_retained,
    'partner_pool', v_distributable,
    'driver_pay', v_driver_pay,
    'shares', v_shares,
    'warnings', v_warnings
  );
END;
$$;

-- Calculate and store a draft. Locks the vehicle so runs are serialized.
CREATE OR REPLACE FUNCTION public._salary_write(p_vehicle_id uuid, p_month date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_result jsonb;
  v_calc_id uuid;
  v_status text;
BEGIN
  PERFORM 1 FROM vehicles WHERE id = p_vehicle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle % not found', p_vehicle_id USING ERRCODE = 'P0002';
  END IF;

  SELECT id, status INTO v_calc_id, v_status
  FROM salary_calculations
  WHERE vehicle_id = p_vehicle_id AND period_start = v_start;
  IF v_status = 'finalized' THEN
    RAISE EXCEPTION 'The % payout for this vehicle is already finalized', to_char(v_start, 'FMMonth YYYY')
      USING ERRCODE = '42501';
  END IF;

  v_result := public._salary_compute(p_vehicle_id, v_start);

  IF v_calc_id IS NULL THEN
    INSERT INTO salary_calculations (
      vehicle_id, period_start, period_end, status,
      total_revenue, total_expenses, company_expenses, charged_expenses, adjustments_total, net_revenue, driver_pay_total,
      loss_brought_forward, loss_carried_forward, company_retained, warnings, calculated_at
    ) VALUES (
      p_vehicle_id, v_start, (v_result ->> 'period_end')::date, 'draft',
      (v_result ->> 'total_revenue')::numeric, (v_result ->> 'total_expenses')::numeric,
      (v_result ->> 'company_expenses')::numeric, (v_result ->> 'charged_expenses')::numeric,
      (v_result ->> 'adjustments_total')::numeric,
      (v_result ->> 'net_revenue')::numeric,
      (v_result ->> 'driver_pay_total')::numeric, (v_result ->> 'loss_brought_forward')::numeric,
      (v_result ->> 'loss_carried_forward')::numeric, (v_result ->> 'company_retained')::numeric,
      v_result -> 'warnings', now()
    )
    RETURNING id INTO v_calc_id;
  ELSE
    DELETE FROM salary_calculation_shares WHERE calculation_id = v_calc_id;
    DELETE FROM driver_pay_calculations WHERE calculation_id = v_calc_id;
    UPDATE salary_calculations SET
      period_end = (v_result ->> 'period_end')::date,
      total_revenue = (v_result ->> 'total_revenue')::numeric,
      total_expenses = (v_result ->> 'total_expenses')::numeric,
      charged_expenses = (v_result ->> 'charged_expenses')::numeric,
      adjustments_total = (v_result ->> 'adjustments_total')::numeric,
      net_revenue = (v_result ->> 'net_revenue')::numeric,
      driver_pay_total = (v_result ->> 'driver_pay_total')::numeric,
      loss_brought_forward = (v_result ->> 'loss_brought_forward')::numeric,
      loss_carried_forward = (v_result ->> 'loss_carried_forward')::numeric,
      company_retained = (v_result ->> 'company_retained')::numeric,
      warnings = v_result -> 'warnings',
      calculated_at = now()
    WHERE id = v_calc_id;
  END IF;

  INSERT INTO salary_calculation_shares (calculation_id, partner_id, ownership_percentage, share_amount)
  SELECT v_calc_id, s.partner_id, s.ownership_percentage, s.share_amount
  FROM jsonb_to_recordset(v_result -> 'shares')
    AS s(partner_id uuid, ownership_percentage numeric, share_amount numeric);

  INSERT INTO driver_pay_calculations (
    calculation_id, driver_id, driver_compensation_id, compensation_type,
    commission_percentage, fixed_salary_amount, bonus_rate, days_applied, base_net,
    commission_amount, salary_amount, bonus_amount, driver_pay_amount
  )
  SELECT v_calc_id, d.driver_id, d.driver_compensation_id, d.compensation_type,
         d.commission_percentage, d.fixed_salary_amount, d.bonus_rate, d.days_applied, d.base_net,
         d.commission_amount, d.salary_amount, d.bonus_amount, d.driver_pay_amount
  FROM jsonb_to_recordset(v_result -> 'driver_pay') AS d(
    driver_id uuid, driver_compensation_id uuid, compensation_type text,
    commission_percentage numeric, fixed_salary_amount numeric, bonus_rate numeric,
    days_applied int, base_net numeric, commission_amount numeric, salary_amount numeric,
    bonus_amount numeric, driver_pay_amount numeric
  );

  RETURN v_calc_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Corrections: approve (and apply) or reject
-- -----------------------------------------------------------------------------
-- Returns 'edited' (entry corrected in an open month) or 'adjusted' (entry in
-- a finalized month; difference added to this month's payout).
CREATE OR REPLACE FUNCTION public.apply_correction(
  p_request_id uuid,
  p_amount numeric DEFAULT NULL,
  p_date date DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req correction_requests%ROWTYPE;
  v_old_amount numeric(12,2);
  v_old_date date;
  v_vehicle uuid;
  v_driver uuid;
  v_new_amount numeric(12,2);
  v_new_date date;
  v_finalized boolean;
  v_delta numeric(12,2);
  v_adjustment_id uuid;
  v_result text;
BEGIN
  PERFORM public._require_admin();

  SELECT * INTO v_req FROM correction_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been resolved' USING ERRCODE = '22023';
  END IF;

  IF v_req.record_type = 'ride' THEN
    SELECT amount, ride_date, vehicle_id, driver_id
      INTO v_old_amount, v_old_date, v_vehicle, v_driver
    FROM rides WHERE id = v_req.record_id FOR UPDATE;
  ELSE
    SELECT amount, expense_date, coalesce(vehicle_id, charged_vehicle_id), driver_id
      INTO v_old_amount, v_old_date, v_vehicle, v_driver
    FROM expenses WHERE id = v_req.record_id FOR UPDATE;
  END IF;
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'The entry this request refers to no longer exists' USING ERRCODE = 'P0002';
  END IF;
  IF v_driver <> v_req.driver_id THEN
    RAISE EXCEPTION 'The entry does not belong to the driver who asked for the correction' USING ERRCODE = '22023';
  END IF;

  v_new_amount := coalesce(round(p_amount, 2), v_old_amount);
  v_new_date := coalesce(p_date, v_old_date);
  IF v_new_amount < 0 THEN
    RAISE EXCEPTION 'The amount cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF v_new_amount = v_old_amount AND v_new_date = v_old_date THEN
    RAISE EXCEPTION 'Enter the corrected amount or date (nothing would change)' USING ERRCODE = '22023';
  END IF;

  v_finalized := v_vehicle IS NOT NULL AND EXISTS (
    SELECT 1 FROM salary_calculations
    WHERE vehicle_id = v_vehicle AND status = 'finalized'
      AND (v_old_date BETWEEN period_start AND period_end OR v_new_date BETWEEN period_start AND period_end)
  );

  IF NOT v_finalized THEN
    -- Open month: correct the entry itself. The entry-rules, rollup and audit
    -- triggers all run as for any other admin edit.
    IF v_req.record_type = 'ride' THEN
      UPDATE rides SET amount = v_new_amount, ride_date = v_new_date, updated_at = now()
      WHERE id = v_req.record_id;
    ELSE
      UPDATE expenses SET amount = v_new_amount, expense_date = v_new_date, updated_at = now()
      WHERE id = v_req.record_id;
    END IF;
    v_result := 'edited';
  ELSE
    -- Paid month: leave the paid record alone; carry the difference forward.
    IF v_new_date <> v_old_date THEN
      RAISE EXCEPTION 'This entry is in a finalized payout month, so its date cannot be changed. Correct the amount only; the difference will be added to this month''s payout.'
        USING ERRCODE = '22023';
    END IF;
    -- More revenue raises the net; more expense lowers it.
    v_delta := CASE WHEN v_req.record_type = 'ride' THEN v_new_amount - v_old_amount ELSE v_old_amount - v_new_amount END;

    INSERT INTO salary_adjustments (
      vehicle_id, period_start, amount, reason, correction_request_id,
      source_type, source_id, original_values, corrected_values, created_by
    ) VALUES (
      v_vehicle,
      date_trunc('month', public.app_today()::timestamp)::date,
      v_delta,
      format('Correction of %s dated %s: SAR %s -> SAR %s. %s',
             v_req.record_type, v_old_date, v_old_amount, v_new_amount, coalesce(nullif(p_note, ''), v_req.reason)),
      p_request_id,
      v_req.record_type,
      v_req.record_id,
      jsonb_build_object('amount', v_old_amount, 'date', v_old_date),
      jsonb_build_object('amount', v_new_amount, 'date', v_new_date),
      auth.uid()
    )
    RETURNING id INTO v_adjustment_id;
    v_result := 'adjusted';
  END IF;

  UPDATE correction_requests SET
    status = 'approved',
    resolution = v_result,
    salary_adjustment_id = v_adjustment_id,
    applied_values = jsonb_build_object(
      'amount_before', v_old_amount, 'amount_after', v_new_amount,
      'date_before', v_old_date, 'date_after', v_new_date),
    admin_note = nullif(p_note, ''),
    resolved_at = now(),
    resolved_by = auth.uid()
  WHERE id = p_request_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_correction(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._require_admin();
  UPDATE correction_requests SET
    status = 'rejected',
    resolution = 'rejected',
    admin_note = nullif(p_note, ''),
    resolved_at = now(),
    resolved_by = auth.uid()
  WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending request not found (it may already be resolved)' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Reading the audit log: names and a field-by-field view of each change
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_audit_log(
  p_table text DEFAULT NULL,
  p_record_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, changed_at timestamptz, table_name text, record_id uuid, action text,
  actor text, changes jsonb, snapshot jsonb, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._require_admin();
  RETURN QUERY
  SELECT
    a.id,
    a.changed_at,
    a.table_name,
    a.record_id,
    coalesce(a.action, 'UPDATE'),
    coalesce(
      d.name || ' (driver)',
      pa.name || ' (partner)',
      u.email,
      CASE WHEN a.changed_by IS NULL THEN 'System' ELSE 'Unknown user' END
    ),
    CASE
      -- Rows written by the first version of the trigger: one field each.
      WHEN a.field_changed IS NOT NULL THEN
        jsonb_build_object(a.field_changed, jsonb_build_object('from', a.old_value, 'to', a.new_value))
      WHEN coalesce(a.action, 'UPDATE') = 'UPDATE' THEN (
        SELECT coalesce(jsonb_object_agg(k, jsonb_build_object('from', a.old_values -> k, 'to', a.new_values -> k)), '{}'::jsonb)
        FROM jsonb_object_keys(coalesce(a.new_values, '{}'::jsonb)) k
        WHERE k <> 'updated_at' AND (a.old_values -> k) IS DISTINCT FROM (a.new_values -> k)
      )
    END,
    CASE a.action WHEN 'INSERT' THEN a.new_values WHEN 'DELETE' THEN a.old_values END,
    count(*) OVER ()
  FROM audit_log a
  LEFT JOIN auth.users u ON u.id = a.changed_by
  LEFT JOIN LATERAL (SELECT dr.name FROM drivers dr WHERE dr.linked_auth_id = a.changed_by LIMIT 1) d ON true
  LEFT JOIN LATERAL (SELECT p.name FROM partners p WHERE p.linked_auth_id = a.changed_by LIMIT 1) pa ON true
  WHERE (p_table IS NULL OR a.table_name = p_table)
    AND (p_record_id IS NULL OR a.record_id = p_record_id)
    AND (p_from IS NULL OR a.changed_at >= p_from)
    AND (p_to IS NULL OR a.changed_at < p_to + 1)
  ORDER BY a.changed_at DESC, a.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_correction(uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_correction(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_audit_log(text, uuid, date, date, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_correction(uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_correction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_log(text, uuid, date, date, int, int) TO authenticated;
