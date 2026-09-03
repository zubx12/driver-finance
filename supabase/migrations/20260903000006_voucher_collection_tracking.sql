-- Migration: Voucher collection tracking — who received the payment
-- Adds collected_by fields to rides + RLS for driver/partner to mark collected

-- 1. Add collection tracking columns
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS collected_by UUID,
  ADD COLUMN IF NOT EXISTS collected_by_name TEXT,
  ADD COLUMN IF NOT EXISTS collected_by_role TEXT
    CHECK (collected_by_role IN ('admin', 'driver', 'partner')),
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- 2. Driver can mark their own outstanding voucher rides as collected
-- Only allows changing Outstanding → Collected, nothing else
CREATE POLICY "Drivers can collect own vouchers" ON public.rides
  FOR UPDATE TO authenticated
  USING (
    driver_id = (SELECT id FROM drivers WHERE linked_auth_id = auth.uid())
    AND payment_method = 'Voucher'
    AND payment_status = 'Outstanding'
    AND (auth.jwt()->'user_metadata'->>'role') = 'driver'
  )
  WITH CHECK (payment_status = 'Collected');

-- 3. Partner can mark vouchers as collected for vehicles they are linked to
CREATE POLICY "Partners can collect vouchers for their vehicles" ON public.rides
  FOR UPDATE TO authenticated
  USING (
    vehicle_id IN (
      SELECT vehicle_id FROM vehicle_partners
      WHERE partner_id = (SELECT id FROM partners WHERE linked_auth_id = auth.uid())
    )
    AND payment_method = 'Voucher'
    AND payment_status = 'Outstanding'
    AND (auth.jwt()->'user_metadata'->>'role') = 'partner'
  )
  WITH CHECK (payment_status = 'Collected');
