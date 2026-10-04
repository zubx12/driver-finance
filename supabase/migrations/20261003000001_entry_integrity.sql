-- =============================================================================
-- Phase 3 remediation: rules for creating and changing rides/expenses
-- =============================================================================
-- Fixes H6 (back-dating into paid months, logging against any vehicle) and
-- M6 (receipt column accepted any string).
--
-- For everyone (drivers, admins, server jobs):
--   * an entry cannot be added to, moved into, or changed inside a month whose
--     payout is FINALIZED for that vehicle. Corrections there are recorded as
--     adjustments (Phase 4), never by rewriting paid history. Updates that do
--     not touch money (e.g. marking a voucher collected) are still allowed.
-- For drivers only:
--   * no future dates, and at most 7 days back (grace for offline sync);
--     older entries go through a correction request;
--   * only the vehicle they are assigned to, or one they had pay terms on for
--     that date (so entries made offline before a reassignment still sync);
--   * an expense's receipt must be a photo they uploaded to their own folder.
-- Violations raise SQLSTATE 23514 so the app can treat them as permanent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._assert_entry_month_open(p_vehicle_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period date;
BEGIN
  IF p_vehicle_id IS NULL OR p_date IS NULL THEN
    RETURN;
  END IF;
  SELECT period_start INTO v_period
  FROM salary_calculations
  WHERE vehicle_id = p_vehicle_id
    AND status = 'finalized'
    AND p_date BETWEEN period_start AND period_end
  LIMIT 1;
  IF v_period IS NOT NULL THEN
    RAISE EXCEPTION 'The % payout for this vehicle is already finalized, so entries dated % cannot be added or changed. Ask an admin to record an adjustment.',
      to_char(v_period, 'FMMonth YYYY'), p_date
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_entry_month_open(uuid, date) FROM PUBLIC, anon, authenticated;

-- SECURITY DEFINER: drivers cannot read salary_calculations or storage.objects
-- themselves; the identity checks still use the caller's JWT.
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
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'rides' THEN
      v_old_date := OLD.ride_date;
      v_changed := (OLD.amount, OLD.ride_date, OLD.vehicle_id, OLD.driver_id, OLD.payment_method)
        IS DISTINCT FROM (NEW.amount, NEW.ride_date, NEW.vehicle_id, NEW.driver_id, NEW.payment_method);
    ELSE
      v_old_date := OLD.expense_date;
      v_changed := (OLD.amount, OLD.expense_date, OLD.vehicle_id, OLD.driver_id, OLD.allocation, OLD.payment_method, OLD.receipt_image_url)
        IS DISTINCT FROM (NEW.amount, NEW.expense_date, NEW.vehicle_id, NEW.driver_id, NEW.allocation, NEW.payment_method, NEW.receipt_image_url);
    END IF;
    -- Non-financial changes (voucher collection, notes) are always allowed.
    IF NOT v_changed THEN
      RETURN NEW;
    END IF;
    PERFORM public._assert_entry_month_open(OLD.vehicle_id, v_old_date);
  END IF;

  PERFORM public._assert_entry_month_open(NEW.vehicle_id, v_date);

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

DROP TRIGGER IF EXISTS rides_entry_rules ON public.rides;
CREATE TRIGGER rides_entry_rules
  BEFORE INSERT OR UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public._check_entry_rules();

DROP TRIGGER IF EXISTS expenses_entry_rules ON public.expenses;
CREATE TRIGGER expenses_entry_rules
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public._check_entry_rules();

-- A receipt is a storage path ({driver_id}/{date}/{file}); rejects '' or junk.
-- NOT VALID: applies to new and changed rows; existing rows are left as-is.
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_receipt_path_format
  CHECK (receipt_image_url ~ '^[0-9a-f-]{36}/[0-9]{4}-[0-9]{2}-[0-9]{2}/[^/]+$') NOT VALID;
