-- =============================================================================
-- Phase 7D: driver monthly settlement (money-flow plan §2, owner decisions M2/M4)
-- =============================================================================
-- Every month each driver is cleared with the office:
--
--     opening balance          carried from the last closed month
--   + cash collected           cash rides
--   + vouchers collected       vouchers the driver collected (in cash)
--   − expenses paid            expenses with paid_by = 'driver' (7C)
--   − driver pay               from the FINALIZED vehicle payouts of the month
--   − handovers                cash handovers CONFIRMED by the office (7B)
--   = closing balance          > 0 driver owes the office, < 0 office owes the driver
--
-- The office closes a month once it has ended, every vehicle payout for the
-- driver is finalized and every handover is reviewed. Closing records what was
-- paid now (in either direction); the rest is carried to the next month.
-- Months close in order. A closed month locks the entries it counted; the
-- office can reopen the latest closed month (with a reason) to fix a mistake.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driver_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  period_start date NOT NULL CHECK (period_start = date_trunc('month', period_start::timestamp)::date),
  opening_balance numeric(12,2) NOT NULL,
  cash_collected numeric(12,2) NOT NULL,
  vouchers_collected numeric(12,2) NOT NULL,
  expenses_paid numeric(12,2) NOT NULL,
  driver_pay numeric(12,2) NOT NULL,
  handovers_confirmed numeric(12,2) NOT NULL,
  closing_balance numeric(12,2) NOT NULL,
  -- Paid at closing: by the driver when closing > 0, by the office when < 0.
  settled_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
  carried_forward numeric(12,2) NOT NULL,
  settle_method text CHECK (settle_method IN ('cash', 'bank_transfer')),
  settle_reference text,
  note text,
  details jsonb NOT NULL,            -- snapshot of the calculation at closing
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, period_start),
  CHECK (closing_balance = opening_balance + cash_collected + vouchers_collected
                           - expenses_paid - driver_pay - handovers_confirmed),
  CHECK (settled_amount <= abs(closing_balance)),
  CHECK (carried_forward = closing_balance - sign(closing_balance) * settled_amount),
  CHECK (settled_amount = 0 OR settle_method IS NOT NULL)
);

ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;

-- Written only through close/reopen below.
CREATE POLICY "admin_read" ON public.driver_settlements FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "driver_read_own" ON public.driver_settlements FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));

CREATE TRIGGER driver_settlements_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_settlements
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_changes();

CREATE INDEX IF NOT EXISTS idx_rides_driver_date ON public.rides (driver_id, ride_date);
CREATE INDEX IF NOT EXISTS idx_rides_driver_collected ON public.rides (driver_id, collected_at)
  WHERE collected_by_role = 'driver';

-- -----------------------------------------------------------------------------
-- Calculation (no access check; callers check)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._settlement_compute(p_driver_id uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month')::date;  -- exclusive
  v_opening numeric(12,2);
  v_cash numeric(12,2);
  v_vouchers numeric(12,2);
  v_expenses numeric(12,2);
  v_pay numeric(12,2);
  v_handovers numeric(12,2);
  v_submitted_count integer;
  v_submitted numeric(12,2);
  v_disputed numeric(12,2);
  v_pay_lines jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_open_month date;
  r record;
BEGIN
  IF p_driver_id IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'Driver and month are required' USING ERRCODE = '22023';
  END IF;

  SELECT carried_forward INTO v_opening
  FROM driver_settlements
  WHERE driver_id = p_driver_id AND period_start < v_start
  ORDER BY period_start DESC LIMIT 1;
  v_opening := coalesce(v_opening, 0);

  SELECT coalesce(sum(amount), 0) INTO v_cash
  FROM rides
  WHERE driver_id = p_driver_id AND payment_method = 'Cash' AND payment_status <> 'Cancelled'
    AND ride_date >= v_start AND ride_date < v_end;

  SELECT coalesce(sum(amount), 0) INTO v_vouchers
  FROM rides
  WHERE driver_id = p_driver_id AND payment_method = 'Voucher'
    AND payment_status = 'Collected' AND collected_by_role = 'driver'
    AND (collected_at AT TIME ZONE 'Asia/Riyadh')::date >= v_start
    AND (collected_at AT TIME ZONE 'Asia/Riyadh')::date < v_end;

  SELECT coalesce(sum(amount), 0) INTO v_expenses
  FROM expenses
  WHERE driver_id = p_driver_id AND paid_by = 'driver'
    AND expense_date >= v_start AND expense_date < v_end;

  SELECT coalesce(sum(amount) FILTER (WHERE status = 'confirmed'), 0),
         count(*) FILTER (WHERE status = 'submitted'),
         coalesce(sum(amount) FILTER (WHERE status = 'submitted'), 0),
         coalesce(sum(amount) FILTER (WHERE status = 'disputed'), 0)
    INTO v_handovers, v_submitted_count, v_submitted, v_disputed
  FROM cash_handovers
  WHERE driver_id = p_driver_id AND handover_date >= v_start AND handover_date < v_end;

  -- Driver pay per vehicle: only finalized payouts count.
  SELECT coalesce(sum(pay) FILTER (WHERE status = 'finalized'), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'vehicle_id', vehicle_id, 'vehicle', plate_number, 'calculation_id', calculation_id,
           'status', status, 'driver_pay', pay) ORDER BY plate_number), '[]'::jsonb)
    INTO v_pay, v_pay_lines
  FROM (
    SELECT sc.vehicle_id, v.plate_number, sc.id AS calculation_id, sc.status, sum(d.driver_pay_amount) AS pay
    FROM driver_pay_calculations d
    JOIN salary_calculations sc ON sc.id = d.calculation_id
    JOIN vehicles v ON v.id = sc.vehicle_id
    WHERE d.driver_id = p_driver_id AND sc.period_start = v_start
    GROUP BY sc.vehicle_id, v.plate_number, sc.id, sc.status
  ) p;

  -- What stops the office from closing the month.
  IF v_end > public.app_today() THEN
    v_blockers := v_blockers || to_jsonb('The month has not ended yet'::text);
  END IF;

  FOR r IN
    SELECT DISTINCT v.plate_number
    FROM (
      SELECT vehicle_id FROM rides
      WHERE driver_id = p_driver_id AND ride_date >= v_start AND ride_date < v_end
      UNION
      SELECT vehicle_id FROM expenses
      WHERE driver_id = p_driver_id AND vehicle_id IS NOT NULL AND expense_date >= v_start AND expense_date < v_end
      UNION
      SELECT sc.vehicle_id FROM driver_pay_calculations d
      JOIN salary_calculations sc ON sc.id = d.calculation_id
      WHERE d.driver_id = p_driver_id AND sc.period_start = v_start
    ) used
    JOIN vehicles v ON v.id = used.vehicle_id
    WHERE NOT EXISTS (
      SELECT 1 FROM salary_calculations sc
      WHERE sc.vehicle_id = used.vehicle_id AND sc.period_start = v_start AND sc.status = 'finalized'
    )
    ORDER BY v.plate_number
  LOOP
    v_blockers := v_blockers || to_jsonb(format('The payout for %s is not finalized', r.plate_number));
  END LOOP;

  IF v_submitted_count > 0 THEN
    v_blockers := v_blockers || to_jsonb(format('%s cash handover(s) waiting for the office to confirm', v_submitted_count));
  END IF;

  -- Months close in order: the earliest earlier month with money activity
  -- and no settlement must be closed first.
  SELECT min(m) INTO v_open_month
  FROM (
    SELECT date_trunc('month', ride_date::timestamp)::date AS m FROM rides
    WHERE driver_id = p_driver_id AND ride_date < v_start
      AND (payment_method = 'Cash' OR collected_by_role = 'driver')
    UNION
    SELECT date_trunc('month', (collected_at AT TIME ZONE 'Asia/Riyadh'))::date FROM rides
    WHERE driver_id = p_driver_id AND collected_by_role = 'driver'
      AND (collected_at AT TIME ZONE 'Asia/Riyadh')::date < v_start
    UNION
    SELECT date_trunc('month', expense_date::timestamp)::date FROM expenses
    WHERE driver_id = p_driver_id AND paid_by = 'driver' AND expense_date < v_start
    UNION
    SELECT date_trunc('month', handover_date::timestamp)::date FROM cash_handovers
    WHERE driver_id = p_driver_id AND handover_date < v_start
    UNION
    SELECT sc.period_start FROM driver_pay_calculations d
    JOIN salary_calculations sc ON sc.id = d.calculation_id
    WHERE d.driver_id = p_driver_id AND sc.period_start < v_start
  ) months
  WHERE NOT EXISTS (SELECT 1 FROM driver_settlements s WHERE s.driver_id = p_driver_id AND s.period_start = months.m);
  IF v_open_month IS NOT NULL THEN
    v_blockers := v_blockers || to_jsonb(format('%s must be settled first', to_char(v_open_month, 'FMMonth YYYY')));
  END IF;

  RETURN jsonb_build_object(
    'driver_id', p_driver_id,
    'period_start', v_start,
    'period_end', v_end - 1,
    'opening_balance', v_opening,
    'cash_collected', v_cash,
    'vouchers_collected', v_vouchers,
    'expenses_paid', v_expenses,
    'driver_pay', v_pay,
    'handovers_confirmed', v_handovers,
    'closing_balance', v_opening + v_cash + v_vouchers - v_expenses - v_pay - v_handovers,
    'handovers_submitted', v_submitted,
    'handovers_submitted_count', v_submitted_count,
    'handovers_disputed', v_disputed,
    'pay_lines', v_pay_lines,
    'blockers', v_blockers
  );
END;
$$;

REVOKE ALL ON FUNCTION public._settlement_compute(uuid, date) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Read: the office for any driver, a driver for themselves
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_driver_settlement(p_driver_id uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s driver_settlements%ROWTYPE;
  v_name text;
BEGIN
  IF NOT public.is_admin() AND p_driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RAISE EXCEPTION 'You can only see your own settlement' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name FROM drivers WHERE id = p_driver_id;
  SELECT * INTO s FROM driver_settlements
  WHERE driver_id = p_driver_id AND period_start = date_trunc('month', p_month::timestamp)::date;

  IF FOUND THEN
    RETURN s.details || jsonb_build_object(
      'driver_name', v_name,
      'status', 'closed',
      'blockers', '[]'::jsonb,
      'settled_amount', s.settled_amount,
      'carried_forward', s.carried_forward,
      'settle_method', s.settle_method,
      'settle_reference', s.settle_reference,
      'note', s.note,
      'closed_at', s.closed_at
    );
  END IF;

  RETURN public._settlement_compute(p_driver_id, p_month)
    || jsonb_build_object('driver_name', v_name, 'status', 'open');
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_settlement(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_settlement(uuid, date) TO authenticated;

-- Office overview: every driver with something to settle in the month.
CREATE OR REPLACE FUNCTION public.get_driver_settlements(p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v jsonb;
  d record;
BEGIN
  PERFORM public._require_admin();
  FOR d IN SELECT id FROM drivers ORDER BY name LOOP
    v := public.get_driver_settlement(d.id, p_month);
    IF v ->> 'status' = 'closed'
       OR (v ->> 'opening_balance')::numeric <> 0
       OR (v ->> 'cash_collected')::numeric <> 0
       OR (v ->> 'vouchers_collected')::numeric <> 0
       OR (v ->> 'expenses_paid')::numeric <> 0
       OR (v ->> 'driver_pay')::numeric <> 0
       OR (v ->> 'handovers_confirmed')::numeric <> 0
       OR (v ->> 'handovers_submitted_count')::int > 0
       OR jsonb_array_length(v -> 'pay_lines') > 0 THEN
      v_rows := v_rows || v;
    END IF;
  END LOOP;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_settlements(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_settlements(date) TO authenticated;

-- -----------------------------------------------------------------------------
-- Close / reopen (office only)
-- -----------------------------------------------------------------------------
-- p_settled_amount: paid now, by the driver if the closing balance is positive,
-- by the office if negative. 0 carries the whole balance to the next month.
CREATE OR REPLACE FUNCTION public.close_driver_settlement(
  p_driver_id uuid,
  p_month date,
  p_settled_amount numeric DEFAULT 0,
  p_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v jsonb;
  v_closing numeric(12,2);
  v_paid numeric(12,2) := round(coalesce(p_settled_amount, 0), 2);
BEGIN
  PERFORM public._require_admin();

  -- One closing at a time per driver (months must close in order).
  PERFORM 1 FROM drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM driver_settlements WHERE driver_id = p_driver_id AND period_start = v_start) THEN
    RAISE EXCEPTION '% is already settled for this driver', to_char(v_start, 'FMMonth YYYY') USING ERRCODE = '22023';
  END IF;

  v := public._settlement_compute(p_driver_id, v_start);
  IF jsonb_array_length(v -> 'blockers') > 0 THEN
    RAISE EXCEPTION 'Cannot settle yet: %',
      (SELECT string_agg(b, '; ') FROM jsonb_array_elements_text(v -> 'blockers') b)
      USING ERRCODE = '55000';
  END IF;

  v_closing := (v ->> 'closing_balance')::numeric;
  IF v_paid < 0 OR v_paid > abs(v_closing) THEN
    RAISE EXCEPTION 'The amount paid now must be between 0 and %', abs(v_closing) USING ERRCODE = '22023';
  END IF;
  IF v_paid > 0 AND (p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer')) THEN
    RAISE EXCEPTION 'Choose how it was paid (cash or bank transfer)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO driver_settlements (
    driver_id, period_start, opening_balance, cash_collected, vouchers_collected,
    expenses_paid, driver_pay, handovers_confirmed, closing_balance,
    settled_amount, carried_forward, settle_method, settle_reference, note, details, closed_by
  ) VALUES (
    p_driver_id, v_start, (v ->> 'opening_balance')::numeric, (v ->> 'cash_collected')::numeric,
    (v ->> 'vouchers_collected')::numeric, (v ->> 'expenses_paid')::numeric, (v ->> 'driver_pay')::numeric,
    (v ->> 'handovers_confirmed')::numeric, v_closing,
    v_paid, v_closing - sign(v_closing) * v_paid,
    CASE WHEN v_paid > 0 THEN p_method END,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v, auth.uid()
  );

  RETURN public.get_driver_settlement(p_driver_id, v_start);
END;
$$;

REVOKE ALL ON FUNCTION public.close_driver_settlement(uuid, date, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_driver_settlement(uuid, date, numeric, text, text, text) TO authenticated;

-- Only the driver's latest closed month can be reopened. The reason is kept
-- in the audit log (note updated, then the row removed).
CREATE OR REPLACE FUNCTION public.reopen_driver_settlement(p_driver_id uuid, p_month date, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
BEGIN
  PERFORM public._require_admin();
  IF nullif(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Explain why the settlement is reopened' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM driver_settlements WHERE driver_id = p_driver_id AND period_start = v_start) THEN
    RAISE EXCEPTION 'This month is not settled' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM driver_settlements WHERE driver_id = p_driver_id AND period_start > v_start) THEN
    RAISE EXCEPTION 'A later month is already settled; reopen that one first' USING ERRCODE = '55000';
  END IF;

  UPDATE driver_settlements SET note = 'Reopened: ' || trim(p_reason)
  WHERE driver_id = p_driver_id AND period_start = v_start;
  DELETE FROM driver_settlements WHERE driver_id = p_driver_id AND period_start = v_start;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_driver_settlement(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_driver_settlement(uuid, date, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Lock: entries counted by a closed settlement cannot change
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_settlement_open(p_driver_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_driver_id IS NULL OR p_date IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM driver_settlements
             WHERE driver_id = p_driver_id
               AND period_start = date_trunc('month', p_date::timestamp)::date) THEN
    RAISE EXCEPTION 'The driver settlement for % is closed, so this cannot be added or changed. Ask the office to reopen it or record it in the next month.',
      to_char(p_date, 'FMMonth YYYY')
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_settlement_open(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._check_settlement_lock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'rides' THEN
    IF TG_OP = 'UPDATE' AND (OLD.amount, OLD.ride_date, OLD.driver_id, OLD.payment_method, OLD.payment_status,
                             OLD.collected_by_role, OLD.collected_at)
       IS NOT DISTINCT FROM (NEW.amount, NEW.ride_date, NEW.driver_id, NEW.payment_method, NEW.payment_status,
                             NEW.collected_by_role, NEW.collected_at) THEN
      RETURN NEW;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      IF OLD.payment_method = 'Cash' THEN
        PERFORM public._assert_settlement_open(OLD.driver_id, OLD.ride_date);
      END IF;
      IF OLD.collected_by_role = 'driver' THEN
        PERFORM public._assert_settlement_open(OLD.driver_id, (OLD.collected_at AT TIME ZONE 'Asia/Riyadh')::date);
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      IF NEW.payment_method = 'Cash' THEN
        PERFORM public._assert_settlement_open(NEW.driver_id, NEW.ride_date);
      END IF;
      IF NEW.collected_by_role = 'driver' THEN
        PERFORM public._assert_settlement_open(NEW.driver_id, (NEW.collected_at AT TIME ZONE 'Asia/Riyadh')::date);
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'expenses' THEN
    IF TG_OP = 'UPDATE' AND (OLD.amount, OLD.expense_date, OLD.driver_id, OLD.paid_by)
       IS NOT DISTINCT FROM (NEW.amount, NEW.expense_date, NEW.driver_id, NEW.paid_by) THEN
      RETURN NEW;
    END IF;
    IF TG_OP <> 'INSERT' AND OLD.paid_by = 'driver' THEN
      PERFORM public._assert_settlement_open(OLD.driver_id, OLD.expense_date);
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.paid_by = 'driver' THEN
      PERFORM public._assert_settlement_open(NEW.driver_id, NEW.expense_date);
    END IF;

  ELSE  -- cash_handovers: any change inside a closed month
    IF TG_OP <> 'INSERT' THEN
      PERFORM public._assert_settlement_open(OLD.driver_id, OLD.handover_date);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM public._assert_settlement_open(NEW.driver_id, NEW.handover_date);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._check_settlement_lock() FROM PUBLIC, anon, authenticated;

-- "zz_" so these run after the paid_by default has been filled in.
CREATE TRIGGER zz_rides_settlement_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public._check_settlement_lock();
CREATE TRIGGER zz_expenses_settlement_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public._check_settlement_lock();
CREATE TRIGGER zz_cash_handovers_settlement_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.cash_handovers
  FOR EACH ROW EXECUTE FUNCTION public._check_settlement_lock();
