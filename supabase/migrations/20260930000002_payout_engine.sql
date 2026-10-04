-- =============================================================================
-- Phase 2 remediation: payout engine
-- =============================================================================
-- Implements docs/payout-rules.md (D1-D8). Replaces the payout maths that lived
-- in the run-salary API route, the admin salary page and the unused
-- calculate-salary edge function with ONE set of database functions that run
-- inside a transaction and verify their own result.
--
-- Fixes: C3 (company-expense edit ignored driver pay), C4 (driver pay dropped
-- after a mid-month save), C5 (double settlements, finalized rows editable),
-- H1 (current splits applied to past periods, silent failures), H2 (no 100%
-- rule in the database, non-atomic split saves), H3 (1,000-row cap in the
-- salary run), H5 (driver/company expenses charged to the vehicle), M1 (stale
-- rollup when a row moves), M4 (overlapping periods, rounding drift).
--
-- Conventions
--   * Effective dates are half-open: [effective_from, effective_to).
--   * Payout periods are whole calendar months.
--   * All money maths is numeric; every run checks
--       net - company expenses = driver pay + partner shares + company retained
--                                + loss brought forward - loss carried forward
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1. Pre-flight checks on existing data
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.vehicle_partners
  WHERE effective_to IS NOT NULL AND effective_to < effective_from;
  IF v_count > 0 THEN
    RAISE EXCEPTION '% vehicle_partners row(s) end before they start. Fix them before applying this migration: SELECT * FROM vehicle_partners WHERE effective_to < effective_from;', v_count;
  END IF;

  -- Zero-length rows cover no days and cannot affect any payout.
  DELETE FROM public.vehicle_partners WHERE effective_to = effective_from;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE 'Removed % zero-length vehicle_partners row(s).', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vehicle_partners a
  JOIN public.vehicle_partners b
    ON a.vehicle_id = b.vehicle_id AND a.partner_id = b.partner_id AND a.id < b.id
   AND daterange(a.effective_from, a.effective_to, '[)') && daterange(b.effective_from, b.effective_to, '[)');
  IF v_count > 0 THEN
    RAISE EXCEPTION '% overlapping vehicle_partners pair(s) for the same partner and vehicle. Resolve them before applying this migration.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.driver_compensation a
  JOIN public.driver_compensation b
    ON a.driver_id = b.driver_id AND a.vehicle_id = b.vehicle_id AND a.id < b.id
   AND daterange(a.effective_from, a.effective_to, '[)') && daterange(b.effective_from, b.effective_to, '[)');
  IF v_count > 0 THEN
    RAISE EXCEPTION '% overlapping driver_compensation pair(s) for the same driver and vehicle. Resolve them before applying this migration.', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.settlements WHERE status = 'paid'
    GROUP BY share_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'At least one partner share has been PAID more than once. This needs owner review (Phase 6) before applying: SELECT share_id, count(*) FROM settlements WHERE status = ''paid'' GROUP BY share_id HAVING count(*) > 1;';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 2. Ownership splits: no overlaps, and the 100% rule in the database
-- -----------------------------------------------------------------------------
ALTER TABLE public.vehicle_partners
  ADD CONSTRAINT vehicle_partners_valid_range
  CHECK (effective_to IS NULL OR effective_to > effective_from);

-- Prevents the same partner holding two overlapping splits on one vehicle.
ALTER TABLE public.vehicle_partners
  ADD CONSTRAINT vehicle_partners_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    partner_id WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  );

-- Checked at COMMIT so a save can close old rows and insert new ones first.
-- On every date where the split changes, a vehicle's splits must total
-- exactly 100 (or 0 = no partners).
CREATE OR REPLACE FUNCTION public._assert_vehicle_split_totals(p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
  v_total numeric;
BEGIN
  SELECT b.d, t.total INTO v_date, v_total
  FROM (
    SELECT effective_from AS d FROM vehicle_partners WHERE vehicle_id = p_vehicle_id
    UNION
    SELECT effective_to FROM vehicle_partners WHERE vehicle_id = p_vehicle_id AND effective_to IS NOT NULL
  ) b
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(vp.percentage), 0) AS total
    FROM vehicle_partners vp
    WHERE vp.vehicle_id = p_vehicle_id
      AND vp.effective_from <= b.d
      AND (vp.effective_to IS NULL OR vp.effective_to > b.d)
  ) t
  WHERE t.total NOT IN (0, 100)
  ORDER BY b.d
  LIMIT 1;

  IF v_date IS NOT NULL THEN
    RAISE EXCEPTION 'Ownership splits for vehicle % total % percent on % (must be exactly 100 percent)',
      p_vehicle_id, v_total, v_date
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- SECURITY DEFINER: the check helper is not executable by app roles.
CREATE OR REPLACE FUNCTION public._vehicle_partners_total_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM public._assert_vehicle_split_totals(NEW.vehicle_id);
  END IF;
  IF TG_OP <> 'INSERT' THEN
    PERFORM public._assert_vehicle_split_totals(OLD.vehicle_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS vehicle_partners_total_100 ON public.vehicle_partners;
CREATE CONSTRAINT TRIGGER vehicle_partners_total_100
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_partners
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public._vehicle_partners_total_trigger();

-- -----------------------------------------------------------------------------
-- 3. Driver compensation: one set of terms per driver per vehicle at a time
-- -----------------------------------------------------------------------------
ALTER TABLE public.driver_compensation
  ADD CONSTRAINT driver_compensation_no_overlap
  EXCLUDE USING gist (
    driver_id WITH =,
    vehicle_id WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  );

-- The engine charges pay to a specific vehicle; "any vehicle" rows are legacy.
ALTER TABLE public.driver_compensation
  ADD CONSTRAINT driver_compensation_vehicle_required
  CHECK (vehicle_id IS NOT NULL) NOT VALID;

-- -----------------------------------------------------------------------------
-- 4. Expenses: only vehicle expenses reduce a vehicle's net (D5)
-- -----------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS allocation text NOT NULL DEFAULT 'Vehicle';
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_allocation_values
  CHECK (allocation IN ('Vehicle', 'Driver', 'Company'));
ALTER TABLE public.expenses ALTER COLUMN vehicle_id DROP NOT NULL;
-- A vehicle expense must name the vehicle; driver/company expenses must not.
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_allocation_vehicle
  CHECK ((allocation = 'Vehicle') = (vehicle_id IS NOT NULL));

-- -----------------------------------------------------------------------------
-- 5. Daily rollup: skip non-vehicle expenses; refresh the OLD group too (M1)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._refresh_daily_summary(p_date date, p_driver_id uuid, p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revenue numeric(12,2);
  v_cash_revenue numeric(12,2);
  v_voucher_revenue numeric(12,2);
  v_expenses numeric(12,2);
  v_cash_expenses numeric(12,2);
BEGIN
  IF p_vehicle_id IS NULL OR p_driver_id IS NULL OR p_date IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(amount), 0),
         coalesce(sum(amount) FILTER (WHERE payment_method = 'Cash'), 0),
         coalesce(sum(amount) FILTER (WHERE payment_method = 'Voucher'), 0)
    INTO v_revenue, v_cash_revenue, v_voucher_revenue
  FROM rides
  WHERE driver_id = p_driver_id AND vehicle_id = p_vehicle_id AND ride_date = p_date;

  SELECT coalesce(sum(amount), 0),
         coalesce(sum(amount) FILTER (WHERE payment_method = 'Cash'), 0)
    INTO v_expenses, v_cash_expenses
  FROM expenses
  WHERE driver_id = p_driver_id AND vehicle_id = p_vehicle_id AND expense_date = p_date;

  INSERT INTO daily_summary (
    summary_date, driver_id, vehicle_id,
    total_revenue, cash_revenue, voucher_revenue,
    total_expenses, cash_expenses, net_revenue, updated_at
  ) VALUES (
    p_date, p_driver_id, p_vehicle_id,
    v_revenue, v_cash_revenue, v_voucher_revenue,
    v_expenses, v_cash_expenses, v_revenue - v_expenses, now()
  )
  ON CONFLICT (summary_date, driver_id, vehicle_id) DO UPDATE SET
    total_revenue = EXCLUDED.total_revenue,
    cash_revenue = EXCLUDED.cash_revenue,
    voucher_revenue = EXCLUDED.voucher_revenue,
    total_expenses = EXCLUDED.total_expenses,
    cash_expenses = EXCLUDED.cash_expenses,
    net_revenue = EXCLUDED.net_revenue,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public._refresh_daily_summary(date, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_daily_summary()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_date date;
  v_old_date date;
BEGIN
  IF TG_TABLE_NAME = 'rides' THEN
    IF TG_OP <> 'DELETE' THEN v_new_date := NEW.ride_date; END IF;
    IF TG_OP <> 'INSERT' THEN v_old_date := OLD.ride_date; END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN v_new_date := NEW.expense_date; END IF;
    IF TG_OP <> 'INSERT' THEN v_old_date := OLD.expense_date; END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    PERFORM public._refresh_daily_summary(v_new_date, NEW.driver_id, NEW.vehicle_id);
  END IF;

  -- A delete, or an update that moved the row to another day/driver/vehicle,
  -- must also shrink the group the row left.
  IF TG_OP = 'DELETE' THEN
    PERFORM public._refresh_daily_summary(v_old_date, OLD.driver_id, OLD.vehicle_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF (v_old_date, OLD.driver_id, OLD.vehicle_id) IS DISTINCT FROM (v_new_date, NEW.driver_id, NEW.vehicle_id) THEN
      PERFORM public._refresh_daily_summary(v_old_date, OLD.driver_id, OLD.vehicle_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Salary calculations: new columns, whole months, no overlaps, immutable
--    once finalized (C5)
-- -----------------------------------------------------------------------------
ALTER TABLE public.salary_calculations
  ADD COLUMN IF NOT EXISTS loss_brought_forward numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loss_carried_forward numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_retained numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.salary_calculations.total_expenses IS
  'Vehicle expenses for the month (company expenses are separate).';
COMMENT ON COLUMN public.salary_calculations.net_revenue IS
  'total_revenue - total_expenses - company_expenses.';
COMMENT ON COLUMN public.salary_calculations.company_retained IS
  'Share of the partner pool for days on which the vehicle had no partners.';

-- New rows must cover exactly one calendar month (legacy rows are left alone).
ALTER TABLE public.salary_calculations
  ADD CONSTRAINT salary_calculations_whole_month
  CHECK (
    period_start = date_trunc('month', period_start::timestamp)::date
    AND period_end = (date_trunc('month', period_start::timestamp) + interval '1 month - 1 day')::date
  ) NOT VALID;

-- Prevents the same revenue being counted in two calculations.
CREATE OR REPLACE FUNCTION public._salary_calculations_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM salary_calculations sc
    WHERE sc.vehicle_id = NEW.vehicle_id
      AND sc.id <> NEW.id
      AND daterange(sc.period_start, sc.period_end, '[]') && daterange(NEW.period_start, NEW.period_end, '[]')
  ) THEN
    RAISE EXCEPTION 'Another salary calculation for this vehicle already covers part of % to %', NEW.period_start, NEW.period_end
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS salary_calculations_no_overlap ON public.salary_calculations;
CREATE TRIGGER salary_calculations_no_overlap
  BEFORE INSERT OR UPDATE OF vehicle_id, period_start, period_end ON public.salary_calculations
  FOR EACH ROW EXECUTE FUNCTION public._salary_calculations_no_overlap();

-- Finalized calculations are historical record (AGENTS.md rule 7).
CREATE OR REPLACE FUNCTION public._salary_calculations_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'Salary calculation % is finalized and cannot be changed', OLD.id
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS salary_calculations_immutable ON public.salary_calculations;
CREATE TRIGGER salary_calculations_immutable
  BEFORE UPDATE OR DELETE ON public.salary_calculations
  FOR EACH ROW EXECUTE FUNCTION public._salary_calculations_immutable();

CREATE OR REPLACE FUNCTION public._salary_children_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_calc_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_calc_id := OLD.calculation_id; ELSE v_calc_id := NEW.calculation_id; END IF;
  IF EXISTS (SELECT 1 FROM salary_calculations WHERE id = v_calc_id AND status = 'finalized') THEN
    RAISE EXCEPTION 'Salary calculation % is finalized; its lines cannot be changed', v_calc_id
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.calculation_id IS DISTINCT FROM NEW.calculation_id
       AND EXISTS (SELECT 1 FROM salary_calculations WHERE id = OLD.calculation_id AND status = 'finalized') THEN
      RAISE EXCEPTION 'Cannot move lines out of a finalized calculation' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS salary_calculation_shares_immutable ON public.salary_calculation_shares;
CREATE TRIGGER salary_calculation_shares_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.salary_calculation_shares
  FOR EACH ROW EXECUTE FUNCTION public._salary_children_immutable();

DROP TRIGGER IF EXISTS driver_pay_calculations_immutable ON public.driver_pay_calculations;
CREATE TRIGGER driver_pay_calculations_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.driver_pay_calculations
  FOR EACH ROW EXECUTE FUNCTION public._salary_children_immutable();

ALTER TABLE public.driver_pay_calculations
  ADD COLUMN IF NOT EXISTS days_applied integer,
  ADD COLUMN IF NOT EXISTS base_net numeric(12,2),
  ADD COLUMN IF NOT EXISTS commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_amount numeric(12,2) NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 7. Settlements: at most one live settlement per share (C5)
-- -----------------------------------------------------------------------------
ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_status_check;
ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_status_check CHECK (status IN ('pending', 'paid', 'void'));

-- Duplicates created by a double finalize: keep the paid one (or the oldest),
-- void the rest. Nothing is deleted. Duplicate PAID rows were rejected above.
DO $$
DECLARE
  v_count int;
BEGIN
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY share_id
             ORDER BY (status = 'paid') DESC, created_at, id
           ) AS rn
    FROM public.settlements
    WHERE status <> 'void'
  )
  UPDATE public.settlements s
  SET status = 'void',
      notes = concat_ws(' | ', s.notes, 'Voided: duplicate created by double finalize (migration 20260930000002)')
  FROM ranked r
  WHERE r.id = s.id AND r.rn > 1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE 'Voided % duplicate pending settlement(s).', v_count;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS settlements_one_live_per_share
  ON public.settlements (share_id) WHERE status <> 'void';

-- Partners should not see voided duplicates.
DROP VIEW IF EXISTS public.partner_settlement_view;
CREATE VIEW public.partner_settlement_view
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
JOIN vehicles v ON v.id = sc.vehicle_id
WHERE s.status <> 'void';

-- -----------------------------------------------------------------------------
-- 8. The engine
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
  v_distributable := v_net - v_company - v_driver_total - v_loss_in;
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
  IF v_net - v_company
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
    'net_revenue', v_net - v_company,
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
      total_revenue, total_expenses, company_expenses, net_revenue, driver_pay_total,
      loss_brought_forward, loss_carried_forward, company_retained, warnings, calculated_at
    ) VALUES (
      p_vehicle_id, v_start, (v_result ->> 'period_end')::date, 'draft',
      (v_result ->> 'total_revenue')::numeric, (v_result ->> 'total_expenses')::numeric,
      (v_result ->> 'company_expenses')::numeric, (v_result ->> 'net_revenue')::numeric,
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

-- Draft every vehicle that is active or had activity in the month. One
-- vehicle failing does not stop the others; each result is reported.
CREATE OR REPLACE FUNCTION public._run_salary_month(p_month date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_next date := (date_trunc('month', p_month::timestamp) + interval '1 month')::date;
  v record;
  v_results jsonb := '[]'::jsonb;
  v_calc_id uuid;
BEGIN
  FOR v IN
    SELECT ve.id, ve.make || ' ' || ve.model || ' (' || ve.plate_number || ')' AS label
    FROM vehicles ve
    WHERE ve.status = 'Active'
       OR EXISTS (
         SELECT 1 FROM daily_summary ds
         WHERE ds.vehicle_id = ve.id AND ds.summary_date >= v_start AND ds.summary_date < v_next
       )
    ORDER BY ve.make, ve.model, ve.plate_number
  LOOP
    IF EXISTS (
      SELECT 1 FROM salary_calculations
      WHERE vehicle_id = v.id AND period_start = v_start AND status = 'finalized'
    ) THEN
      v_results := v_results || jsonb_build_object('vehicle_id', v.id, 'vehicle', v.label, 'status', 'skipped_finalized');
      CONTINUE;
    END IF;

    BEGIN
      v_calc_id := public._salary_write(v.id, v_start);
      v_results := v_results || jsonb_build_object('vehicle_id', v.id, 'vehicle', v.label, 'status', 'calculated', 'calculation_id', v_calc_id);
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_build_object('vehicle_id', v.id, 'vehicle', v.label, 'status', 'error', 'error', SQLERRM);
    END;
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION public._salary_compute(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._salary_write(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._run_salary_month(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assert_vehicle_split_totals(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. Admin entry points (called by the app with the admin's session)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_salary_month(p_month date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._require_admin();
  RETURN public._run_salary_month(p_month);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_salary(p_vehicle_id uuid, p_month date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._require_admin();
  RETURN public._salary_write(p_vehicle_id, p_month);
END;
$$;

-- C3: company expenses are saved and the whole draft is recalculated by the
-- engine, so driver pay and partner shares always stay consistent.
CREATE OR REPLACE FUNCTION public.set_company_expenses(p_calc_id uuid, p_amount numeric, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_calc salary_calculations%ROWTYPE;
BEGIN
  PERFORM public._require_admin();
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Company expenses must be zero or more' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_calc FROM salary_calculations WHERE id = p_calc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calculation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_calc.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft calculations can be edited' USING ERRCODE = '42501';
  END IF;

  UPDATE salary_calculations
  SET company_expenses = round(p_amount, 2), admin_notes = p_notes
  WHERE id = p_calc_id;

  RETURN public._salary_write(v_calc.vehicle_id, v_calc.period_start);
END;
$$;

-- C5: one transaction, row-locked, so a double click cannot create two sets of
-- settlements. Refuses stale drafts and out-of-order months.
CREATE OR REPLACE FUNCTION public.finalize_salary(p_calc_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_calc salary_calculations%ROWTYPE;
  v_fresh jsonb;
BEGIN
  PERFORM public._require_admin();

  SELECT * INTO v_calc FROM salary_calculations WHERE id = p_calc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calculation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_calc.status = 'finalized' THEN
    RAISE EXCEPTION 'This payout is already finalized' USING ERRCODE = '42501';
  END IF;
  IF v_calc.period_start <> date_trunc('month', v_calc.period_start::timestamp)::date
     OR v_calc.period_end <> (date_trunc('month', v_calc.period_start::timestamp) + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'This draft does not cover a whole calendar month. Re-run the month before finalizing.'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM salary_calculations
    WHERE vehicle_id = v_calc.vehicle_id AND status = 'draft' AND period_start < v_calc.period_start
  ) THEN
    RAISE EXCEPTION 'Finalize or delete this vehicle''s earlier draft months first (losses carry forward in order).'
      USING ERRCODE = '22023';
  END IF;

  -- The stored draft must match a fresh calculation (late entries, changed
  -- terms or an earlier month finalized since the draft was made).
  v_fresh := public._salary_compute(v_calc.vehicle_id, v_calc.period_start);
  IF (v_fresh ->> 'net_revenue')::numeric <> v_calc.net_revenue
     OR (v_fresh ->> 'driver_pay_total')::numeric <> v_calc.driver_pay_total
     OR (v_fresh ->> 'loss_brought_forward')::numeric <> v_calc.loss_brought_forward
     OR (v_fresh ->> 'loss_carried_forward')::numeric <> v_calc.loss_carried_forward
     OR (v_fresh ->> 'company_retained')::numeric <> v_calc.company_retained
     OR EXISTS (
       (SELECT partner_id, share_amount FROM jsonb_to_recordset(v_fresh -> 'shares') AS x(partner_id uuid, share_amount numeric)
        EXCEPT
        SELECT partner_id, share_amount FROM salary_calculation_shares WHERE calculation_id = p_calc_id)
       UNION ALL
       (SELECT partner_id, share_amount FROM salary_calculation_shares WHERE calculation_id = p_calc_id
        EXCEPT
        SELECT partner_id, share_amount FROM jsonb_to_recordset(v_fresh -> 'shares') AS x(partner_id uuid, share_amount numeric))
     )
     OR EXISTS (
       (SELECT driver_compensation_id, driver_pay_amount FROM jsonb_to_recordset(v_fresh -> 'driver_pay') AS x(driver_compensation_id uuid, driver_pay_amount numeric)
        EXCEPT
        SELECT driver_compensation_id, driver_pay_amount FROM driver_pay_calculations WHERE calculation_id = p_calc_id)
       UNION ALL
       (SELECT driver_compensation_id, driver_pay_amount FROM driver_pay_calculations WHERE calculation_id = p_calc_id
        EXCEPT
        SELECT driver_compensation_id, driver_pay_amount FROM jsonb_to_recordset(v_fresh -> 'driver_pay') AS x(driver_compensation_id uuid, driver_pay_amount numeric))
     )
  THEN
    RAISE EXCEPTION 'The data changed since this draft was calculated. Re-run the month, review it, then finalize.'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO settlements (share_id, partner_id, amount, status)
  SELECT scs.id, scs.partner_id, scs.share_amount, 'pending'
  FROM salary_calculation_shares scs
  WHERE scs.calculation_id = p_calc_id AND scs.share_amount > 0
  ON CONFLICT (share_id) WHERE status <> 'void' DO NOTHING;

  UPDATE salary_calculations
  SET status = 'finalized', finalized_at = now(), finalized_by = auth.uid()
  WHERE id = p_calc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_salary_draft(p_calc_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._require_admin();
  DELETE FROM salary_calculations WHERE id = p_calc_id AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found (finalized payouts cannot be deleted)' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Refuses to change terms on days already covered by a finalized payout.
CREATE OR REPLACE FUNCTION public._assert_not_finalized(p_vehicle_id uuid, p_from date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last date;
BEGIN
  SELECT max(period_end) INTO v_last
  FROM salary_calculations
  WHERE vehicle_id = p_vehicle_id AND status = 'finalized';
  IF v_last IS NOT NULL AND p_from <= v_last THEN
    RAISE EXCEPTION 'Payouts for this vehicle are finalized up to %. Changes must start on % or later.', v_last, v_last + 1
      USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Close a driver's terms on a vehicle from p_from (same-day/future rows removed).
CREATE OR REPLACE FUNCTION public._close_driver_compensation(p_driver_id uuid, p_vehicle_id uuid, p_from date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM driver_compensation
  WHERE driver_id = p_driver_id AND vehicle_id = p_vehicle_id AND effective_from >= p_from;
  UPDATE driver_compensation
  SET effective_to = p_from
  WHERE driver_id = p_driver_id AND vehicle_id = p_vehicle_id
    AND effective_from < p_from
    AND (effective_to IS NULL OR effective_to > p_from);
END;
$$;

REVOKE ALL ON FUNCTION public._require_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assert_not_finalized(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._close_driver_compensation(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- C4/H2: splits and driver pay saved in one transaction. Unchanged terms are
-- left alone, so re-saving the screen no longer re-dates driver pay.
CREATE OR REPLACE FUNCTION public.set_vehicle_setup(
  p_vehicle_id uuid,
  p_splits jsonb,
  p_driver_pay jsonb DEFAULT NULL,
  p_effective_from date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from date := coalesce(p_effective_from, public.app_today());
  v_rows int;
  v_distinct int;
  v_total numeric;
  v_all_valid boolean;
  v_unknown int;
  v_drivers uuid[];
  v_driver_id uuid;
  v_type text;
  v_commission numeric;
  v_salary numeric;
  v_bonus numeric;
BEGIN
  PERFORM public._require_admin();

  PERFORM 1 FROM vehicles WHERE id = p_vehicle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public._assert_not_finalized(p_vehicle_id, v_from);

  -- ── Ownership splits ──
  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'At least one partner split is required' USING ERRCODE = '22023';
  END IF;

  -- Percentages are stored with 2 decimals, so validate the rounded values.
  SELECT count(*), count(DISTINCT s.partner_id), coalesce(sum(round(s.percentage, 2)), 0),
         bool_and(s.partner_id IS NOT NULL AND s.percentage > 0 AND s.percentage <= 100)
    INTO v_rows, v_distinct, v_total, v_all_valid
  FROM jsonb_to_recordset(p_splits) AS s(partner_id uuid, percentage numeric);

  IF NOT v_all_valid THEN
    RAISE EXCEPTION 'Every split needs a partner and a percentage above 0' USING ERRCODE = '22023';
  END IF;
  IF v_distinct <> v_rows THEN
    RAISE EXCEPTION 'A partner appears more than once' USING ERRCODE = '22023';
  END IF;
  IF v_total <> 100 THEN
    RAISE EXCEPTION 'Splits must total exactly 100 percent (got % percent)', v_total USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_unknown
  FROM jsonb_to_recordset(p_splits) AS s(partner_id uuid, percentage numeric)
  WHERE NOT EXISTS (SELECT 1 FROM partners p WHERE p.id = s.partner_id);
  IF v_unknown > 0 THEN
    RAISE EXCEPTION 'Unknown partner in splits' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    (SELECT s.partner_id, s.percentage::numeric(5,2) FROM jsonb_to_recordset(p_splits) AS s(partner_id uuid, percentage numeric)
     EXCEPT
     SELECT partner_id, percentage FROM vehicle_partners
     WHERE vehicle_id = p_vehicle_id AND effective_from <= v_from AND (effective_to IS NULL OR effective_to > v_from))
    UNION ALL
    (SELECT partner_id, percentage FROM vehicle_partners
     WHERE vehicle_id = p_vehicle_id AND effective_from <= v_from AND (effective_to IS NULL OR effective_to > v_from)
     EXCEPT
     SELECT s.partner_id, s.percentage::numeric(5,2) FROM jsonb_to_recordset(p_splits) AS s(partner_id uuid, percentage numeric))
  ) THEN
    IF EXISTS (SELECT 1 FROM vehicle_partners WHERE vehicle_id = p_vehicle_id AND effective_from > v_from) THEN
      RAISE EXCEPTION 'This vehicle has splits starting after %; remove them first', v_from USING ERRCODE = '22023';
    END IF;

    DELETE FROM vehicle_partners WHERE vehicle_id = p_vehicle_id AND effective_from = v_from;
    UPDATE vehicle_partners
    SET effective_to = v_from
    WHERE vehicle_id = p_vehicle_id
      AND effective_from < v_from
      AND (effective_to IS NULL OR effective_to > v_from);
    INSERT INTO vehicle_partners (vehicle_id, partner_id, percentage, effective_from)
    SELECT p_vehicle_id, s.partner_id, s.percentage, v_from
    FROM jsonb_to_recordset(p_splits) AS s(partner_id uuid, percentage numeric);
  END IF;

  -- ── Driver pay (optional) ──
  IF p_driver_pay IS NULL OR jsonb_typeof(p_driver_pay) = 'null' THEN
    RETURN;
  END IF;

  v_type := p_driver_pay ->> 'compensation_type';
  v_commission := nullif(p_driver_pay ->> 'commission_percentage', '')::numeric;
  v_salary := nullif(p_driver_pay ->> 'fixed_salary_amount', '')::numeric;
  v_bonus := coalesce(nullif(p_driver_pay ->> 'bonus_rate', '')::numeric, 0);

  IF v_type NOT IN ('commission', 'fixed_salary') OR v_type IS NULL THEN
    RAISE EXCEPTION 'Driver pay type must be commission or fixed_salary' USING ERRCODE = '22023';
  END IF;
  IF v_type = 'commission' THEN
    v_salary := NULL;
    IF v_commission IS NULL OR v_commission <= 0 OR v_commission > 100 THEN
      RAISE EXCEPTION 'Commission must be above 0 and at most 100%%' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_commission := NULL;
    IF v_salary IS NULL OR v_salary < 0 THEN
      RAISE EXCEPTION 'Fixed salary must be zero or more' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_bonus < 0 OR v_bonus > 100 THEN
    RAISE EXCEPTION 'Bonus rate must be between 0 and 100%%' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(id) INTO v_drivers FROM drivers WHERE vehicle_id = p_vehicle_id AND status = 'Active';
  IF v_drivers IS NULL THEN
    RAISE EXCEPTION 'Assign an active driver to this vehicle before setting driver pay' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_drivers) > 1 THEN
    RAISE EXCEPTION 'More than one active driver is assigned to this vehicle' USING ERRCODE = '22023';
  END IF;
  v_driver_id := v_drivers[1];

  -- Unchanged terms: nothing to do.
  IF EXISTS (
    SELECT 1 FROM driver_compensation
    WHERE driver_id = v_driver_id AND vehicle_id = p_vehicle_id
      AND effective_from <= v_from AND (effective_to IS NULL OR effective_to > v_from)
      AND compensation_type = v_type
      AND commission_percentage IS NOT DISTINCT FROM v_commission::numeric(5,2)
      AND fixed_salary_amount IS NOT DISTINCT FROM v_salary::numeric(10,2)
      AND bonus_rate = v_bonus::numeric(5,2)
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM driver_compensation
    WHERE driver_id = v_driver_id AND vehicle_id = p_vehicle_id AND effective_from > v_from
  ) THEN
    RAISE EXCEPTION 'This driver has pay terms starting after %; remove them first', v_from USING ERRCODE = '22023';
  END IF;

  PERFORM public._close_driver_compensation(v_driver_id, p_vehicle_id, v_from);
  INSERT INTO driver_compensation (
    driver_id, vehicle_id, compensation_type, commission_percentage,
    fixed_salary_amount, bonus_rate, pay_frequency, effective_from
  ) VALUES (
    v_driver_id, p_vehicle_id, v_type, v_commission, v_salary, v_bonus, 'monthly', v_from
  );
END;
$$;

-- C4: moving a driver closes their pay terms on the vehicle they leave, so the
-- old vehicle stops paying them from that day.
CREATE OR REPLACE FUNCTION public.unassign_driver(p_driver_id uuid, p_effective_from date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from date := coalesce(p_effective_from, public.app_today());
  v_vehicle uuid;
BEGIN
  PERFORM public._require_admin();
  SELECT vehicle_id INTO v_vehicle FROM drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_vehicle IS NULL THEN
    RETURN;
  END IF;
  PERFORM public._assert_not_finalized(v_vehicle, v_from);
  PERFORM public._close_driver_compensation(p_driver_id, v_vehicle, v_from);
  UPDATE drivers SET vehicle_id = NULL, updated_at = now() WHERE id = p_driver_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_driver(p_vehicle_id uuid, p_driver_id uuid, p_effective_from date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from date := coalesce(p_effective_from, public.app_today());
  v_other record;
  v_current uuid;
BEGIN
  PERFORM public._require_admin();

  PERFORM 1 FROM vehicles WHERE id = p_vehicle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found' USING ERRCODE = 'P0002';
  END IF;

  -- One driver per vehicle: everyone else on this vehicle is unassigned.
  FOR v_other IN
    SELECT id FROM drivers
    WHERE vehicle_id = p_vehicle_id AND id IS DISTINCT FROM p_driver_id
  LOOP
    PERFORM public.unassign_driver(v_other.id, v_from);
  END LOOP;

  IF p_driver_id IS NULL THEN
    RETURN;
  END IF;

  SELECT vehicle_id INTO v_current FROM drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_current IS NOT DISTINCT FROM p_vehicle_id THEN
    RETURN;
  END IF;
  IF v_current IS NOT NULL THEN
    PERFORM public.unassign_driver(p_driver_id, v_from);
  END IF;
  UPDATE drivers SET vehicle_id = p_vehicle_id, updated_at = now() WHERE id = p_driver_id;
END;
$$;

REVOKE ALL ON FUNCTION public.run_salary_month(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calculate_salary(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_company_expenses(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_salary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_salary_draft(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_vehicle_setup(uuid, jsonb, jsonb, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unassign_driver(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_driver(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_salary_month(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_salary(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_company_expenses(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_salary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_salary_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_vehicle_setup(uuid, jsonb, jsonb, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_driver(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_driver(uuid, uuid, date) TO authenticated;
