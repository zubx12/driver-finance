-- =============================================================================
-- Phase 3D remediation: review of driver/company expenses (decision D5)
-- =============================================================================
-- Expenses a driver files as "Driver" or "Company" are stored without a
-- vehicle and never reduce a vehicle's net automatically (Phase 2). The office
-- now reviews each one and either:
--   * keeps it as a company cost (affects no payout), or
--   * charges it to a vehicle: it then counts like company expenses for that
--     vehicle's month (reduces the partner pool, not driver commission).
-- Only admins can set the review fields, and nothing can be charged to (or
-- removed from) a vehicle month whose payout is finalized.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Review fields
-- -----------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS charged_vehicle_id uuid REFERENCES public.vehicles(id),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_review_status_values
  CHECK (review_status IN ('unreviewed', 'company_cost', 'charged'));
-- A charged expense names its vehicle; only driver/company expenses can be charged.
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_charged_vehicle
  CHECK (
    (review_status = 'charged') = (charged_vehicle_id IS NOT NULL)
    AND (review_status = 'unreviewed' OR allocation <> 'Vehicle')
  );

CREATE INDEX IF NOT EXISTS idx_expenses_charged
  ON public.expenses (charged_vehicle_id, expense_date)
  WHERE review_status = 'charged';
CREATE INDEX IF NOT EXISTS idx_expenses_unallocated
  ON public.expenses (expense_date DESC)
  WHERE allocation <> 'Vehicle';

ALTER TABLE public.salary_calculations
  ADD COLUMN IF NOT EXISTS charged_expenses numeric(12,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.salary_calculations.charged_expenses IS
  'Driver/company expenses the office charged to this vehicle for the month.';
COMMENT ON COLUMN public.salary_calculations.net_revenue IS
  'total_revenue - total_expenses - company_expenses - charged_expenses.';

-- -----------------------------------------------------------------------------
-- 2. Entry rules: protect the review fields and finalized months
--    (replaces the function from 20261003000001; unchanged parts kept)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._check_entry_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
  v_old_date date;
  v_changed boolean;
  v_today date := public.app_today();
BEGIN
  IF TG_TABLE_NAME = 'rides' THEN
    v_date := NEW.ride_date;
  ELSE
    v_date := NEW.expense_date;

    -- Review fields decide which vehicle pays: admins only. Checked before the
    -- "nothing financial changed" shortcut below.
    IF NOT public.is_admin() AND public.my_driver_id() IS NOT NULL THEN
      IF TG_OP = 'INSERT' THEN
        IF NEW.review_status <> 'unreviewed' OR NEW.charged_vehicle_id IS NOT NULL THEN
          RAISE EXCEPTION 'Only the office can review expenses' USING ERRCODE = '42501';
        END IF;
      ELSIF (OLD.review_status, OLD.charged_vehicle_id, OLD.reviewed_by, OLD.reviewed_at)
            IS DISTINCT FROM (NEW.review_status, NEW.charged_vehicle_id, NEW.reviewed_by, NEW.reviewed_at) THEN
        RAISE EXCEPTION 'Only the office can review expenses' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'rides' THEN
      v_old_date := OLD.ride_date;
      v_changed := (OLD.amount, OLD.ride_date, OLD.vehicle_id, OLD.driver_id, OLD.payment_method)
        IS DISTINCT FROM (NEW.amount, NEW.ride_date, NEW.vehicle_id, NEW.driver_id, NEW.payment_method);
    ELSE
      v_old_date := OLD.expense_date;
      v_changed := (OLD.amount, OLD.expense_date, OLD.vehicle_id, OLD.driver_id, OLD.allocation,
                    OLD.payment_method, OLD.receipt_image_url, OLD.review_status, OLD.charged_vehicle_id)
        IS DISTINCT FROM (NEW.amount, NEW.expense_date, NEW.vehicle_id, NEW.driver_id, NEW.allocation,
                          NEW.payment_method, NEW.receipt_image_url, NEW.review_status, NEW.charged_vehicle_id);
    END IF;
    -- Non-financial changes (voucher collection, notes) are always allowed.
    IF NOT v_changed THEN
      RETURN NEW;
    END IF;
    PERFORM public._assert_entry_month_open(OLD.vehicle_id, v_old_date);
    IF TG_TABLE_NAME = 'expenses' THEN
      PERFORM public._assert_entry_month_open(OLD.charged_vehicle_id, v_old_date);
    END IF;
  END IF;

  PERFORM public._assert_entry_month_open(NEW.vehicle_id, v_date);
  IF TG_TABLE_NAME = 'expenses' THEN
    PERFORM public._assert_entry_month_open(NEW.charged_vehicle_id, v_date);
  END IF;

  -- Driver-only rules. Admins and server jobs (no driver identity) skip these.
  IF public.is_admin() OR NEW.driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RETURN NEW;
  END IF;

  IF v_date > v_today THEN
    RAISE EXCEPTION 'Entries cannot be dated in the future (% is after today, %).', v_date, v_today
      USING ERRCODE = '23514';
  END IF;
  IF v_date < v_today - 7 THEN
    RAISE EXCEPTION 'Entries older than 7 days (%) cannot be added from the app. Please send a correction request to the office.', v_date
      USING ERRCODE = '23514';
  END IF;

  IF NEW.vehicle_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM drivers WHERE id = NEW.driver_id AND vehicle_id = NEW.vehicle_id)
     AND NOT EXISTS (
       SELECT 1 FROM driver_compensation
       WHERE driver_id = NEW.driver_id AND vehicle_id = NEW.vehicle_id
         AND effective_from <= v_date AND (effective_to IS NULL OR effective_to > v_date)
     ) THEN
    RAISE EXCEPTION 'You are not assigned to this vehicle for %. Ask the office to check your vehicle assignment.', v_date
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'expenses' THEN
    IF TG_OP = 'INSERT' OR NEW.receipt_image_url IS DISTINCT FROM OLD.receipt_image_url THEN
      IF split_part(NEW.receipt_image_url, '/', 1) <> NEW.driver_id::text
         OR NOT EXISTS (
           SELECT 1 FROM storage.objects
           WHERE bucket_id = 'receipts' AND name = NEW.receipt_image_url
         ) THEN
        RAISE EXCEPTION 'The receipt photo was not found. Please take the photo again and resubmit.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Engine: include expenses charged to the vehicle (copied from
--    20260930000002 with the charged amount added)
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
  v_distributable := v_net - v_company - v_charged - v_driver_total - v_loss_in;
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
  IF v_net - v_company - v_charged
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
    'net_revenue', v_net - v_company - v_charged,
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
      total_revenue, total_expenses, company_expenses, charged_expenses, net_revenue, driver_pay_total,
      loss_brought_forward, loss_carried_forward, company_retained, warnings, calculated_at
    ) VALUES (
      p_vehicle_id, v_start, (v_result ->> 'period_end')::date, 'draft',
      (v_result ->> 'total_revenue')::numeric, (v_result ->> 'total_expenses')::numeric,
      (v_result ->> 'company_expenses')::numeric, (v_result ->> 'charged_expenses')::numeric,
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
-- 5. Admin decision on one driver/company expense
-- -----------------------------------------------------------------------------
-- p_decision: 'company_cost' (no payout effect), 'charged' (needs p_vehicle_id)
-- or 'unreviewed' (undo). The entry-rules trigger refuses the change when the
-- old or new vehicle's month is finalized; the change is written to the
-- audit log by the expenses audit trigger.
CREATE OR REPLACE FUNCTION public.review_unallocated_expense(
  p_expense_id uuid,
  p_decision text,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allocation text;
BEGIN
  PERFORM public._require_admin();

  SELECT allocation INTO v_allocation FROM expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_allocation = 'Vehicle' THEN
    RAISE EXCEPTION 'This expense is already a vehicle expense' USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('company_cost', 'charged', 'unreviewed') THEN
    RAISE EXCEPTION 'Decision must be company_cost, charged or unreviewed' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'charged' AND (p_vehicle_id IS NULL OR NOT EXISTS (SELECT 1 FROM vehicles WHERE id = p_vehicle_id)) THEN
    RAISE EXCEPTION 'Choose the vehicle to charge this expense to' USING ERRCODE = '22023';
  END IF;

  UPDATE expenses SET
    review_status = p_decision,
    charged_vehicle_id = CASE WHEN p_decision = 'charged' THEN p_vehicle_id END,
    reviewed_by = CASE WHEN p_decision = 'unreviewed' THEN NULL ELSE auth.uid() END,
    reviewed_at = CASE WHEN p_decision = 'unreviewed' THEN NULL ELSE now() END,
    updated_at = now()
  WHERE id = p_expense_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_unallocated_expense(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_unallocated_expense(uuid, text, uuid) TO authenticated;
