-- =============================================================================
-- Phase 7F: monthly vehicle report and driver statement (money-flow plan §5)
-- =============================================================================
-- Owner decision M2: the office can print the full monthly report of every
-- vehicle (revenue, cash, vouchers, every expense) and keeps a record of every
-- voucher. Each report is one read-only call, so the printed page always shows
-- the same figures as the payout engine, the driver settlement and the
-- voucher handover:
--
--   get_vehicle_month_report(vehicle, month)   office only
--   get_driver_statement(driver, month)        office, or the driver themself
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_vehicle_month_report(p_vehicle_id uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date;  -- inclusive
  v_vehicle jsonb;
  v_calc salary_calculations%ROWTYPE;
BEGIN
  PERFORM public._require_admin();

  SELECT jsonb_build_object('id', id, 'plate_number', plate_number, 'make', make, 'model', model, 'year', year)
    INTO v_vehicle FROM vehicles WHERE id = p_vehicle_id;
  IF v_vehicle IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_calc FROM salary_calculations WHERE vehicle_id = p_vehicle_id AND period_start = v_start;

  RETURN jsonb_build_object(
    'vehicle', v_vehicle,
    'period_start', v_start,
    'period_end', v_end,

    -- 1. Owners and drivers in the month, with their dates
    'owners', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'partner', p.name, 'percentage', vp.percentage,
        'from', vp.effective_from, 'to', vp.effective_to) ORDER BY vp.effective_from, p.name), '[]'::jsonb)
      FROM vehicle_partners vp JOIN partners p ON p.id = vp.partner_id
      WHERE vp.vehicle_id = p_vehicle_id
        AND vp.effective_from <= v_end AND (vp.effective_to IS NULL OR vp.effective_to > v_start)),
    'drivers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'driver', d.name, 'from', a.assigned_from, 'to', a.assigned_to) ORDER BY a.assigned_from, d.name), '[]'::jsonb)
      FROM driver_vehicle_assignments a JOIN drivers d ON d.id = a.driver_id
      WHERE a.vehicle_id = p_vehicle_id
        AND a.assigned_from <= v_end AND (a.assigned_to IS NULL OR a.assigned_to > v_start)),
    'pay_terms', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'driver', d.name, 'type', dc.compensation_type,
        'commission_percentage', dc.commission_percentage, 'fixed_salary_amount', dc.fixed_salary_amount,
        'bonus_rate', dc.bonus_rate, 'from', dc.effective_from, 'to', dc.effective_to)
        ORDER BY dc.effective_from, d.name), '[]'::jsonb)
      FROM driver_compensation dc JOIN drivers d ON d.id = dc.driver_id
      WHERE dc.vehicle_id = p_vehicle_id
        AND dc.effective_from <= v_end AND (dc.effective_to IS NULL OR dc.effective_to > v_start)),

    -- 2. Revenue by day
    'revenue_by_day', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date', ride_date, 'rides', n, 'cash', cash, 'vouchers', vouchers, 'other', other, 'total', total)
        ORDER BY ride_date), '[]'::jsonb)
      FROM (
        SELECT ride_date, count(*) AS n,
               coalesce(sum(amount) FILTER (WHERE payment_method = 'Cash'), 0) AS cash,
               coalesce(sum(amount) FILTER (WHERE payment_method = 'Voucher'), 0) AS vouchers,
               coalesce(sum(amount) FILTER (WHERE payment_method NOT IN ('Cash', 'Voucher')), 0) AS other,
               sum(amount) AS total
        FROM rides
        WHERE vehicle_id = p_vehicle_id AND ride_date BETWEEN v_start AND v_end
        GROUP BY ride_date
      ) d),
    'revenue_totals', (
      SELECT jsonb_build_object(
        'rides', count(*),
        'cash', coalesce(sum(amount) FILTER (WHERE payment_method = 'Cash'), 0),
        'vouchers', coalesce(sum(amount) FILTER (WHERE payment_method = 'Voucher'), 0),
        'other', coalesce(sum(amount) FILTER (WHERE payment_method NOT IN ('Cash', 'Voucher')), 0),
        'total', coalesce(sum(amount), 0),
        'vouchers_outstanding', coalesce(sum(amount) FILTER (WHERE payment_method = 'Voucher' AND payment_status = 'Outstanding'), 0),
        'vouchers_collected', coalesce(sum(amount) FILTER (WHERE payment_method = 'Voucher' AND payment_status = 'Collected'), 0))
      FROM rides
      WHERE vehicle_id = p_vehicle_id AND ride_date BETWEEN v_start AND v_end),

    -- 3. Every voucher: who collected it, and which partners hold it
    'vouchers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'ride_id', r.id, 'date', r.ride_date, 'driver', d.name, 'payer', py.name, 'reference', r.reference,
        'amount', r.amount, 'status', r.payment_status,
        'collected_by', r.collected_by_name, 'collected_by_role', r.collected_by_role, 'collected_at', r.collected_at,
        'handed_to', (
          SELECT coalesce(jsonb_agg(jsonb_build_object('partner', p.name, 'percentage', s.percentage, 'amount', s.amount,
                                                       'paid_out_at', s.paid_out_at) ORDER BY p.name), '[]'::jsonb)
          FROM partner_voucher_shares s JOIN partners p ON p.id = s.partner_id
          WHERE s.ride_id = r.id))
        ORDER BY r.ride_date, r.id), '[]'::jsonb)
      FROM rides r
      LEFT JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN payers py ON py.id = r.payer_id
      WHERE r.vehicle_id = p_vehicle_id AND r.payment_method = 'Voucher'
        AND r.ride_date BETWEEN v_start AND v_end),

    -- 4. Expenses: the vehicle's own, and driver/company expenses charged to it
    'expenses', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'date', e.expense_date, 'kind', CASE WHEN e.allocation = 'Vehicle' THEN 'vehicle' ELSE 'charged' END,
        'category', e.category, 'description', e.description, 'amount', e.amount,
        'paid_by', e.paid_by, 'payment_method', e.payment_method, 'driver', d.name,
        'receipt', e.receipt_image_url)
        ORDER BY e.expense_date, e.id), '[]'::jsonb)
      FROM expenses e LEFT JOIN drivers d ON d.id = e.driver_id
      WHERE e.expense_date BETWEEN v_start AND v_end
        AND ((e.allocation = 'Vehicle' AND e.vehicle_id = p_vehicle_id)
             OR (e.review_status = 'charged' AND e.charged_vehicle_id = p_vehicle_id))),

    -- 5. Corrections recorded as adjustments for this payout month
    'adjustments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'amount', amount, 'reason', reason, 'source_type', source_type, 'created_at', created_at)
        ORDER BY created_at), '[]'::jsonb)
      FROM salary_adjustments
      WHERE vehicle_id = p_vehicle_id AND period_start = v_start),

    -- 6-7. The payout: driver pay, balance to share, each partner's share
    'payout', CASE WHEN v_calc.id IS NULL THEN NULL ELSE jsonb_build_object(
      'calculation_id', v_calc.id, 'status', v_calc.status,
      'total_revenue', v_calc.total_revenue, 'total_expenses', v_calc.total_expenses,
      'company_expenses', v_calc.company_expenses, 'charged_expenses', v_calc.charged_expenses,
      'adjustments_total', v_calc.adjustments_total, 'driver_pay_total', v_calc.driver_pay_total,
      'net_revenue', v_calc.net_revenue,
      'loss_brought_forward', v_calc.loss_brought_forward, 'loss_carried_forward', v_calc.loss_carried_forward,
      'company_retained', v_calc.company_retained, 'admin_notes', v_calc.admin_notes,
      'calculated_at', v_calc.calculated_at, 'finalized_at', v_calc.finalized_at) END,
    'driver_pay', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'driver', d.name, 'type', dp.compensation_type,
        'commission_percentage', dp.commission_percentage, 'fixed_salary_amount', dp.fixed_salary_amount,
        'bonus_rate', dp.bonus_rate, 'days_applied', dp.days_applied, 'base_net', dp.base_net,
        'commission_amount', dp.commission_amount, 'salary_amount', dp.salary_amount,
        'bonus_amount', dp.bonus_amount, 'amount', dp.driver_pay_amount) ORDER BY d.name), '[]'::jsonb)
      FROM driver_pay_calculations dp JOIN drivers d ON d.id = dp.driver_id
      WHERE dp.calculation_id = v_calc.id),
    'shares', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'partner', p.name, 'percentage', scs.ownership_percentage, 'share', scs.share_amount,
        'settlement_status', st.status, 'cash_amount', st.cash_amount, 'voucher_amount', st.voucher_amount,
        'vouchers_kept_by_office', st.vouchers_kept_by_office,
        'paid_at', st.paid_at, 'payment_method', st.payment_method, 'payment_reference', st.payment_reference)
        ORDER BY scs.ownership_percentage DESC, p.name), '[]'::jsonb)
      FROM salary_calculation_shares scs
      JOIN partners p ON p.id = scs.partner_id
      LEFT JOIN settlements st ON st.share_id = scs.id AND st.status <> 'void'
      WHERE scs.calculation_id = v_calc.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_vehicle_month_report(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vehicle_month_report(uuid, date) TO authenticated;

-- The driver's settlement (7D) with every entry behind each line.
CREATE OR REPLACE FUNCTION public.get_driver_statement(p_driver_id uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month')::date;  -- exclusive
  v_settlement jsonb;
BEGIN
  -- Checks access: the office, or the driver themself.
  v_settlement := public.get_driver_settlement(p_driver_id, v_start);

  RETURN jsonb_build_object(
    'settlement', v_settlement,
    'assignments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'vehicle', v.plate_number, 'from', a.assigned_from, 'to', a.assigned_to) ORDER BY a.assigned_from), '[]'::jsonb)
      FROM driver_vehicle_assignments a JOIN vehicles v ON v.id = a.vehicle_id
      WHERE a.driver_id = p_driver_id
        AND a.assigned_from < v_end AND (a.assigned_to IS NULL OR a.assigned_to > v_start)),
    'cash_rides', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date', r.ride_date, 'vehicle', v.plate_number, 'amount', r.amount) ORDER BY r.ride_date, r.created_at), '[]'::jsonb)
      FROM rides r LEFT JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.driver_id = p_driver_id AND r.payment_method = 'Cash' AND r.payment_status <> 'Cancelled'
        AND r.ride_date >= v_start AND r.ride_date < v_end),
    'vouchers_collected', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'ride_date', r.ride_date, 'collected_on', (r.collected_at AT TIME ZONE 'Asia/Riyadh')::date,
        'vehicle', v.plate_number, 'payer', py.name, 'reference', r.reference, 'amount', r.amount)
        ORDER BY r.collected_at), '[]'::jsonb)
      FROM rides r LEFT JOIN vehicles v ON v.id = r.vehicle_id LEFT JOIN payers py ON py.id = r.payer_id
      WHERE r.driver_id = p_driver_id AND r.payment_method = 'Voucher'
        AND r.payment_status = 'Collected' AND r.collected_by_role = 'driver'
        AND (r.collected_at AT TIME ZONE 'Asia/Riyadh')::date >= v_start
        AND (r.collected_at AT TIME ZONE 'Asia/Riyadh')::date < v_end),
    'expenses_paid', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date', e.expense_date, 'vehicle', v.plate_number, 'category', e.category, 'description', e.description,
        'amount', e.amount, 'from', CASE WHEN e.payment_method = 'Cash' THEN 'cash in hand' ELSE 'own money' END)
        ORDER BY e.expense_date, e.created_at), '[]'::jsonb)
      FROM expenses e LEFT JOIN vehicles v ON v.id = e.vehicle_id
      WHERE e.driver_id = p_driver_id AND e.paid_by = 'driver'
        AND e.expense_date >= v_start AND e.expense_date < v_end),
    'handovers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date', h.handover_date, 'amount', h.amount, 'status', h.status, 'method', h.method,
        'reference', h.reference, 'admin_note', h.admin_note) ORDER BY h.handover_date, h.created_at), '[]'::jsonb)
      FROM cash_handovers h
      WHERE h.driver_id = p_driver_id AND h.handover_date >= v_start AND h.handover_date < v_end)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_statement(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_statement(uuid, date) TO authenticated;
