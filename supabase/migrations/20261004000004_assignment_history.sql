-- =============================================================================
-- Phase 7A: driver-vehicle assignment history (owner decision M3)
-- =============================================================================
-- Drivers and partners can change vehicle in the middle of a month, and every
-- record must keep its dates. Partner ownership and driver pay terms already
-- have from/to dates; which driver drove which vehicle only kept the current
-- vehicle. This table keeps the full history.
--
-- It is written by a trigger on drivers.vehicle_id, so every path (assign /
-- unassign, account creation, direct admin edits) is recorded. assign_driver
-- and unassign_driver pass their effective date through the transaction
-- setting app.assignment_date; otherwise today (Riyadh) is used.
-- Dates are half-open: [assigned_from, assigned_to).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driver_vehicle_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  assigned_from date NOT NULL,
  assigned_to date,
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (assigned_to IS NULL OR assigned_to > assigned_from),
  -- A driver is on one vehicle at a time. (A vehicle may have several drivers
  -- over a period, e.g. shifts.)
  CONSTRAINT driver_vehicle_assignments_no_overlap EXCLUDE USING gist (
    driver_id WITH =,
    daterange(assigned_from, assigned_to, '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_driver_vehicle_assignments_vehicle
  ON public.driver_vehicle_assignments (vehicle_id, assigned_from);

ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- Prevents non-admins from editing history; it is written by the trigger.
CREATE POLICY "admin_all" ON public.driver_vehicle_assignments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- A driver sees their own history.
CREATE POLICY "driver_read_own" ON public.driver_vehicle_assignments FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));
-- A partner sees who drove their vehicle while they held a share.
CREATE POLICY "partner_read_linked" ON public.driver_vehicle_assignments FOR SELECT TO authenticated
  USING (public.partner_linked_during(
    vehicle_id, assigned_from, coalesce(assigned_to - 1, public.app_today())));

CREATE TRIGGER driver_vehicle_assignments_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_vehicle_assignments
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_changes();

-- -----------------------------------------------------------------------------
-- 1. Back-fill today's assignments
-- -----------------------------------------------------------------------------
-- Start date: the driver's earliest ride or pay terms on that vehicle, else
-- today. Earlier moves were never recorded and cannot be recovered.
INSERT INTO public.driver_vehicle_assignments (driver_id, vehicle_id, assigned_from, created_by)
SELECT d.id, d.vehicle_id,
       least(
         coalesce((SELECT min(r.ride_date) FROM public.rides r WHERE r.driver_id = d.id AND r.vehicle_id = d.vehicle_id), public.app_today()),
         coalesce((SELECT min(dc.effective_from) FROM public.driver_compensation dc WHERE dc.driver_id = d.id AND dc.vehicle_id = d.vehicle_id), public.app_today()),
         public.app_today()
       ),
       NULL
FROM public.drivers d
WHERE d.vehicle_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.driver_vehicle_assignments a WHERE a.driver_id = d.id);

-- -----------------------------------------------------------------------------
-- 2. Trigger: record every change of drivers.vehicle_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._record_driver_assignment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date := coalesce(nullif(current_setting('app.assignment_date', true), '')::date, public.app_today());
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.vehicle_id IS NOT DISTINCT FROM NEW.vehicle_id THEN
      RETURN NULL;
    END IF;
    IF OLD.vehicle_id IS NOT NULL THEN
      -- Assigned and moved again on the same day: the stay covers no days.
      DELETE FROM driver_vehicle_assignments
      WHERE driver_id = NEW.id AND vehicle_id = OLD.vehicle_id
        AND assigned_to IS NULL AND assigned_from >= v_date;
      UPDATE driver_vehicle_assignments
      SET assigned_to = v_date
      WHERE driver_id = NEW.id AND vehicle_id = OLD.vehicle_id AND assigned_to IS NULL;
    END IF;
  END IF;

  IF NEW.vehicle_id IS NOT NULL THEN
    INSERT INTO driver_vehicle_assignments (driver_id, vehicle_id, assigned_from)
    VALUES (NEW.id, NEW.vehicle_id, v_date);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS drivers_record_assignment ON public.drivers;
CREATE TRIGGER drivers_record_assignment
  AFTER INSERT OR UPDATE OF vehicle_id ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public._record_driver_assignment();

-- -----------------------------------------------------------------------------
-- 3. Reading the history with names
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER: the caller's row-level security applies.
CREATE OR REPLACE FUNCTION public.get_assignment_history(p_vehicle_id uuid DEFAULT NULL, p_driver_id uuid DEFAULT NULL)
RETURNS TABLE (
  driver_id uuid, driver_name text, vehicle_id uuid, vehicle_label text,
  assigned_from date, assigned_to date
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT a.driver_id, d.name, a.vehicle_id,
         v.make || ' ' || v.model || ' (' || v.plate_number || ')',
         a.assigned_from, a.assigned_to
  FROM driver_vehicle_assignments a
  LEFT JOIN drivers d ON d.id = a.driver_id
  LEFT JOIN vehicles v ON v.id = a.vehicle_id
  WHERE (p_vehicle_id IS NULL OR a.vehicle_id = p_vehicle_id)
    AND (p_driver_id IS NULL OR a.driver_id = p_driver_id)
  ORDER BY a.assigned_from DESC
$$;

REVOKE ALL ON FUNCTION public.get_assignment_history(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assignment_history(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. assign/unassign pass their effective date to the history trigger
--    (copied from 20260930000002 with one line added to each)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unassign_driver(p_driver_id uuid, p_effective_from date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from date := coalesce(p_effective_from, public.app_today());
  v_vehicle uuid;
BEGIN
  PERFORM public._require_admin();
  SELECT vehicle_id INTO v_vehicle FROM drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_vehicle IS NULL THEN
    RETURN;
  END IF;
  PERFORM public._assert_not_finalized(v_vehicle, v_from);
  PERFORM public._close_driver_compensation(p_driver_id, v_vehicle, v_from);
  -- The assignment-history trigger records the move on this date.
  PERFORM set_config('app.assignment_date', v_from::text, true);
  UPDATE drivers SET vehicle_id = NULL, updated_at = now() WHERE id = p_driver_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_driver(p_vehicle_id uuid, p_driver_id uuid, p_effective_from date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from date := coalesce(p_effective_from, public.app_today());
  v_other record;
  v_current uuid;
BEGIN
  PERFORM public._require_admin();

  PERFORM 1 FROM vehicles WHERE id = p_vehicle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found' USING ERRCODE = 'P0002';
  END IF;

  -- One driver per vehicle: everyone else on this vehicle is unassigned.
  FOR v_other IN
    SELECT id FROM drivers
    WHERE vehicle_id = p_vehicle_id AND id IS DISTINCT FROM p_driver_id
  LOOP
    PERFORM public.unassign_driver(v_other.id, v_from);
  END LOOP;

  IF p_driver_id IS NULL THEN
    RETURN;
  END IF;

  SELECT vehicle_id INTO v_current FROM drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_current IS NOT DISTINCT FROM p_vehicle_id THEN
    RETURN;
  END IF;
  IF v_current IS NOT NULL THEN
    PERFORM public.unassign_driver(p_driver_id, v_from);
  END IF;
  -- The assignment-history trigger records the move on this date.
  PERFORM set_config('app.assignment_date', v_from::text, true);
  UPDATE drivers SET vehicle_id = p_vehicle_id, updated_at = now() WHERE id = p_driver_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Entry rules: a driver may log on a vehicle they were assigned to on that
--    date, even without pay terms (copied from 20261004000001)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._check_entry_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
  v_old_date date;
  v_changed boolean;
  v_today date := public.app_today();
BEGIN
  IF TG_TABLE_NAME = 'rides' THEN
    v_date := NEW.ride_date;
  ELSE
    v_date := NEW.expense_date;

    -- Review fields decide which vehicle pays: admins only. Checked before the
    -- "nothing financial changed" shortcut below.
    IF NOT public.is_admin() AND public.my_driver_id() IS NOT NULL THEN
      IF TG_OP = 'INSERT' THEN
        IF NEW.review_status <> 'unreviewed' OR NEW.charged_vehicle_id IS NOT NULL THEN
          RAISE EXCEPTION 'Only the office can review expenses' USING ERRCODE = '42501';
        END IF;
      ELSIF (OLD.review_status, OLD.charged_vehicle_id, OLD.reviewed_by, OLD.reviewed_at)
            IS DISTINCT FROM (NEW.review_status, NEW.charged_vehicle_id, NEW.reviewed_by, NEW.reviewed_at) THEN
        RAISE EXCEPTION 'Only the office can review expenses' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'rides' THEN
      v_old_date := OLD.ride_date;
      v_changed := (OLD.amount, OLD.ride_date, OLD.vehicle_id, OLD.driver_id, OLD.payment_method)
        IS DISTINCT FROM (NEW.amount, NEW.ride_date, NEW.vehicle_id, NEW.driver_id, NEW.payment_method);
    ELSE
      v_old_date := OLD.expense_date;
      v_changed := (OLD.amount, OLD.expense_date, OLD.vehicle_id, OLD.driver_id, OLD.allocation,
                    OLD.payment_method, OLD.receipt_image_url, OLD.review_status, OLD.charged_vehicle_id)
        IS DISTINCT FROM (NEW.amount, NEW.expense_date, NEW.vehicle_id, NEW.driver_id, NEW.allocation,
                          NEW.payment_method, NEW.receipt_image_url, NEW.review_status, NEW.charged_vehicle_id);
    END IF;
    -- Non-financial changes (voucher collection, notes) are always allowed.
    IF NOT v_changed THEN
      RETURN NEW;
    END IF;
    PERFORM public._assert_entry_month_open(OLD.vehicle_id, v_old_date);
    IF TG_TABLE_NAME = 'expenses' THEN
      PERFORM public._assert_entry_month_open(OLD.charged_vehicle_id, v_old_date);
    END IF;
  END IF;

  PERFORM public._assert_entry_month_open(NEW.vehicle_id, v_date);
  IF TG_TABLE_NAME = 'expenses' THEN
    PERFORM public._assert_entry_month_open(NEW.charged_vehicle_id, v_date);
  END IF;

  -- Driver-only rules. Admins and server jobs (no driver identity) skip these.
  IF public.is_admin() OR NEW.driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RETURN NEW;
  END IF;

  IF v_date > v_today THEN
    RAISE EXCEPTION 'Entries cannot be dated in the future (% is after today, %).', v_date, v_today
      USING ERRCODE = '23514';
  END IF;
  IF v_date < v_today - 7 THEN
    RAISE EXCEPTION 'Entries older than 7 days (%) cannot be added from the app. Please send a correction request to the office.', v_date
      USING ERRCODE = '23514';
  END IF;

  IF NEW.vehicle_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM drivers WHERE id = NEW.driver_id AND vehicle_id = NEW.vehicle_id)
     AND NOT EXISTS (
       SELECT 1 FROM driver_vehicle_assignments
       WHERE driver_id = NEW.driver_id AND vehicle_id = NEW.vehicle_id
         AND assigned_from <= v_date AND (assigned_to IS NULL OR assigned_to > v_date)
     )
     AND NOT EXISTS (
       SELECT 1 FROM driver_compensation
       WHERE driver_id = NEW.driver_id AND vehicle_id = NEW.vehicle_id
         AND effective_from <= v_date AND (effective_to IS NULL OR effective_to > v_date)
     ) THEN
    RAISE EXCEPTION 'You are not assigned to this vehicle for %. Ask the office to check your vehicle assignment.', v_date
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'expenses' THEN
    IF TG_OP = 'INSERT' OR NEW.receipt_image_url IS DISTINCT FROM OLD.receipt_image_url THEN
      IF split_part(NEW.receipt_image_url, '/', 1) <> NEW.driver_id::text
         OR NOT EXISTS (
           SELECT 1 FROM storage.objects
           WHERE bucket_id = 'receipts' AND name = NEW.receipt_image_url
         ) THEN
        RAISE EXCEPTION 'The receipt photo was not found. Please take the photo again and resubmit.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
