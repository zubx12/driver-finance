-- =============================================================================
-- L1: driver employment record (joining date, leaving date, reason)
-- =============================================================================
-- docs/driver-profile-plan.md §5. Each time a driver works for the company is
-- one employment period: joined on, last working day, left on, reason. A
-- driver who leaves and comes back gets a new period on the same driver
-- record, so their old history stays with them.
--
-- This step stores the record and lets the office correct the joining date.
-- Leaving (L2), clearance (L3) and rejoining (L4) build on it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driver_employment_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  joined_on date NOT NULL,
  last_working_day date,           -- set when leaving starts (L2)
  left_on date,                    -- set when clearance is approved (L3)
  leave_reason text,
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (last_working_day IS NULL OR last_working_day >= joined_on),
  CHECK (left_on IS NULL OR (last_working_day IS NOT NULL AND left_on >= last_working_day)),
  CHECK (last_working_day IS NULL OR nullif(trim(leave_reason), '') IS NOT NULL),
  -- Periods of one driver never overlap; at most one is open.
  CONSTRAINT driver_employment_no_overlap EXCLUDE USING gist (
    driver_id WITH =,
    daterange(joined_on, coalesce(left_on, last_working_day + 1), '[)') WITH &&
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS driver_employment_one_open
  ON public.driver_employment_periods (driver_id) WHERE left_on IS NULL;

ALTER TABLE public.driver_employment_periods ENABLE ROW LEVEL SECURITY;
-- Written through the functions below (and the new-driver trigger).
CREATE POLICY "admin_read" ON public.driver_employment_periods FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "driver_read_own" ON public.driver_employment_periods FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));

CREATE TRIGGER driver_employment_periods_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_employment_periods
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_changes();

-- Existing drivers: joined on the account creation date (Riyadh), or their
-- first recorded activity if that is earlier. The office can correct it.
INSERT INTO public.driver_employment_periods (driver_id, joined_on, created_by)
SELECT d.id,
       least(
         (coalesce(d.created_at, now()) AT TIME ZONE 'Asia/Riyadh')::date,
         coalesce((SELECT min(ride_date) FROM public.rides WHERE driver_id = d.id), 'infinity'::date),
         coalesce((SELECT min(expense_date) FROM public.expenses WHERE driver_id = d.id), 'infinity'::date),
         coalesce((SELECT min(assigned_from) FROM public.driver_vehicle_assignments WHERE driver_id = d.id), 'infinity'::date)
       ),
       NULL
FROM public.drivers d
WHERE NOT EXISTS (SELECT 1 FROM public.driver_employment_periods p WHERE p.driver_id = d.id);

-- A new driver starts an employment period on the day the account is made.
CREATE OR REPLACE FUNCTION public._start_driver_employment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO driver_employment_periods (driver_id, joined_on)
  VALUES (NEW.id, (coalesce(NEW.created_at, now()) AT TIME ZONE 'Asia/Riyadh')::date);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._start_driver_employment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drivers_start_employment ON public.drivers;
CREATE TRIGGER drivers_start_employment
  AFTER INSERT ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public._start_driver_employment();

-- -----------------------------------------------------------------------------
-- Read: the office for any driver, a driver for themself
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_driver_employment(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current jsonb;
BEGIN
  IF NOT public.is_admin() AND p_driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RAISE EXCEPTION 'You can only see your own record' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(p) INTO v_current
  FROM driver_employment_periods p
  WHERE p.driver_id = p_driver_id
  ORDER BY p.joined_on DESC LIMIT 1;

  RETURN jsonb_build_object(
    'current', v_current,
    -- Days with the company in the current period, up to today or the last working day.
    'days_employed', CASE WHEN v_current IS NULL THEN NULL ELSE
      least(coalesce((v_current ->> 'last_working_day')::date, public.app_today()), public.app_today())
      - (v_current ->> 'joined_on')::date + 1 END,
    'periods', (
      SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.joined_on DESC), '[]'::jsonb)
      FROM driver_employment_periods p WHERE p.driver_id = p_driver_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_employment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_employment(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Correct the joining date of the current period (office only)
-- -----------------------------------------------------------------------------
-- Not after today or after the driver's first entry in this period, and not
-- inside an earlier period.
CREATE OR REPLACE FUNCTION public.set_driver_joined_on(p_driver_id uuid, p_joined_on date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period driver_employment_periods%ROWTYPE;
  v_prev_end date;
  v_first date;
BEGIN
  PERFORM public._require_admin();
  IF p_joined_on IS NULL OR p_joined_on > public.app_today() THEN
    RAISE EXCEPTION 'The joining date cannot be empty or in the future' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_period FROM driver_employment_periods
  WHERE driver_id = p_driver_id ORDER BY joined_on DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT max(coalesce(left_on, last_working_day + 1)) INTO v_prev_end
  FROM driver_employment_periods WHERE driver_id = p_driver_id AND id <> v_period.id;
  IF v_prev_end IS NOT NULL AND p_joined_on < v_prev_end THEN
    RAISE EXCEPTION 'The joining date must be on or after % (the end of the previous period)', v_prev_end
      USING ERRCODE = '22023';
  END IF;

  -- The earliest entry that belongs to this period.
  SELECT min(d) INTO v_first FROM (
    SELECT min(ride_date) AS d FROM rides WHERE driver_id = p_driver_id AND ride_date >= coalesce(v_prev_end, '-infinity'::date)
    UNION ALL SELECT min(expense_date) FROM expenses WHERE driver_id = p_driver_id AND expense_date >= coalesce(v_prev_end, '-infinity'::date)
    UNION ALL SELECT min(handover_date) FROM cash_handovers WHERE driver_id = p_driver_id AND handover_date >= coalesce(v_prev_end, '-infinity'::date)
  ) x;
  IF v_first IS NOT NULL AND p_joined_on > v_first THEN
    RAISE EXCEPTION 'The driver already has entries from %, so the joining date cannot be later than that', v_first
      USING ERRCODE = '22023';
  END IF;
  IF v_period.last_working_day IS NOT NULL AND p_joined_on > v_period.last_working_day THEN
    RAISE EXCEPTION 'The joining date cannot be after the last working day (%)', v_period.last_working_day
      USING ERRCODE = '22023';
  END IF;

  UPDATE driver_employment_periods SET joined_on = p_joined_on WHERE id = v_period.id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_driver_joined_on(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_driver_joined_on(uuid, date) TO authenticated;
