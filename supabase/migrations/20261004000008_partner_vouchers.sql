-- =============================================================================
-- Phase 7E: uncollected vouchers handed to partners (money-flow plan §3, M2)
-- =============================================================================
-- Voucher rides count as revenue in their month, so they are part of each
-- partner's share even while the money is still outstanding. When the office
-- pays a partner's share, the vouchers of that vehicle-month that are still
-- uncollected are HANDED to the partner instead of cash:
--
--     cash paid    = share − the partner's part of the uncollected vouchers
--     voucher part = each uncollected voucher × the partner's percentage
--
-- With two or more partners (owner, option a) every voucher stays shared by the
-- month's percentages, so each partner holds their part of every voucher.
-- When a voucher is collected later, the record shows who collected it; if the
-- money reached someone other than the partner (driver, office, another
-- partner), the office owes the partner their part until it is paid out.
--
-- If a partner's part of the vouchers is larger than their share (e.g. a month
-- with heavy expenses), the office keeps the vouchers and pays the share in cash.
-- Shares are paid only through pay_partner_settlement() from now on.
-- =============================================================================

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS cash_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS voucher_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('cash', 'bank_transfer')),
  ADD COLUMN IF NOT EXISTS vouchers_kept_by_office boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id);

-- Already-paid shares were paid fully in cash.
UPDATE public.settlements SET cash_amount = amount, voucher_amount = 0
WHERE status = 'paid' AND cash_amount IS NULL;

ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_paid_split
  CHECK (status <> 'paid' OR (cash_amount >= 0 AND voucher_amount >= 0 AND cash_amount + voucher_amount = amount));

-- Each partner's part of each handed voucher.
CREATE TABLE IF NOT EXISTS public.partner_voucher_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.settlements(id),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  ride_id uuid NOT NULL REFERENCES public.rides(id),
  percentage numeric(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  ride_amount numeric(12,2) NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),   -- the partner's part
  -- Set when the office pays the partner a part that someone else collected.
  paid_out_at timestamptz,
  paid_out_method text CHECK (paid_out_method IN ('cash', 'bank_transfer')),
  paid_out_reference text,
  paid_out_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, partner_id),
  CHECK ((paid_out_at IS NULL) = (paid_out_method IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_partner_voucher_shares_partner ON public.partner_voucher_shares (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_voucher_shares_settlement ON public.partner_voucher_shares (settlement_id);

ALTER TABLE public.partner_voucher_shares ENABLE ROW LEVEL SECURITY;
-- Written only through the functions below.
CREATE POLICY "admin_read" ON public.partner_voucher_shares FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "partner_read_own" ON public.partner_voucher_shares FOR SELECT TO authenticated
  USING (partner_id = (SELECT public.my_partner_id()));

CREATE TRIGGER partner_voucher_shares_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_voucher_shares
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_changes();

-- -----------------------------------------------------------------------------
-- A share can be marked paid only by pay_partner_settlement()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._guard_settlement_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'paid' AND (NEW.status, NEW.amount, NEW.cash_amount, NEW.voucher_amount, NEW.paid_at)
       IS DISTINCT FROM (OLD.status, OLD.amount, OLD.cash_amount, OLD.voucher_amount, OLD.paid_at) THEN
    RAISE EXCEPTION 'A paid partner share cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'paid' AND OLD.status <> 'paid'
     AND coalesce(current_setting('app.paying_settlement', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'Use pay_partner_settlement() to pay a partner share' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._guard_settlement_payment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS settlements_payment_guard ON public.settlements;
CREATE TRIGGER settlements_payment_guard
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public._guard_settlement_payment();

-- -----------------------------------------------------------------------------
-- What paying a share would hand over (preview for the office)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._settlement_vouchers(p_settlement_id uuid)
RETURNS TABLE (
  ride_id uuid, ride_date date, payer text, reference text,
  ride_amount numeric, percentage numeric, amount numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.ride_date, py.name, r.reference, r.amount, scs.ownership_percentage,
         round(r.amount * scs.ownership_percentage / 100, 2)
  FROM settlements s
  JOIN salary_calculation_shares scs ON scs.id = s.share_id
  JOIN salary_calculations sc ON sc.id = scs.calculation_id
  JOIN rides r ON r.vehicle_id = sc.vehicle_id
             AND r.ride_date BETWEEN sc.period_start AND sc.period_end
  LEFT JOIN payers py ON py.id = r.payer_id
  WHERE s.id = p_settlement_id
    AND r.payment_method = 'Voucher'
    AND r.payment_status = 'Outstanding'
    AND scs.ownership_percentage > 0
    AND round(r.amount * scs.ownership_percentage / 100, 2) > 0
  ORDER BY r.ride_date, r.id
$$;

REVOKE ALL ON FUNCTION public._settlement_vouchers(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_partner_settlement(p_settlement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount numeric(12,2);
  v_status text;
  v_vouchers jsonb;
  v_voucher_total numeric(12,2);
BEGIN
  PERFORM public._require_admin();
  SELECT amount, status INTO v_amount, v_status FROM settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner share not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb), coalesce(sum(v.amount), 0)
    INTO v_vouchers, v_voucher_total
  FROM public._settlement_vouchers(p_settlement_id) v;

  RETURN jsonb_build_object(
    'settlement_id', p_settlement_id,
    'status', v_status,
    'amount', v_amount,
    'voucher_amount', v_voucher_total,
    'cash_amount', v_amount - v_voucher_total,
    -- The office keeps the vouchers when they are worth more than the share.
    'vouchers_exceed_share', v_voucher_total > v_amount,
    'vouchers', v_vouchers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_partner_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_partner_settlement(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Pay a partner share: cash part + vouchers handed over
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_partner_settlement(
  p_settlement_id uuid,
  p_method text,
  p_reference text,
  p_notes text DEFAULT NULL,
  p_keep_vouchers boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s settlements%ROWTYPE;
  v_calc_status text;
  v_voucher_total numeric(12,2);
  v_keep boolean := coalesce(p_keep_vouchers, false);
BEGIN
  PERFORM public._require_admin();
  IF p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'Choose how it was paid (cash or bank transfer)' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(coalesce(p_reference, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A payment reference is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO s FROM settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner share not found' USING ERRCODE = 'P0002';
  END IF;
  IF s.status <> 'pending' THEN
    RAISE EXCEPTION 'This share is not pending (already paid or void)' USING ERRCODE = '22023';
  END IF;
  SELECT sc.status INTO v_calc_status
  FROM salary_calculation_shares scs JOIN salary_calculations sc ON sc.id = scs.calculation_id
  WHERE scs.id = s.share_id;
  IF v_calc_status IS DISTINCT FROM 'finalized' THEN
    RAISE EXCEPTION 'The payout for this month is not finalized' USING ERRCODE = '55000';
  END IF;

  -- Lock the vouchers so none is collected while being handed over.
  PERFORM 1 FROM rides WHERE id IN (SELECT v.ride_id FROM public._settlement_vouchers(p_settlement_id) v) FOR UPDATE;

  SELECT coalesce(sum(v.amount), 0) INTO v_voucher_total FROM public._settlement_vouchers(p_settlement_id) v;
  IF v_voucher_total > s.amount AND NOT v_keep THEN
    RAISE EXCEPTION 'The partner''s part of the uncollected vouchers (%) is more than the share (%). Pay the share in cash and keep the vouchers at the office.',
      v_voucher_total, s.amount
      USING ERRCODE = '55000';
  END IF;
  IF v_keep THEN
    v_voucher_total := 0;
  ELSE
    INSERT INTO partner_voucher_shares (settlement_id, partner_id, ride_id, percentage, ride_amount, amount)
    SELECT p_settlement_id, s.partner_id, v.ride_id, v.percentage, v.ride_amount, v.amount
    FROM public._settlement_vouchers(p_settlement_id) v;
  END IF;

  PERFORM set_config('app.paying_settlement', p_settlement_id::text, true);
  UPDATE settlements SET
    status = 'paid',
    paid_at = now(),
    paid_by = auth.uid(),
    payment_method = p_method,
    payment_reference = trim(p_reference),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    cash_amount = amount - v_voucher_total,
    voucher_amount = v_voucher_total,
    vouchers_kept_by_office = v_keep
  WHERE id = p_settlement_id;
  PERFORM set_config('app.paying_settlement', '', true);

  RETURN jsonb_build_object('settlement_id', p_settlement_id,
    'cash_amount', s.amount - v_voucher_total, 'voucher_amount', v_voucher_total);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_partner_settlement(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_partner_settlement(uuid, text, text, text, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- Handed vouchers and where each one stands
-- -----------------------------------------------------------------------------
-- holder status for the partner:
--   with_you          still outstanding: the partner collects it
--   collected_by_you  the partner collected it
--   owed_to_you       someone else collected it; the office owes the partner's part
--   paid_to_you       the office paid that part out
--   cancelled         the voucher was cancelled or disputed
CREATE OR REPLACE FUNCTION public.get_partner_vouchers(p_partner_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, partner_id uuid, partner_name text, settlement_id uuid, ride_id uuid,
  vehicle text, ride_date date, payer text, reference text,
  ride_amount numeric, percentage numeric, amount numeric,
  ride_status text, collected_by_name text, collected_by_role text, collected_at timestamptz,
  holder_status text, paid_out_at timestamptz, paid_out_reference text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner uuid;
BEGIN
  IF public.is_admin() THEN
    v_partner := p_partner_id;      -- NULL: every partner
  ELSE
    v_partner := public.my_partner_id();
    IF v_partner IS NULL OR (p_partner_id IS NOT NULL AND p_partner_id <> v_partner) THEN
      RAISE EXCEPTION 'You can only see your own vouchers' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT pvs.id, pvs.partner_id, p.name, pvs.settlement_id, pvs.ride_id,
         v.plate_number, r.ride_date, py.name, r.reference,
         pvs.ride_amount, pvs.percentage, pvs.amount,
         r.payment_status, r.collected_by_name, r.collected_by_role, r.collected_at,
         CASE
           WHEN r.payment_status IN ('Cancelled', 'Disputed') THEN 'cancelled'
           WHEN r.payment_status = 'Outstanding' THEN 'with_you'
           WHEN r.collected_by_role = 'partner' AND r.collected_by = p.linked_auth_id THEN 'collected_by_you'
           WHEN pvs.paid_out_at IS NOT NULL THEN 'paid_to_you'
           ELSE 'owed_to_you'
         END,
         pvs.paid_out_at, pvs.paid_out_reference
  FROM partner_voucher_shares pvs
  JOIN partners p ON p.id = pvs.partner_id
  JOIN rides r ON r.id = pvs.ride_id
  JOIN vehicles v ON v.id = r.vehicle_id
  LEFT JOIN payers py ON py.id = r.payer_id
  WHERE v_partner IS NULL OR pvs.partner_id = v_partner
  ORDER BY r.ride_date DESC, p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_vouchers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_vouchers(uuid) TO authenticated;

-- The office pays a partner their part of a voucher someone else collected.
CREATE OR REPLACE FUNCTION public.pay_out_voucher_share(p_id uuid, p_method text, p_reference text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM public._require_admin();
  IF p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'Choose how it was paid (cash or bank transfer)' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM partner_voucher_shares WHERE id = p_id FOR UPDATE;
  SELECT holder_status INTO v_status FROM public.get_partner_vouchers() g WHERE g.id = p_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Voucher share not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'owed_to_you' THEN
    RAISE EXCEPTION 'Only a voucher collected by someone else can be paid out to the partner (status: %)', v_status
      USING ERRCODE = '22023';
  END IF;
  UPDATE partner_voucher_shares SET
    paid_out_at = now(), paid_out_method = p_method,
    paid_out_reference = nullif(trim(coalesce(p_reference, '')), ''), paid_out_by = auth.uid()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_out_voucher_share(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_out_voucher_share(uuid, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- A partner holding a handed voucher can mark it collected, even after they
-- stopped owning the vehicle. Otherwise unchanged from 20260930000001.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.collect_voucher(p_ride_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ride public.rides%ROWTYPE;
  v_role text;
  v_name text;
BEGIN
  SELECT * INTO v_ride FROM rides WHERE id = p_ride_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ride.payment_method <> 'Voucher' OR v_ride.payment_status <> 'Outstanding' THEN
    RAISE EXCEPTION 'Only outstanding voucher rides can be marked as collected'
      USING ERRCODE = '22023';
  END IF;

  IF public.is_admin() THEN
    v_role := 'admin';
    v_name := coalesce(auth.jwt() -> 'user_metadata' ->> 'name', 'Admin');
  ELSIF v_ride.driver_id = public.my_driver_id() THEN
    v_role := 'driver';
    SELECT name INTO v_name FROM drivers WHERE id = v_ride.driver_id;
  ELSIF v_ride.vehicle_id IN (SELECT public.my_partner_vehicle_ids())
     OR EXISTS (SELECT 1 FROM partner_voucher_shares
                WHERE ride_id = p_ride_id AND partner_id = public.my_partner_id()) THEN
    v_role := 'partner';
    SELECT name INTO v_name FROM partners WHERE id = public.my_partner_id();
  ELSE
    RAISE EXCEPTION 'You are not allowed to collect this voucher' USING ERRCODE = '42501';
  END IF;

  UPDATE rides
  SET payment_status = 'Collected',
      collected_by = auth.uid(),
      collected_by_name = v_name,
      collected_by_role = v_role,
      collected_at = now(),
      updated_at = now()
  WHERE id = p_ride_id;
END;
$$;

REVOKE ALL ON FUNCTION public.collect_voucher(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_voucher(uuid) TO authenticated;

-- The partner screens show the cash / voucher split.
DROP VIEW IF EXISTS public.partner_settlement_view;
CREATE VIEW public.partner_settlement_view
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.partner_id,
  p.name AS partner_name,
  s.amount,
  s.status,
  s.paid_at,
  s.payment_reference,
  s.notes,
  sc.period_start,
  sc.period_end,
  v.make || ' ' || v.model AS vehicle_name,
  v.plate_number,
  scs.ownership_percentage,
  s.cash_amount,
  s.voucher_amount,
  s.payment_method,
  s.vouchers_kept_by_office
FROM settlements s
JOIN partners p ON p.id = s.partner_id
JOIN salary_calculation_shares scs ON scs.id = s.share_id
JOIN salary_calculations sc ON sc.id = scs.calculation_id
JOIN vehicles v ON v.id = sc.vehicle_id
WHERE s.status <> 'void';
