-- ─────────────────────────────────────────────────────────────────────────────
-- Correction Requests Table
-- Allows drivers to flag locked past entries for admin review.
-- Admin can approve (edit), reject (with note), or ignore.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.correction_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  record_type  TEXT        NOT NULL CHECK (record_type IN ('ride', 'expense')),
  record_id    UUID        NOT NULL,
  reason       TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID        REFERENCES auth.users(id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_correction_requests_driver  ON public.correction_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_correction_requests_status  ON public.correction_requests(status);
CREATE INDEX IF NOT EXISTS idx_correction_requests_created ON public.correction_requests(created_at DESC);

-- ─── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;

-- Drivers: can INSERT their own requests and SELECT their own requests
DROP POLICY IF EXISTS "driver_insert_own_corrections" ON public.correction_requests;
CREATE POLICY "driver_insert_own_corrections" ON public.correction_requests
  FOR INSERT
  WITH CHECK (
    driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "driver_view_own_corrections" ON public.correction_requests;
CREATE POLICY "driver_view_own_corrections" ON public.correction_requests
  FOR SELECT
  USING (
    driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
  );

-- Admin: full access on all correction requests
DROP POLICY IF EXISTS "admin_all_corrections" ON public.correction_requests;
CREATE POLICY "admin_all_corrections" ON public.correction_requests
  FOR ALL
  USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- ─── Enable Realtime (must be after CREATE TABLE) ────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.correction_requests;
