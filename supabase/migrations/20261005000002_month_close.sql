-- =============================================================================
-- Phase 7G: month-end close (money-flow plan §6)
-- =============================================================================
-- One checklist per month, in the order the money moves:
--
--   0. Before:   the month has ended; every cash handover is reviewed;
--                every driver/company expense is reviewed (company cost or
--                charged to a vehicle), because that changes vehicle payouts
--   1. Payouts:  every vehicle's payout for the month is finalized
--   2. Drivers:  every driver with something to settle is settled (7D)
--   3. Partners: every partner share of the month is paid (7E)
--
-- get_month_close_status() shows where each step stands and what is still
-- open. close_month() records that the office signed the month off; it is
-- refused while anything is open. The locks on finalized payouts, settled
-- drivers and paid shares already protect the figures; this adds the
-- sign-off and the overview. reopen_month() removes the sign-off (reason
-- kept in the audit log).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.month_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL UNIQUE CHECK (period_start = date_trunc('month', period_start::timestamp)::date),
  note text,
  summary jsonb NOT NULL,          -- the checklist as it was when signed off
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.month_closes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read" ON public.month_closes FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE TRIGGER month_closes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.month_closes
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_changes();

CREATE OR REPLACE FUNCTION public._month_close_status(p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_next date := (date_trunc('month', p_month::timestamp) + interval '1 month')::date;
  v_ended boolean := v_next <= public.app_today();
  v_handovers jsonb;
  v_expenses jsonb;
  v_vehicles jsonb;
  v_drivers jsonb;
  v_shares jsonb;
  v_vouchers_owed jsonb;
  v_close month_closes%ROWTYPE;
  v_open jsonb := '[]'::jsonb;
  d jsonb;
BEGIN
  -- 0. Before closing
  SELECT jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
    INTO v_handovers
  FROM cash_handovers
  WHERE status = 'submitted' AND handover_date >= v_start AND handover_date < v_next;

  SELECT jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
    INTO v_expenses
  FROM expenses
  WHERE allocation <> 'Vehicle' AND review_status = 'unreviewed'
    AND expense_date >= v_start AND expense_date < v_next;

  -- 1. Vehicle payouts (same vehicles as the monthly salary run)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'vehicle_id', ve.id, 'vehicle', ve.plate_number,
           'status', coalesce(sc.status, 'missing'), 'net_revenue', sc.net_revenue)
           ORDER BY ve.plate_number), '[]'::jsonb)
    INTO v_vehicles
  FROM vehicles ve
  LEFT JOIN salary_calculations sc ON sc.vehicle_id = ve.id AND sc.period_start = v_start
  WHERE ve.status = 'Active'
     OR sc.id IS NOT NULL
     OR EXISTS (SELECT 1 FROM daily_summary ds
                WHERE ds.vehicle_id = ve.id AND ds.summary_date >= v_start AND ds.summary_date < v_next);

  -- 2. Driver settlements (only drivers with something to settle)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'driver_id', s ->> 'driver_id', 'driver', s ->> 'driver_name', 'status', s ->> 'status',
           'closing_balance', (s ->> 'closing_balance')::numeric,
           'carried_forward', (s ->> 'carried_forward')::numeric)
           ORDER BY s ->> 'driver_name'), '[]'::jsonb)
    INTO v_drivers
  FROM jsonb_array_elements(public.get_driver_settlements(v_start)) s;

  -- 3. Partner shares of the month's finalized payouts
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'settlement_id', st.id, 'partner', p.name, 'vehicle', ve.plate_number,
           'amount', st.amount, 'status', st.status,
           'cash_amount', st.cash_amount, 'voucher_amount', st.voucher_amount)
           ORDER BY p.name, ve.plate_number), '[]'::jsonb)
    INTO v_shares
  FROM settlements st
  JOIN salary_calculation_shares scs ON scs.id = st.share_id
  JOIN salary_calculations sc ON sc.id = scs.calculation_id
  JOIN partners p ON p.id = st.partner_id
  JOIN vehicles ve ON ve.id = sc.vehicle_id
  WHERE sc.period_start = v_start AND st.status <> 'void';

  -- Information: voucher parts someone else collected, still owed to partners (any month).
  SELECT jsonb_build_object('count', count(*), 'amount', coalesce(sum(g.amount), 0))
    INTO v_vouchers_owed
  FROM public.get_partner_vouchers() g
  WHERE g.holder_status = 'owed_to_you';

  -- Everything still open, in order.
  IF NOT v_ended THEN
    v_open := v_open || to_jsonb('The month has not ended yet'::text);
  END IF;
  IF (v_handovers ->> 'count')::int > 0 THEN
    v_open := v_open || to_jsonb(format('%s cash handover(s) to confirm or dispute', v_handovers ->> 'count'));
  END IF;
  IF (v_expenses ->> 'count')::int > 0 THEN
    v_open := v_open || to_jsonb(format('%s driver/company expense(s) to review', v_expenses ->> 'count'));
  END IF;
  FOR d IN SELECT x FROM jsonb_array_elements(v_vehicles) x WHERE x ->> 'status' <> 'finalized' LOOP
    v_open := v_open || to_jsonb(format('Payout for %s is %s', d ->> 'vehicle',
      CASE d ->> 'status' WHEN 'missing' THEN 'not calculated' ELSE 'a draft (not finalized)' END));
  END LOOP;
  FOR d IN SELECT x FROM jsonb_array_elements(v_drivers) x WHERE x ->> 'status' <> 'closed' LOOP
    v_open := v_open || to_jsonb(format('Driver %s is not settled', d ->> 'driver'));
  END LOOP;
  FOR d IN SELECT x FROM jsonb_array_elements(v_shares) x WHERE x ->> 'status' <> 'paid' LOOP
    v_open := v_open || to_jsonb(format('%s''s share for %s is not paid', d ->> 'partner', d ->> 'vehicle'));
  END LOOP;

  SELECT * INTO v_close FROM month_closes WHERE period_start = v_start;

  RETURN jsonb_build_object(
    'period_start', v_start,
    'period_end', v_next - 1,
    'month_ended', v_ended,
    'handovers_to_review', v_handovers,
    'expenses_to_review', v_expenses,
    'vehicles', v_vehicles,
    'drivers', v_drivers,
    'shares', v_shares,
    'vouchers_owed_to_partners', v_vouchers_owed,
    'open_items', v_open,
    'ready_to_close', jsonb_array_length(v_open) = 0,
    'closed', v_close.id IS NOT NULL,
    'closed_at', v_close.closed_at,
    'close_note', v_close.note
  );
END;
$$;

REVOKE ALL ON FUNCTION public._month_close_status(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_month_close_status(p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._require_admin();
  RETURN public._month_close_status(p_month);
END;
$$;

REVOKE ALL ON FUNCTION public.get_month_close_status(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_month_close_status(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_month(p_month date, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v jsonb;
BEGIN
  PERFORM public._require_admin();
  -- One sign-off at a time.
  PERFORM pg_advisory_xact_lock(hashtext('close_month'), (v_start - DATE '2000-01-01'));
  IF EXISTS (SELECT 1 FROM month_closes WHERE period_start = v_start) THEN
    RAISE EXCEPTION '% is already closed', to_char(v_start, 'FMMonth YYYY') USING ERRCODE = '22023';
  END IF;

  v := public._month_close_status(v_start);
  IF NOT (v ->> 'ready_to_close')::boolean THEN
    RAISE EXCEPTION 'Cannot close % yet: %', to_char(v_start, 'FMMonth YYYY'),
      (SELECT string_agg(x, '; ') FROM jsonb_array_elements_text(v -> 'open_items') x)
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO month_closes (period_start, note, summary, closed_by)
  VALUES (v_start, nullif(trim(coalesce(p_note, '')), ''), v, auth.uid());

  RETURN public._month_close_status(v_start);
END;
$$;

REVOKE ALL ON FUNCTION public.close_month(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_month(date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_month(p_month date, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
BEGIN
  PERFORM public._require_admin();
  IF nullif(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Explain why the month is reopened' USING ERRCODE = '22023';
  END IF;
  UPDATE month_closes SET note = 'Reopened: ' || trim(p_reason) WHERE period_start = v_start;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This month is not closed' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM month_closes WHERE period_start = v_start;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_month(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_month(date, text) TO authenticated;
