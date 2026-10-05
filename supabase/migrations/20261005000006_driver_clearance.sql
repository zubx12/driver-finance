-- =============================================================================
-- L3: clearance before a driver is closed (docs/driver-profile-plan.md §5)
-- =============================================================================
-- Owner rule (2026-10-05): when a driver leaves, nothing about their payments
-- is deleted, and the driver is closed only after the office approves that
-- every payment is clear.
--
-- get_driver_clearance: the checklist, every line must be clear:
--   leaving started · entries uploaded (confirmed by the office) · no cash
--   handover waiting · no correction request open · every vehicle payout
--   with the driver's work finalized · every month settled (7D) · final
--   balance zero (paid, or the rest written off with a reason)
-- approve_driver_clearance: only when all lines are clear. Sets status Left
-- and the leaving date, keeps a clearance record. The login stops working
-- (my_driver_id, L2).
--
-- Write-off: the final settlement cannot carry a balance into a month that
-- will not come, so the office may write off what will not be paid, with a
-- reason, only for a driver who is leaving. It is recorded on the settlement.
-- The driver's final pay normally waits for the month's payouts to be
-- finalized (commission depends on the whole month), so a driver stays
-- Leaving until then.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Write-off on driver settlements
-- -----------------------------------------------------------------------------
ALTER TABLE public.driver_settlements
  ADD COLUMN IF NOT EXISTS written_off numeric(12,2) NOT NULL DEFAULT 0 CHECK (written_off >= 0),
  ADD COLUMN IF NOT EXISTS write_off_reason text;

ALTER TABLE public.driver_settlements DROP CONSTRAINT IF EXISTS driver_settlements_check1;
ALTER TABLE public.driver_settlements DROP CONSTRAINT IF EXISTS driver_settlements_check2;
ALTER TABLE public.driver_settlements
  ADD CONSTRAINT driver_settlements_paid_within_balance
    CHECK (settled_amount + written_off <= abs(closing_balance)),
  ADD CONSTRAINT driver_settlements_carried
    CHECK (carried_forward = closing_balance - sign(closing_balance) * (settled_amount + written_off)),
  ADD CONSTRAINT driver_settlements_write_off_reason
    CHECK (written_off = 0 OR nullif(trim(write_off_reason), '') IS NOT NULL);

DROP FUNCTION IF EXISTS public.close_driver_settlement(uuid, date, numeric, text, text, text);

-- As in 20261004000007, plus an optional write-off for a driver who is leaving.
CREATE OR REPLACE FUNCTION public.close_driver_settlement(
  p_driver_id uuid,
  p_month date,
  p_settled_amount numeric DEFAULT 0,
  p_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_write_off numeric DEFAULT 0,
  p_write_off_reason text DEFAULT NULL
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
  v_write_off numeric(12,2) := round(coalesce(p_write_off, 0), 2);
  v_status text;
BEGIN
  PERFORM public._require_admin();

  -- One closing at a time per driver (months must close in order).
  SELECT status INTO v_status FROM drivers WHERE id = p_driver_id FOR UPDATE;
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
  IF v_paid < 0 OR v_write_off < 0 OR v_paid + v_write_off > abs(v_closing) THEN
    RAISE EXCEPTION 'The amount paid now plus any write-off must be between 0 and %', abs(v_closing) USING ERRCODE = '22023';
  END IF;
  IF v_paid > 0 AND (p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer')) THEN
    RAISE EXCEPTION 'Choose how it was paid (cash or bank transfer)' USING ERRCODE = '22023';
  END IF;
  IF v_write_off > 0 THEN
    IF v_status IS DISTINCT FROM 'Leaving' THEN
      RAISE EXCEPTION 'A balance can only be written off in the final settlement of a driver who is leaving' USING ERRCODE = '22023';
    END IF;
    IF nullif(trim(coalesce(p_write_off_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Give the reason for the write-off' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO driver_settlements (
    driver_id, period_start, opening_balance, cash_collected, vouchers_collected,
    expenses_paid, driver_pay, handovers_confirmed, closing_balance,
    settled_amount, written_off, write_off_reason, carried_forward,
    settle_method, settle_reference, note, details, closed_by
  ) VALUES (
    p_driver_id, v_start, (v ->> 'opening_balance')::numeric, (v ->> 'cash_collected')::numeric,
    (v ->> 'vouchers_collected')::numeric, (v ->> 'expenses_paid')::numeric, (v ->> 'driver_pay')::numeric,
    (v ->> 'handovers_confirmed')::numeric, v_closing,
    v_paid, v_write_off, CASE WHEN v_write_off > 0 THEN trim(p_write_off_reason) END,
    v_closing - sign(v_closing) * (v_paid + v_write_off),
    CASE WHEN v_paid > 0 THEN p_method END,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v, auth.uid()
  );

  RETURN public.get_driver_settlement(p_driver_id, v_start);
END;
$$;

REVOKE ALL ON FUNCTION public.close_driver_settlement(uuid, date, numeric, text, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_driver_settlement(uuid, date, numeric, text, text, text, numeric, text) TO authenticated;

-- The statement shows a write-off like the other closing fields, and the
-- driver's status (a write-off is offered only for a driver who is leaving).
CREATE OR REPLACE FUNCTION public.get_driver_settlement(p_driver_id uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s driver_settlements%ROWTYPE;
  v_name text;
  v_driver_status text;
BEGIN
  IF NOT public.is_admin() AND p_driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RAISE EXCEPTION 'You can only see your own settlement' USING ERRCODE = '42501';
  END IF;

  SELECT name, status INTO v_name, v_driver_status FROM drivers WHERE id = p_driver_id;
  SELECT * INTO s FROM driver_settlements
  WHERE driver_id = p_driver_id AND period_start = date_trunc('month', p_month::timestamp)::date;

  IF FOUND THEN
    RETURN s.details || jsonb_build_object(
      'driver_name', v_name,
      'driver_status', v_driver_status,
      'status', 'closed',
      'blockers', '[]'::jsonb,
      'settled_amount', s.settled_amount,
      'written_off', s.written_off,
      'write_off_reason', s.write_off_reason,
      'carried_forward', s.carried_forward,
      'settle_method', s.settle_method,
      'settle_reference', s.settle_reference,
      'note', s.note,
      'closed_at', s.closed_at
    );
  END IF;

  RETURN public._settlement_compute(p_driver_id, p_month)
    || jsonb_build_object('driver_name', v_name, 'driver_status', v_driver_status, 'status', 'open');
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Clearance records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL UNIQUE REFERENCES public.driver_employment_periods(id),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  final_settlement_month date,
  total_written_off numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  checklist jsonb NOT NULL,          -- the checklist as it was when approved
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_clearances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read" ON public.driver_clearances FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE TRIGGER driver_clearances_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_clearances
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_changes();

-- -----------------------------------------------------------------------------
-- 3. The checklist
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._driver_clearance(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_period driver_employment_periods%ROWTYPE;
  v_lines jsonb := '[]'::jsonb;
  v_count integer;
  v_amount numeric(12,2);
  v_list text;
  v_last driver_settlements%ROWTYPE;
  v_ok boolean;
BEGIN
  SELECT status INTO v_status FROM drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_period FROM driver_employment_periods
  WHERE driver_id = p_driver_id ORDER BY joined_on DESC LIMIT 1;

  -- 1. Leaving started
  v_lines := v_lines || jsonb_build_object('key', 'leaving', 'label', 'Leaving started',
    'ok', v_status = 'Leaving' AND v_period.last_working_day IS NOT NULL,
    'detail', CASE WHEN v_period.last_working_day IS NOT NULL
                   THEN format('Last working day %s (%s)', v_period.last_working_day, v_period.leave_reason)
                   ELSE 'Use "Start leaving" first' END);

  -- 2. Entries on the phone: the office confirms with the driver when approving.
  v_lines := v_lines || jsonb_build_object('key', 'entries_uploaded', 'label', 'All entries on the phone uploaded',
    'ok', NULL, 'detail', 'Confirm with the driver when approving (the server cannot see the phone)');

  -- 3. Cash handovers waiting for the office
  SELECT count(*), coalesce(sum(amount), 0) INTO v_count, v_amount
  FROM cash_handovers WHERE driver_id = p_driver_id AND status = 'submitted';
  v_lines := v_lines || jsonb_build_object('key', 'handovers', 'label', 'Cash handovers confirmed or disputed',
    'ok', v_count = 0,
    'detail', CASE WHEN v_count = 0 THEN 'None waiting' ELSE format('%s waiting (SAR %s)', v_count, v_amount) END);

  -- 4. Correction requests
  SELECT count(*) INTO v_count FROM correction_requests WHERE driver_id = p_driver_id AND status = 'pending';
  v_lines := v_lines || jsonb_build_object('key', 'corrections', 'label', 'Correction requests answered',
    'ok', v_count = 0, 'detail', CASE WHEN v_count = 0 THEN 'None open' ELSE format('%s open', v_count) END);

  -- 5. Vehicle payouts for every month the driver worked
  SELECT count(*), string_agg(format('%s %s', ve.plate_number, to_char(w.m, 'FMMon YYYY')), ', ' ORDER BY w.m, ve.plate_number)
    INTO v_count, v_list
  FROM (
    SELECT DISTINCT vehicle_id, date_trunc('month', ride_date::timestamp)::date AS m FROM rides WHERE driver_id = p_driver_id
    UNION
    SELECT DISTINCT vehicle_id, date_trunc('month', expense_date::timestamp)::date FROM expenses
    WHERE driver_id = p_driver_id AND vehicle_id IS NOT NULL
  ) w
  JOIN vehicles ve ON ve.id = w.vehicle_id
  WHERE NOT EXISTS (SELECT 1 FROM salary_calculations sc
                    WHERE sc.vehicle_id = w.vehicle_id AND sc.period_start = w.m AND sc.status = 'finalized');
  v_lines := v_lines || jsonb_build_object('key', 'payouts', 'label', 'Vehicle payouts finalized for every month worked',
    'ok', v_count = 0, 'detail', CASE WHEN v_count = 0 THEN 'All finalized' ELSE 'Not finalized: ' || v_list END);

  -- 6. Every month with money activity settled (7D)
  SELECT count(*), string_agg(to_char(m, 'FMMon YYYY'), ', ' ORDER BY m) INTO v_count, v_list
  FROM (
    SELECT date_trunc('month', ride_date::timestamp)::date AS m FROM rides
    WHERE driver_id = p_driver_id AND (payment_method = 'Cash' OR collected_by_role = 'driver')
    UNION SELECT date_trunc('month', (collected_at AT TIME ZONE 'Asia/Riyadh'))::date FROM rides
    WHERE driver_id = p_driver_id AND collected_by_role = 'driver'
    UNION SELECT date_trunc('month', expense_date::timestamp)::date FROM expenses WHERE driver_id = p_driver_id AND paid_by = 'driver'
    UNION SELECT date_trunc('month', handover_date::timestamp)::date FROM cash_handovers WHERE driver_id = p_driver_id
    UNION SELECT sc.period_start FROM driver_pay_calculations d JOIN salary_calculations sc ON sc.id = d.calculation_id
    WHERE d.driver_id = p_driver_id
  ) months
  WHERE m IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM driver_settlements s WHERE s.driver_id = p_driver_id AND s.period_start = months.m);
  v_lines := v_lines || jsonb_build_object('key', 'settlements', 'label', 'Every month settled with the driver',
    'ok', v_count = 0, 'detail', CASE WHEN v_count = 0 THEN 'All settled' ELSE 'Not settled: ' || v_list END);

  -- 7. Final balance zero
  SELECT * INTO v_last FROM driver_settlements WHERE driver_id = p_driver_id ORDER BY period_start DESC LIMIT 1;
  v_ok := v_last.id IS NULL OR v_last.carried_forward = 0;
  v_lines := v_lines || jsonb_build_object('key', 'final_balance', 'label', 'Final balance zero (paid or written off)',
    'ok', v_ok,
    'detail', CASE
      WHEN v_last.id IS NULL THEN 'No settlements'
      WHEN v_ok AND v_last.written_off > 0 THEN format('Zero after writing off SAR %s (%s)', v_last.written_off, v_last.write_off_reason)
      WHEN v_ok THEN format('Zero after %s', to_char(v_last.period_start, 'FMMonth YYYY'))
      WHEN v_last.carried_forward > 0 THEN format('The driver still owes SAR %s (carried from %s)', v_last.carried_forward, to_char(v_last.period_start, 'FMMonth YYYY'))
      ELSE format('The office still owes the driver SAR %s (carried from %s)', -v_last.carried_forward, to_char(v_last.period_start, 'FMMonth YYYY')) END);

  -- Information only: vouchers from the driver's rides still outstanding
  -- belong to the vehicle and its partners (7E), so they do not block.
  SELECT count(*), coalesce(sum(amount), 0) INTO v_count, v_amount
  FROM rides WHERE driver_id = p_driver_id AND payment_method = 'Voucher' AND payment_status = 'Outstanding';

  RETURN jsonb_build_object(
    'driver_id', p_driver_id,
    'status', v_status,
    'period', to_jsonb(v_period),
    'lines', v_lines,
    -- ready when every automatic line is clear (the manual one is confirmed on approval)
    'ready', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_lines) l WHERE (l ->> 'ok') = 'false'),
    'final_settlement_month', v_last.period_start,
    'total_written_off', (SELECT coalesce(sum(written_off), 0) FROM driver_settlements WHERE driver_id = p_driver_id),
    'vouchers_outstanding', jsonb_build_object('count', v_count, 'amount', v_amount),
    'clearance', (SELECT to_jsonb(c) FROM driver_clearances c WHERE c.period_id = v_period.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._driver_clearance(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_driver_clearance(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._require_admin();
  RETURN public._driver_clearance(p_driver_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_clearance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_clearance(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Approve clearance: the driver becomes Left
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_driver_clearance(p_driver_id uuid, p_entries_uploaded boolean, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v jsonb;
  v_period_id uuid;
  v_last_day date;
BEGIN
  PERFORM public._require_admin();
  PERFORM 1 FROM drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_entries_uploaded IS NOT TRUE THEN
    RAISE EXCEPTION 'Confirm with the driver that every entry on the phone has been uploaded' USING ERRCODE = '22023';
  END IF;

  v := public._driver_clearance(p_driver_id);
  IF NOT (v ->> 'ready')::boolean THEN
    RAISE EXCEPTION 'Clearance is not complete: %',
      (SELECT string_agg(format('%s (%s)', l ->> 'label', l ->> 'detail'), '; ')
       FROM jsonb_array_elements(v -> 'lines') l WHERE (l ->> 'ok') = 'false')
      USING ERRCODE = '55000';
  END IF;

  v_period_id := (v #>> '{period,id}')::uuid;
  v_last_day := (v #>> '{period,last_working_day}')::date;

  INSERT INTO driver_clearances (period_id, driver_id, final_settlement_month, total_written_off, note, checklist, approved_by)
  VALUES (v_period_id, p_driver_id, (v ->> 'final_settlement_month')::date, (v ->> 'total_written_off')::numeric,
          nullif(trim(coalesce(p_note, '')), ''), v, auth.uid());

  UPDATE driver_employment_periods SET left_on = greatest(public.app_today(), v_last_day) WHERE id = v_period_id;
  UPDATE drivers SET status = 'Left', updated_at = now() WHERE id = p_driver_id;

  RETURN public._driver_clearance(p_driver_id);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_driver_clearance(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_driver_clearance(uuid, boolean, text) TO authenticated;
