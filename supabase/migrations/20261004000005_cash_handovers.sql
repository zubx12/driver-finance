-- =============================================================================
-- Phase 7B: cash handovers on the server (money-flow plan)
-- =============================================================================
-- Drivers pay most expenses from the cash they collect and hand the rest to
-- the office (owner decisions M2/M4). Handovers were stored only on drivers'
-- phones, so nobody could see how much cash a driver still holds.
--
-- Flow: the driver SUBMITS a handover from the app (offline-safe sync); the
-- office CONFIRMS it, or DISPUTES it with a note. Only confirmed handovers
-- will reduce the driver's cash in hand (driver monthly settlement, 7D).
-- The office can also record a handover directly.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cash_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- the phone's id, so re-sending never duplicates
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  vehicle_id uuid REFERENCES public.vehicles(id),  -- driver's vehicle at the time (information)
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  handover_date date NOT NULL,
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'bank_transfer')),
  handed_to text,
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'confirmed', 'disputed')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'submitted') = (reviewed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_cash_handovers_driver_date ON public.cash_handovers (driver_id, handover_date);
CREATE INDEX IF NOT EXISTS idx_cash_handovers_submitted ON public.cash_handovers (handover_date) WHERE status = 'submitted';

ALTER TABLE public.cash_handovers ENABLE ROW LEVEL SECURITY;

-- Prevents non-admins from confirming, editing or deleting handovers.
CREATE POLICY "admin_all" ON public.cash_handovers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- A driver can only submit their own, unreviewed handover.
CREATE POLICY "driver_insert_own" ON public.cash_handovers FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = (SELECT public.my_driver_id())
    AND status = 'submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL AND admin_note IS NULL
  );
CREATE POLICY "driver_read_own" ON public.cash_handovers FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));
-- No driver UPDATE/DELETE policy: once submitted, only the office can act on it.

-- Same date limits as rides and expenses for drivers (offline grace of 7 days).
CREATE OR REPLACE FUNCTION public._check_handover_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := public.app_today();
BEGIN
  IF public.is_admin() OR NEW.driver_id IS DISTINCT FROM public.my_driver_id() THEN
    RETURN NEW;
  END IF;
  IF NEW.handover_date > v_today THEN
    RAISE EXCEPTION 'A handover cannot be dated in the future (% is after today, %).', NEW.handover_date, v_today
      USING ERRCODE = '23514';
  END IF;
  IF NEW.handover_date < v_today - 7 THEN
    RAISE EXCEPTION 'Handovers older than 7 days (%) cannot be added from the app. Please ask the office to record it.', NEW.handover_date
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cash_handovers_rules
  BEFORE INSERT OR UPDATE ON public.cash_handovers
  FOR EACH ROW EXECUTE FUNCTION public._check_handover_rules();

CREATE TRIGGER cash_handovers_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_handovers
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_changes();

-- Office decision on a submitted (or previously disputed) handover.
CREATE OR REPLACE FUNCTION public.review_cash_handover(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM public._require_admin();
  IF p_decision IS NULL OR p_decision NOT IN ('confirmed', 'disputed') THEN
    RAISE EXCEPTION 'Decision must be confirmed or disputed' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'disputed' AND nullif(trim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Explain why the handover is disputed' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_status FROM cash_handovers WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Handover not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status = 'confirmed' THEN
    RAISE EXCEPTION 'This handover is already confirmed' USING ERRCODE = '22023';
  END IF;

  UPDATE cash_handovers SET
    status = p_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    admin_note = nullif(trim(coalesce(p_note, '')), '')
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_cash_handover(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_cash_handover(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public._check_handover_rules() FROM PUBLIC, anon, authenticated;
