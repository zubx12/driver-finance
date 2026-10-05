-- =============================================================================
-- W3: data for the driver workspace's "Cash & vouchers" and "Settlements & pay"
-- =============================================================================
-- Both office only, read-only.
--
-- get_driver_vouchers(driver, from, to, outstanding_only): the driver's voucher
--   rides with payer, reference, status, who collected each one and when, and
--   which partners hold it (handed over with their share, 7E).
-- get_driver_money_history(driver): every closed monthly settlement (opening,
--   closing, paid now, written off, carried, how and when), the driver's pay
--   per month and vehicle from the payout engine (draft or finalized, with how
--   it was calculated), and the pay-terms history.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_driver_vouchers(
  p_driver_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_outstanding_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._require_admin();
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'ride_id', r.id, 'date', r.ride_date, 'vehicle', v.plate_number,
      'payer_id', r.payer_id, 'payer', py.name, 'reference', r.reference, 'amount', r.amount,
      'status', r.payment_status,
      'collected_by', r.collected_by_name, 'collected_by_role', r.collected_by_role, 'collected_at', r.collected_at,
      'handed_to', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('partner', p.name, 'percentage', s.percentage,
                                                     'amount', s.amount, 'paid_out_at', s.paid_out_at) ORDER BY p.name), '[]'::jsonb)
        FROM partner_voucher_shares s JOIN partners p ON p.id = s.partner_id WHERE s.ride_id = r.id))
      ORDER BY r.ride_date DESC, r.created_at DESC), '[]'::jsonb)
    FROM rides r
    LEFT JOIN payers py ON py.id = r.payer_id
    LEFT JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.driver_id = p_driver_id AND r.payment_method = 'Voucher'
      AND (p_from IS NULL OR r.ride_date >= p_from)
      AND (p_to IS NULL OR r.ride_date <= p_to)
      AND (NOT coalesce(p_outstanding_only, false) OR r.payment_status = 'Outstanding')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_vouchers(uuid, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_vouchers(uuid, date, date, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_driver_money_history(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._require_admin();
  IF NOT EXISTS (SELECT 1 FROM drivers WHERE id = p_driver_id) THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'settlements', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(s.period_start, 'YYYY-MM'),
        'opening_balance', s.opening_balance, 'cash_collected', s.cash_collected,
        'vouchers_collected', s.vouchers_collected, 'expenses_paid', s.expenses_paid,
        'driver_pay', s.driver_pay, 'handovers_confirmed', s.handovers_confirmed,
        'closing_balance', s.closing_balance, 'settled_amount', s.settled_amount,
        'written_off', s.written_off, 'write_off_reason', s.write_off_reason,
        'carried_forward', s.carried_forward, 'settle_method', s.settle_method,
        'settle_reference', s.settle_reference, 'note', s.note, 'closed_at', s.closed_at)
        ORDER BY s.period_start DESC), '[]'::jsonb)
      FROM driver_settlements s WHERE s.driver_id = p_driver_id),
    'pay', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(sc.period_start, 'YYYY-MM'), 'vehicle', v.plate_number, 'status', sc.status,
        'type', d.compensation_type, 'commission_percentage', d.commission_percentage,
        'fixed_salary_amount', d.fixed_salary_amount, 'bonus_rate', d.bonus_rate,
        'days_applied', d.days_applied, 'base_net', d.base_net,
        'commission_amount', d.commission_amount, 'salary_amount', d.salary_amount,
        'bonus_amount', d.bonus_amount, 'amount', d.driver_pay_amount)
        ORDER BY sc.period_start DESC, v.plate_number), '[]'::jsonb)
      FROM driver_pay_calculations d
      JOIN salary_calculations sc ON sc.id = d.calculation_id
      JOIN vehicles v ON v.id = sc.vehicle_id
      WHERE d.driver_id = p_driver_id),
    'pay_terms', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'vehicle', v.plate_number, 'type', dc.compensation_type,
        'commission_percentage', dc.commission_percentage, 'fixed_salary_amount', dc.fixed_salary_amount,
        'bonus_rate', dc.bonus_rate, 'from', dc.effective_from, 'to', dc.effective_to)
        ORDER BY dc.effective_from DESC), '[]'::jsonb)
      FROM driver_compensation dc LEFT JOIN vehicles v ON v.id = dc.vehicle_id
      WHERE dc.driver_id = p_driver_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_money_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_money_history(uuid) TO authenticated;
