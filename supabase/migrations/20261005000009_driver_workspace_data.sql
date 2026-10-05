-- =============================================================================
-- W1: driver codes and the driver page's data in one admin-only call
-- =============================================================================
-- docs/agent-prompts/driver-profile-and-navigation.md (sections 3, 3a, 7).
--
-- 1. Driver codes (owner decision 2026-10-05): every driver gets a permanent
--    code DRV-00001, DRV-00002, ... Existing drivers are numbered in order of
--    account creation. The code is set by the database on insert and can never
--    be changed or reused (a driver who rejoins keeps theirs). The internal id
--    stays the key everywhere.
-- 2. get_driver_profile(driver, month): everything the admin driver page shows,
--    for the office only. It replaces the API route that read the data with the
--    service-role key (bypassing row-level security).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Driver codes
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.driver_code_seq;

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS driver_code text;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at NULLS LAST, id) AS n
  FROM public.drivers WHERE driver_code IS NULL
)
UPDATE public.drivers d
SET driver_code = 'DRV-' || lpad(n::text, 5, '0')
FROM numbered WHERE numbered.id = d.id;

SELECT setval('public.driver_code_seq',
  greatest((SELECT count(*) FROM public.drivers), 1), (SELECT count(*) FROM public.drivers) > 0);

ALTER TABLE public.drivers
  ALTER COLUMN driver_code SET NOT NULL,
  ADD CONSTRAINT drivers_driver_code_unique UNIQUE (driver_code),
  ADD CONSTRAINT drivers_driver_code_format CHECK (driver_code ~ '^DRV-[0-9]{5,}$');

-- Set by the database on insert (anything sent is ignored); never changed.
CREATE OR REPLACE FUNCTION public._driver_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.driver_code := 'DRV-' || lpad(nextval('public.driver_code_seq')::text, 5, '0');
  ELSIF NEW.driver_code IS DISTINCT FROM OLD.driver_code THEN
    RAISE EXCEPTION 'A driver code cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._driver_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drivers_driver_code ON public.drivers;
CREATE TRIGGER drivers_driver_code
  BEFORE INSERT OR UPDATE OF driver_code ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public._driver_code();

-- -----------------------------------------------------------------------------
-- 2. The driver page's data (office only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_driver_profile(p_driver_id uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date;  -- inclusive
  d drivers%ROWTYPE;
BEGIN
  PERFORM public._require_admin();
  SELECT * INTO d FROM drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', v_start, 'end', v_end),
    'driver', jsonb_build_object(
      'id', d.id, 'driver_code', d.driver_code, 'name', d.name, 'username', d.username,
      'phone', d.phone, 'status', d.status, 'vehicle_id', d.vehicle_id, 'created_at', d.created_at,
      -- The driver's login is also a partner's login (D6).
      'is_partner', d.linked_auth_id IS NOT NULL
                    AND EXISTS (SELECT 1 FROM partners p WHERE p.linked_auth_id = d.linked_auth_id),
      'last_activity', (SELECT max(t) FROM (
          SELECT max(created_at) AS t FROM rides WHERE driver_id = d.id
          UNION ALL SELECT max(created_at) FROM expenses WHERE driver_id = d.id
          UNION ALL SELECT max(created_at) FROM cash_handovers WHERE driver_id = d.id) x)),
    'vehicle', (SELECT jsonb_build_object('id', v.id, 'make', v.make, 'model', v.model,
                  'plate_number', v.plate_number, 'year', v.year,
                  'since', (SELECT max(a.assigned_from) FROM driver_vehicle_assignments a
                            WHERE a.driver_id = d.id AND a.vehicle_id = v.id AND a.assigned_to IS NULL))
                FROM vehicles v WHERE v.id = d.vehicle_id),
    -- Owners of the current vehicle during the month (with dates).
    'vehiclePartners', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'id', vp.id, 'percentage', vp.percentage, 'effective_from', vp.effective_from,
                          'effective_to', vp.effective_to, 'partners', jsonb_build_object('name', p.name))
                          ORDER BY vp.effective_from, p.name), '[]'::jsonb)
                        FROM vehicle_partners vp JOIN partners p ON p.id = vp.partner_id
                        WHERE vp.vehicle_id = d.vehicle_id
                          AND vp.effective_from <= v_end AND (vp.effective_to IS NULL OR vp.effective_to > v_start)),
    -- This driver's pay terms on the vehicle during the month (latest first).
    'driverCompensation', (SELECT jsonb_build_object(
                             'compensation_type', dc.compensation_type, 'commission_percentage', dc.commission_percentage,
                             'fixed_salary_amount', dc.fixed_salary_amount, 'bonus_rate', dc.bonus_rate,
                             'effective_from', dc.effective_from, 'effective_to', dc.effective_to)
                           FROM driver_compensation dc
                           WHERE dc.driver_id = d.id AND dc.vehicle_id = d.vehicle_id
                             AND dc.effective_from <= v_end AND (dc.effective_to IS NULL OR dc.effective_to > v_start)
                           ORDER BY dc.effective_from DESC LIMIT 1),
    'rides', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', r.id, 'ride_date', r.ride_date, 'amount', r.amount, 'payment_method', r.payment_method,
                'payment_status', r.payment_status, 'payer_id', r.payer_id, 'reference', r.reference,
                'created_at', r.created_at,
                'payers', CASE WHEN py.id IS NULL THEN NULL ELSE jsonb_build_object('name', py.name) END,
                'vehicles', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('plate_number', v.plate_number) END)
                ORDER BY r.ride_date DESC, r.created_at DESC), '[]'::jsonb)
              FROM rides r LEFT JOIN payers py ON py.id = r.payer_id LEFT JOIN vehicles v ON v.id = r.vehicle_id
              WHERE r.driver_id = d.id AND r.ride_date BETWEEN v_start AND v_end),
    'expenses', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', e.id, 'expense_date', e.expense_date, 'amount', e.amount, 'category', e.category,
                   'description', e.description, 'receipt_image_url', e.receipt_image_url, 'paid_by', e.paid_by,
                   'payment_method', e.payment_method, 'allocation', e.allocation, 'review_status', e.review_status,
                   'created_at', e.created_at,
                   'vehicles', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('plate_number', v.plate_number) END)
                   ORDER BY e.expense_date DESC, e.created_at DESC), '[]'::jsonb)
                 FROM expenses e LEFT JOIN vehicles v ON v.id = e.vehicle_id
                 WHERE e.driver_id = d.id AND e.expense_date BETWEEN v_start AND v_end),
    -- Balance with the office after the latest settled month (+ driver owes the office).
    'balance', (SELECT jsonb_build_object('carried_forward', s.carried_forward, 'period_start', s.period_start)
                FROM driver_settlements s WHERE s.driver_id = d.id ORDER BY s.period_start DESC LIMIT 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_profile(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_profile(uuid, date) TO authenticated;
