-- =============================================================================
-- N3: what is waiting for the office, in one call (docs/admin-navigation-plan.md)
-- =============================================================================
-- Shown as counts on the sidebar (Inbox, Vouchers) and on their tabs, so the
-- office sees where work is waiting without opening every page.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_nav_counts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_handovers int;
  v_expenses int;
  v_corrections int;
  v_vouchers int;
  v_owed int;
BEGIN
  PERFORM public._require_admin();

  SELECT count(*) INTO v_handovers FROM cash_handovers WHERE status = 'submitted';
  -- Driver / company expenses the office has not decided on (company cost or charged to a vehicle).
  SELECT count(*) INTO v_expenses FROM expenses WHERE allocation <> 'Vehicle' AND review_status = 'unreviewed';
  SELECT count(*) INTO v_corrections FROM correction_requests WHERE status = 'pending';
  SELECT count(*) INTO v_vouchers FROM rides WHERE payment_method = 'Voucher' AND payment_status = 'Outstanding';
  -- Voucher parts collected by someone else, still owed to partners (7E).
  SELECT count(*) INTO v_owed FROM public.get_partner_vouchers() g WHERE g.holder_status = 'owed_to_you';

  RETURN jsonb_build_object(
    'inbox', v_handovers + v_expenses + v_corrections,
    'handovers', v_handovers,
    'expenses', v_expenses,
    'corrections', v_corrections,
    'vouchers_outstanding', v_vouchers,
    'vouchers_owed_to_partners', v_owed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_nav_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_nav_counts() TO authenticated;
