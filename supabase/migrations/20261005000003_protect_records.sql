-- =============================================================================
-- L0: money records are never deleted with their driver, vehicle or partner
-- =============================================================================
-- Owner rule (2026-10-05): when a driver leaves, nothing about their payments
-- is deleted. The schema deletes child rows automatically (ON DELETE CASCADE)
-- when a driver, vehicle or partner row is deleted, so one DELETE would remove
-- their rides, expenses, pay records and ownership history.
--
-- This refuses to delete a driver, vehicle or partner that has any money
-- record, for every caller (app, admin, SQL editor). Mark them Left / Inactive
-- instead. A record created by mistake, with no money records, can still be
-- deleted.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._guard_record_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_found text;
BEGIN
  IF TG_TABLE_NAME = 'drivers' THEN
    SELECT what INTO v_found FROM (
      SELECT 'rides' AS what WHERE EXISTS (SELECT 1 FROM rides WHERE driver_id = OLD.id)
      UNION ALL SELECT 'expenses' WHERE EXISTS (SELECT 1 FROM expenses WHERE driver_id = OLD.id)
      UNION ALL SELECT 'cash handovers' WHERE EXISTS (SELECT 1 FROM cash_handovers WHERE driver_id = OLD.id)
      UNION ALL SELECT 'monthly settlements' WHERE EXISTS (SELECT 1 FROM driver_settlements WHERE driver_id = OLD.id)
      UNION ALL SELECT 'pay records' WHERE EXISTS (SELECT 1 FROM driver_pay_calculations WHERE driver_id = OLD.id)
    ) x LIMIT 1;
    IF v_found IS NOT NULL THEN
      RAISE EXCEPTION 'This driver has % and cannot be deleted. Mark the driver as Left instead; every record is kept.', v_found
        USING ERRCODE = '23503';
    END IF;

  ELSIF TG_TABLE_NAME = 'vehicles' THEN
    SELECT what INTO v_found FROM (
      SELECT 'rides' AS what WHERE EXISTS (SELECT 1 FROM rides WHERE vehicle_id = OLD.id)
      UNION ALL SELECT 'expenses' WHERE EXISTS (SELECT 1 FROM expenses WHERE vehicle_id = OLD.id OR charged_vehicle_id = OLD.id)
      UNION ALL SELECT 'payouts' WHERE EXISTS (SELECT 1 FROM salary_calculations WHERE vehicle_id = OLD.id)
      UNION ALL SELECT 'adjustments' WHERE EXISTS (SELECT 1 FROM salary_adjustments WHERE vehicle_id = OLD.id)
    ) x LIMIT 1;
    IF v_found IS NOT NULL THEN
      RAISE EXCEPTION 'This vehicle has % and cannot be deleted. Set it to Inactive instead; every record is kept.', v_found
        USING ERRCODE = '23503';
    END IF;

  ELSIF TG_TABLE_NAME = 'partners' THEN
    SELECT what INTO v_found FROM (
      SELECT 'payout shares' AS what WHERE EXISTS (SELECT 1 FROM salary_calculation_shares WHERE partner_id = OLD.id)
      UNION ALL SELECT 'payments' WHERE EXISTS (SELECT 1 FROM settlements WHERE partner_id = OLD.id)
      UNION ALL SELECT 'vouchers' WHERE EXISTS (SELECT 1 FROM partner_voucher_shares WHERE partner_id = OLD.id)
    ) x LIMIT 1;
    IF v_found IS NOT NULL THEN
      RAISE EXCEPTION 'This partner has % and cannot be deleted. Set the partner to Inactive instead; every record is kept.', v_found
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public._guard_record_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS drivers_protect_records ON public.drivers;
CREATE TRIGGER drivers_protect_records
  BEFORE DELETE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public._guard_record_delete();

DROP TRIGGER IF EXISTS vehicles_protect_records ON public.vehicles;
CREATE TRIGGER vehicles_protect_records
  BEFORE DELETE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public._guard_record_delete();

DROP TRIGGER IF EXISTS partners_protect_records ON public.partners;
CREATE TRIGGER partners_protect_records
  BEFORE DELETE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public._guard_record_delete();
