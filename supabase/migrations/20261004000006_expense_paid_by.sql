-- =============================================================================
-- Phase 7C: who paid each expense (money-flow plan)
-- =============================================================================
-- The payment method does not say whose money it was: "Card" can be the
-- company card or the driver's own card. Who paid decides the driver's
-- monthly settlement (7D):
--   driver   paid from the cash in hand, or from the driver's own pocket/card:
--            reduces what the driver owes the office
--   company  company card or company bank transfer: no effect on the driver
--   office   the office paid directly (e.g. cash at the office): no effect
-- Vehicle payouts are unchanged: every expense still reduces the balance to share.
-- =============================================================================

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid_by text;

UPDATE public.expenses
SET paid_by = CASE WHEN payment_method = 'Cash' THEN 'driver' ELSE 'company' END
WHERE paid_by IS NULL;

ALTER TABLE public.expenses
  ALTER COLUMN paid_by SET NOT NULL,
  ADD CONSTRAINT expenses_paid_by_values CHECK (paid_by IN ('driver', 'company', 'office'));

-- Older app versions do not send paid_by: derive it from the payment method.
CREATE OR REPLACE FUNCTION public._default_expense_paid_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.paid_by IS NULL THEN
    NEW.paid_by := CASE WHEN NEW.payment_method = 'Cash' THEN 'driver' ELSE 'company' END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._default_expense_paid_by() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS expenses_paid_by_default ON public.expenses;
CREATE TRIGGER expenses_paid_by_default
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public._default_expense_paid_by();

CREATE INDEX IF NOT EXISTS idx_expenses_driver_paid
  ON public.expenses (driver_id, expense_date)
  WHERE paid_by = 'driver';
