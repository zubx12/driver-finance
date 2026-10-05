-- =============================================================================
-- L4: a driver who left can rejoin (docs/driver-profile-plan.md §5)
-- =============================================================================
-- rejoin_driver (office): only a driver who is Left (cleared, L3). Starts a new
-- employment period on the same driver record, so the old history stays with
-- them; the status becomes Active and the login works again (my_driver_id).
-- The vehicle and pay terms are assigned again by the office as for a new
-- driver. Their settlements continue from the last one, which clearance
-- left at zero.
-- The driver statement now shows the joining and leaving dates in the month.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rejoin_driver(p_driver_id uuid, p_joined_on date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_prev_end date;
BEGIN
  PERFORM public._require_admin();
  SELECT status INTO v_status FROM drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status IS DISTINCT FROM 'Left' THEN
    RAISE EXCEPTION 'Only a driver who has left (clearance approved) can rejoin' USING ERRCODE = '22023';
  END IF;
  IF p_joined_on IS NULL OR p_joined_on > public.app_today() THEN
    RAISE EXCEPTION 'The joining date cannot be empty or in the future' USING ERRCODE = '22023';
  END IF;
  SELECT max(coalesce(left_on, last_working_day + 1)) INTO v_prev_end
  FROM driver_employment_periods WHERE driver_id = p_driver_id;
  IF v_prev_end IS NOT NULL AND p_joined_on < v_prev_end THEN
    RAISE EXCEPTION 'The new joining date must be on or after % (when the driver left)', v_prev_end
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO driver_employment_periods (driver_id, joined_on) VALUES (p_driver_id, p_joined_on);
  UPDATE drivers SET status = 'Active', updated_at = now() WHERE id = p_driver_id;

  RETURN public.get_driver_employment(p_driver_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rejoin_driver(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rejoin_driver(uuid, date) TO authenticated;

-- As in 20261005000001, plus the employment dates.
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
    -- Joining and leaving dates of the employment periods touching the month (L4).
    'employment', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'joined_on', p.joined_on, 'last_working_day', p.last_working_day, 'left_on', p.left_on, 'leave_reason', p.leave_reason)
        ORDER BY p.joined_on), '[]'::jsonb)
      FROM driver_employment_periods p
      WHERE p.driver_id = p_driver_id AND p.joined_on < v_end
        AND (p.last_working_day IS NULL OR p.last_working_day >= v_start)),
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

