-- =============================================================================
-- L2: a driver leaving (docs/driver-profile-plan.md §5)
-- =============================================================================
-- Active ──start leaving──▶ Leaving ──clearance approved (L3)──▶ Left
--
-- start_driver_leaving (office): last working day (today or earlier) and the
-- reason. The vehicle assignment and the pay terms end that day (dated
-- history kept), the status becomes Leaving.
-- While Leaving the driver can still log in: upload entries waiting on the
-- phone, hand over cash, see their statement. No ride or expense can be dated
-- after the last working day (by anyone); handovers can, to clear the cash.
-- Left drivers are shut out by the database: my_driver_id() no longer
-- resolves for them, so every driver policy denies access.
-- cancel_driver_leaving (office): until clearance; the office re-assigns the
-- vehicle and pay terms if the driver stays.
-- =============================================================================

ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_status_check;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_status_check
  CHECK (status IN ('Active', 'Inactive', 'Suspended', 'Leaving', 'Left'));

-- Left drivers no longer act as drivers anywhere (RLS, entry rules, functions).
CREATE OR REPLACE FUNCTION public.my_driver_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM drivers
  WHERE linked_auth_id = auth.uid() AND status <> 'Left'
  ORDER BY created_at LIMIT 1
$$;

-- -----------------------------------------------------------------------------
-- No ride or expense after the last working day
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._check_entry_after_leaving()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
  v_old_date date;
  v_last date;
BEGIN
  IF TG_TABLE_NAME = 'rides' THEN
    v_date := NEW.ride_date;
    IF TG_OP = 'UPDATE' THEN v_old_date := OLD.ride_date; END IF;
  ELSE
    v_date := NEW.expense_date;
    IF TG_OP = 'UPDATE' THEN v_old_date := OLD.expense_date; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.driver_id, v_old_date) IS NOT DISTINCT FROM (NEW.driver_id, v_date) THEN
    RETURN NEW;   -- date and driver unchanged (e.g. a voucher being collected)
  END IF;

  -- The period that has ended before this date, unless a later period
  -- (the driver rejoined) covers it.
  SELECT p.last_working_day INTO v_last
  FROM driver_employment_periods p
  WHERE p.driver_id = NEW.driver_id
    AND p.last_working_day IS NOT NULL AND p.last_working_day < v_date
    AND NOT EXISTS (
      SELECT 1 FROM driver_employment_periods q
      WHERE q.driver_id = NEW.driver_id AND q.joined_on <= v_date
        AND (q.last_working_day IS NULL OR q.last_working_day >= v_date))
  ORDER BY p.last_working_day DESC LIMIT 1;

  IF v_last IS NOT NULL THEN
    RAISE EXCEPTION 'The driver''s last working day was %, so nothing can be dated % or later.', v_last, v_last + 1
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._check_entry_after_leaving() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rides_after_leaving ON public.rides;
CREATE TRIGGER rides_after_leaving
  BEFORE INSERT OR UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public._check_entry_after_leaving();
DROP TRIGGER IF EXISTS expenses_after_leaving ON public.expenses;
CREATE TRIGGER expenses_after_leaving
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public._check_entry_after_leaving();

-- -----------------------------------------------------------------------------
-- Start / cancel leaving (office)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_driver_leaving(p_driver_id uuid, p_last_working_day date, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_driver drivers%ROWTYPE;
  v_period driver_employment_periods%ROWTYPE;
  v_after date;
  v_end date := p_last_working_day + 1;   -- end dates are exclusive
BEGIN
  PERFORM public._require_admin();
  IF p_last_working_day IS NULL OR p_last_working_day > public.app_today() THEN
    RAISE EXCEPTION 'The last working day must be today or earlier' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Give the reason for leaving' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_driver FROM drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_driver.status IN ('Leaving', 'Left') THEN
    RAISE EXCEPTION 'This driver is already %', lower(v_driver.status) USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_period FROM driver_employment_periods
  WHERE driver_id = p_driver_id AND left_on IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The driver has no open employment period' USING ERRCODE = '55000';
  END IF;
  IF p_last_working_day < v_period.joined_on THEN
    RAISE EXCEPTION 'The last working day cannot be before the joining date (%)', v_period.joined_on USING ERRCODE = '22023';
  END IF;

  -- Entries already dated after the last day must be corrected first.
  SELECT max(d) INTO v_after FROM (
    SELECT max(ride_date) AS d FROM rides WHERE driver_id = p_driver_id
    UNION ALL SELECT max(expense_date) FROM expenses WHERE driver_id = p_driver_id
  ) x;
  IF v_after IS NOT NULL AND v_after > p_last_working_day THEN
    RAISE EXCEPTION 'The driver has entries dated % (after the last working day). Correct them first or choose a later last day.', v_after
      USING ERRCODE = '55000';
  END IF;
  -- Pay terms starting after the last day would never apply.
  IF EXISTS (SELECT 1 FROM driver_compensation WHERE driver_id = p_driver_id AND effective_from > p_last_working_day) THEN
    RAISE EXCEPTION 'The driver has pay terms starting after the last working day. Remove them first.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE driver_employment_periods
  SET last_working_day = p_last_working_day, leave_reason = trim(p_reason)
  WHERE id = v_period.id;

  -- Pay terms end on the last working day.
  UPDATE driver_compensation SET effective_to = v_end
  WHERE driver_id = p_driver_id AND (effective_to IS NULL OR effective_to > v_end);

  -- The vehicle assignment ends on the last working day (dated history, 7A).
  IF v_driver.vehicle_id IS NOT NULL THEN
    PERFORM set_config('app.assignment_date', v_end::text, true);
    UPDATE drivers SET vehicle_id = NULL WHERE id = p_driver_id;
    PERFORM set_config('app.assignment_date', '', true);
  END IF;
  UPDATE driver_vehicle_assignments SET assigned_to = v_end
  WHERE driver_id = p_driver_id AND (assigned_to IS NULL OR assigned_to > v_end) AND assigned_from < v_end;

  UPDATE drivers SET status = 'Leaving', updated_at = now() WHERE id = p_driver_id;

  RETURN public.get_driver_employment(p_driver_id);
END;
$$;

REVOKE ALL ON FUNCTION public.start_driver_leaving(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_driver_leaving(uuid, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_driver_leaving(p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._require_admin();
  PERFORM 1 FROM drivers WHERE id = p_driver_id AND status = 'Leaving' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a driver who is leaving (not yet cleared) can be kept' USING ERRCODE = '22023';
  END IF;
  UPDATE driver_employment_periods SET last_working_day = NULL, leave_reason = NULL
  WHERE driver_id = p_driver_id AND left_on IS NULL;
  UPDATE drivers SET status = 'Active', updated_at = now() WHERE id = p_driver_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_driver_leaving(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_driver_leaving(uuid) TO authenticated;

-- The office may not change status to Leaving / Left by hand: only through
-- these functions and clearance (L3), so the dates and checks always exist.
CREATE OR REPLACE FUNCTION public._guard_driver_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status IN ('Leaving', 'Left') OR OLD.status IN ('Leaving', 'Left'))
     AND pg_trigger_depth() = 1
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Use "Start leaving" / clearance to change a driver to or from Leaving or Left'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._guard_driver_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drivers_status_guard ON public.drivers;
CREATE TRIGGER drivers_status_guard
  BEFORE UPDATE OF status ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public._guard_driver_status();
