-- =============================================================================
-- Phase 1 remediation: role source moved to app_metadata + full policy rebuild
-- =============================================================================
-- WHY
--   Every admin policy used auth.jwt()->'user_metadata'->>'role'. user_metadata
--   is writable by the signed-in user themselves (supabase.auth.updateUser), so
--   any driver or partner could grant themselves admin. app_metadata can only be
--   written with the service-role key, so it is the only safe place for a role.
--
-- ALSO FIXED HERE (same policies, no extra business decisions needed)
--   * C2: the two "collect voucher" UPDATE policies only checked the NEW
--     payment_status, so a driver/partner could rewrite amount/date/vehicle of
--     any past outstanding voucher ride. They are replaced by the
--     collect_voucher() function, which can only touch the collection columns.
--   * Policy recursion: drivers <-> expenses policies referenced each other.
--     Ownership lookups now go through SECURITY DEFINER helpers.
--   * Same-day edit lock now uses the Riyadh calendar day, not the UTC day.
--   * Policies are now TO authenticated (several previously applied to anon).
--   * audit_log is read-only for admins (inserts happen only via the trigger).
--
-- DEPLOY ORDER (see scripts/backfill-app-roles.mjs)
--   1. Run the backfill script with --apply BEFORE this migration.
--   2. Apply this migration and deploy the app code in the same release.
--   3. Sign all users out; tokens issued before step 1 carry no app role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper functions
-- -----------------------------------------------------------------------------

-- The only trusted role source. Returns NULL when no role has been assigned.
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role'
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(public.app_role() = 'admin', false)
$$;

-- Business "today" for a Saudi operation; the database clock runs in UTC.
CREATE OR REPLACE FUNCTION public.app_today()
RETURNS date
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Riyadh')::date
$$;

-- SECURITY DEFINER so that policies calling these do not re-enter RLS on
-- drivers/partners (which caused cross-table policy recursion).
CREATE OR REPLACE FUNCTION public.my_driver_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM drivers WHERE linked_auth_id = auth.uid() ORDER BY created_at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_partner_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM partners WHERE linked_auth_id = auth.uid() ORDER BY created_at LIMIT 1
$$;

-- Vehicles the calling partner is linked to. By default only current links;
-- p_include_past = true also returns vehicles they were removed from.
CREATE OR REPLACE FUNCTION public.my_partner_vehicle_ids(p_include_past boolean DEFAULT false)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT vp.vehicle_id
  FROM vehicle_partners vp
  JOIN partners p ON p.id = vp.partner_id
  WHERE p.linked_auth_id = auth.uid()
    AND (p_include_past OR vp.effective_to IS NULL OR vp.effective_to > public.app_today())
$$;

-- Drivers a partner may see by name: assigned to, or with entries on, one of
-- the partner's current vehicles.
CREATE OR REPLACE FUNCTION public.partner_visible_driver_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.id FROM drivers d
  WHERE d.vehicle_id IN (SELECT public.my_partner_vehicle_ids())
  UNION
  SELECT r.driver_id FROM rides r
  WHERE r.vehicle_id IN (SELECT public.my_partner_vehicle_ids())
  UNION
  SELECT e.driver_id FROM expenses e
  WHERE e.vehicle_id IN (SELECT public.my_partner_vehicle_ids())
$$;

REVOKE ALL ON FUNCTION public.my_driver_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_partner_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_partner_vehicle_ids(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.partner_visible_driver_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_driver_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_partner_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_partner_vehicle_ids(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_visible_driver_ids() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Drop every existing policy on application tables
--    (dynamic, so policies created by hand in the dashboard are removed too)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'drivers', 'partners', 'vehicles', 'vehicle_partners', 'rides', 'expenses',
        'daily_summary', 'audit_log', 'salary_calculations', 'salary_calculation_shares',
        'driver_compensation', 'driver_pay_calculations', 'settlements',
        'correction_requests', 'payers'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "Drivers can upload receipts to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can read own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admin can read all receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete receipts" ON storage.objects;

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_calculation_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_pay_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Admin: full access, identified ONLY by app_metadata.role
-- -----------------------------------------------------------------------------
-- Prevents non-admins (including users who edit their own user_metadata) from
-- reading or changing company-wide data.
CREATE POLICY "admin_all" ON public.drivers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.partners FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.vehicles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.vehicle_partners FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.rides FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.expenses FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.daily_summary FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.salary_calculations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.salary_calculation_shares FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.driver_compensation FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.driver_pay_calculations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.settlements FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.correction_requests FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_all" ON public.payers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Prevents anyone (admins included) from editing or deleting audit history.
-- Rows are written only by the SECURITY DEFINER audit trigger.
CREATE POLICY "admin_read" ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. Driver policies (ownership via linked_auth_id)
-- -----------------------------------------------------------------------------
-- Prevents a driver from reading another driver's profile.
CREATE POLICY "driver_read_own" ON public.drivers FOR SELECT TO authenticated
  USING (linked_auth_id = auth.uid());

-- Drivers pick from active vehicles; partners/anon no longer see the whole fleet.
CREATE POLICY "driver_read_active" ON public.vehicles FOR SELECT TO authenticated
  USING (status = 'Active' AND (SELECT public.my_driver_id()) IS NOT NULL);

-- Prevents a driver from creating entries in another driver's name.
CREATE POLICY "driver_insert_own" ON public.rides FOR INSERT TO authenticated
  WITH CHECK (driver_id = (SELECT public.my_driver_id()));
CREATE POLICY "driver_read_own" ON public.rides FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));
-- Same-day lock: a driver can only change rows dated today (Riyadh) and cannot
-- move a row to another day.
CREATE POLICY "driver_update_same_day" ON public.rides FOR UPDATE TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()) AND ride_date = public.app_today())
  WITH CHECK (driver_id = (SELECT public.my_driver_id()) AND ride_date = public.app_today());

CREATE POLICY "driver_insert_own" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (driver_id = (SELECT public.my_driver_id()));
CREATE POLICY "driver_read_own" ON public.expenses FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));
CREATE POLICY "driver_update_same_day" ON public.expenses FOR UPDATE TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()) AND expense_date = public.app_today())
  WITH CHECK (driver_id = (SELECT public.my_driver_id()) AND expense_date = public.app_today());
-- No DELETE policy for drivers: past data cannot be removed by a driver.

CREATE POLICY "driver_read_own" ON public.daily_summary FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));
CREATE POLICY "driver_read_own" ON public.driver_compensation FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));
CREATE POLICY "driver_read_own" ON public.driver_pay_calculations FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));

CREATE POLICY "driver_insert_own" ON public.correction_requests FOR INSERT TO authenticated
  WITH CHECK (driver_id = (SELECT public.my_driver_id()));
CREATE POLICY "driver_read_own" ON public.correction_requests FOR SELECT TO authenticated
  USING (driver_id = (SELECT public.my_driver_id()));

-- Drivers choose the paying organisation when logging a voucher ride.
CREATE POLICY "driver_read" ON public.payers FOR SELECT TO authenticated
  USING ((SELECT public.my_driver_id()) IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 5. Partner policies (read-only, scoped through vehicle_partners)
-- -----------------------------------------------------------------------------
-- Prevents a partner from reading another partner's profile.
CREATE POLICY "partner_read_own" ON public.partners FOR SELECT TO authenticated
  USING (linked_auth_id = auth.uid());

-- Only their own ownership rows: other partners' percentages stay hidden.
CREATE POLICY "partner_read_own" ON public.vehicle_partners FOR SELECT TO authenticated
  USING (partner_id = (SELECT public.my_partner_id()));

-- Prevents a partner from seeing vehicles they are not (or no longer) linked to.
CREATE POLICY "partner_read_linked" ON public.vehicles FOR SELECT TO authenticated
  USING (id IN (SELECT public.my_partner_vehicle_ids()));
CREATE POLICY "partner_read_linked" ON public.rides FOR SELECT TO authenticated
  USING (vehicle_id IN (SELECT public.my_partner_vehicle_ids()));
CREATE POLICY "partner_read_linked" ON public.expenses FOR SELECT TO authenticated
  USING (vehicle_id IN (SELECT public.my_partner_vehicle_ids()));
CREATE POLICY "partner_read_linked" ON public.drivers FOR SELECT TO authenticated
  USING (id IN (SELECT public.partner_visible_driver_ids()));

-- Rollups and calculations keep their previous scope (any vehicle ever linked).
-- Tightening this to the partner's linked date range is Phase 5 (M3).
CREATE POLICY "partner_read_linked" ON public.daily_summary FOR SELECT TO authenticated
  USING (vehicle_id IN (SELECT public.my_partner_vehicle_ids(true)));
CREATE POLICY "partner_read_linked" ON public.salary_calculations FOR SELECT TO authenticated
  USING (vehicle_id IN (SELECT public.my_partner_vehicle_ids(true)));

CREATE POLICY "partner_read_own" ON public.salary_calculation_shares FOR SELECT TO authenticated
  USING (partner_id = (SELECT public.my_partner_id()));
CREATE POLICY "partner_read_own" ON public.settlements FOR SELECT TO authenticated
  USING (partner_id = (SELECT public.my_partner_id()));

-- -----------------------------------------------------------------------------
-- 6. Storage: private receipts bucket
-- -----------------------------------------------------------------------------
-- Path convention: {driver_id}/{date}/{uuid}.jpg
-- Prevents a driver from writing into, or reading, another driver's folder.
CREATE POLICY "Drivers can upload receipts to own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (SELECT public.my_driver_id())::text
  );
CREATE POLICY "Drivers can read own receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (SELECT public.my_driver_id())::text
  );
CREATE POLICY "Admin can read all receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND public.is_admin());
CREATE POLICY "Admin can delete receipts" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND public.is_admin());

-- -----------------------------------------------------------------------------
-- 7. Voucher collection (replaces the two UPDATE policies removed above)
-- -----------------------------------------------------------------------------
-- Only the collection columns can change, only Outstanding -> Collected, and
-- only by the ride's driver, a partner currently linked to the vehicle, or an
-- admin. The rides audit trigger records the change.
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
  ELSIF v_ride.vehicle_id IN (SELECT public.my_partner_vehicle_ids()) THEN
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
