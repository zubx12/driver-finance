-- ── salary_calculation_shares ─────────────────────────────────────────────────
-- Partner payout amounts per salary calculation
CREATE TABLE IF NOT EXISTS salary_calculation_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID NOT NULL REFERENCES salary_calculations(id) ON DELETE CASCADE,
  vehicle_partner_id UUID REFERENCES vehicle_partners(id) ON DELETE SET NULL,
  ownership_percentage NUMERIC(5,2) NOT NULL,
  share_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── settlements ───────────────────────────────────────────────────────────────
-- Tracks whether a finalized partner share has been physically paid out
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES salary_calculation_shares(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  payment_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── company_expenses on salary_calculations ───────────────────────────────────
-- Admin can add extra company-level expenses (insurance, admin fees, etc.)
-- that reduce net revenue before partner splits are applied
ALTER TABLE salary_calculations
  ADD COLUMN IF NOT EXISTS company_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Unique constraint so we can upsert per vehicle per period
ALTER TABLE salary_calculations
  DROP CONSTRAINT IF EXISTS salary_calculations_vehicle_period_unique;
ALTER TABLE salary_calculations
  ADD CONSTRAINT salary_calculations_vehicle_period_unique UNIQUE (vehicle_id, period_start);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE salary_calculation_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_shares" ON salary_calculation_shares;
CREATE POLICY "admin_all_shares" ON salary_calculation_shares FOR ALL TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

DROP POLICY IF EXISTS "admin_all_settlements" ON settlements;
CREATE POLICY "admin_all_settlements" ON settlements FOR ALL TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

DROP POLICY IF EXISTS "partner_own_settlements" ON settlements;
CREATE POLICY "partner_own_settlements" ON settlements FOR SELECT TO authenticated
  USING (partner_id IN (
    SELECT id FROM partners WHERE linked_auth_id = auth.uid()
  ));

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_salary_shares_calc ON salary_calculation_shares(calculation_id);
CREATE INDEX IF NOT EXISTS idx_settlements_partner ON settlements(partner_id);