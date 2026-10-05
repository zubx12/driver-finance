-- =============================================================================
-- W2: a driver's figures month by month (driver workspace, Overview tab)
-- =============================================================================
-- get_driver_months(driver, from_month, to_month), office only: one row per
-- month with the bookings (by payment method), revenue, expenses (all, and
-- those the driver paid), driver pay (finalized payouts only), handovers and
-- the settlement (open or closed, closing / carried balance).
-- The settlement figures come from get_driver_settlement, so the Overview
-- always shows the same numbers as Driver Settlements and the statements.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_driver_months(p_driver_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from date := date_trunc('month', p_from::timestamp)::date;
  v_to date := date_trunc('month', p_to::timestamp)::date;
  v_rows jsonb := '[]'::jsonb;
  m date;
  s jsonb;
  r record;
  e record;
BEGIN
  PERFORM public._require_admin();
  IF NOT EXISTS (SELECT 1 FROM drivers WHERE id = p_driver_id) THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_from > v_to OR v_to - v_from > 800 THEN
    RAISE EXCEPTION 'Choose up to 24 months, oldest first' USING ERRCODE = '22023';
  END IF;

  FOR m IN SELECT generate_series(v_from, v_to, interval '1 month')::date LOOP
    SELECT count(*) AS rides,
           count(*) FILTER (WHERE payment_method = 'Cash') AS cash_rides,
           count(*) FILTER (WHERE payment_method = 'Voucher') AS voucher_rides,
           coalesce(sum(amount), 0) AS revenue,
           coalesce(sum(amount) FILTER (WHERE payment_method = 'Cash'), 0) AS cash,
           coalesce(sum(amount) FILTER (WHERE payment_method = 'Voucher'), 0) AS vouchers,
           coalesce(sum(amount) FILTER (WHERE payment_method NOT IN ('Cash', 'Voucher')), 0) AS other,
           coalesce(sum(amount) FILTER (WHERE payment_method = 'Voucher' AND payment_status = 'Outstanding'), 0) AS vouchers_outstanding
      INTO r
    FROM rides
    WHERE driver_id = p_driver_id AND ride_date >= m AND ride_date < (m + interval '1 month')::date;

    SELECT count(*) AS n, coalesce(sum(amount), 0) AS total,
           coalesce(sum(amount) FILTER (WHERE paid_by = 'driver'), 0) AS paid_by_driver
      INTO e
    FROM expenses
    WHERE driver_id = p_driver_id AND expense_date >= m AND expense_date < (m + interval '1 month')::date;

    s := public.get_driver_settlement(p_driver_id, m);

    v_rows := v_rows || jsonb_build_object(
      'month', to_char(m, 'YYYY-MM'),
      'rides', r.rides, 'cash_rides', r.cash_rides, 'voucher_rides', r.voucher_rides,
      'revenue', r.revenue, 'cash', r.cash, 'vouchers', r.vouchers, 'other', r.other,
      'vouchers_outstanding', r.vouchers_outstanding,
      'expenses', e.n, 'expenses_total', e.total, 'expenses_paid_by_driver', e.paid_by_driver,
      'driver_pay', (s ->> 'driver_pay')::numeric,
      -- none: no payout with this driver; draft: not finalized yet; finalized
      'pay_status', CASE
        WHEN jsonb_array_length(s -> 'pay_lines') = 0 THEN 'none'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(s -> 'pay_lines') l WHERE l ->> 'status' <> 'finalized') THEN 'draft'
        ELSE 'finalized' END,
      'handovers_confirmed', (s ->> 'handovers_confirmed')::numeric,
      'vouchers_collected', (s ->> 'vouchers_collected')::numeric,
      'settlement_status', s ->> 'status',
      'closing_balance', (s ->> 'closing_balance')::numeric,
      'carried_forward', (s ->> 'carried_forward')::numeric
    );
  END LOOP;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_months(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_months(uuid, date, date) TO authenticated;
