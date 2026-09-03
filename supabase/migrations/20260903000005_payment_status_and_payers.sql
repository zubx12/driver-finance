-- Migration: Add payment_status to rides + create payers table
-- This enables voucher outstanding payment tracking

-- FIX: audit_log table is missing columns that the trigger function expects
-- Migration 20260903000002 rewrote log_audit_changes() to use action/old_values/new_values
-- but the table still has field_changed/old_value/new_value from the initial schema.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS new_values JSONB;
-- Make field_changed nullable since the new trigger uses action/old_values/new_values instead
ALTER TABLE public.audit_log ALTER COLUMN field_changed DROP NOT NULL;

-- 1. Add payment_status column to rides
-- Cash rides default to 'Received', voucher rides will be 'Outstanding'
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS payment_status TEXT
  NOT NULL DEFAULT 'Received'
  CHECK (payment_status IN ('Received', 'Outstanding', 'Collected', 'Disputed', 'Cancelled'));

-- Set existing voucher rides to 'Outstanding' (they haven't been marked as collected)
UPDATE public.rides
  SET payment_status = 'Outstanding'
  WHERE payment_method = 'Voucher' AND payment_status = 'Received';

-- 2. Create payers table for voucher organizations
CREATE TABLE IF NOT EXISTS public.payers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Organization' CHECK (type IN ('Organization', 'Individual')),
  contact_info TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;

-- Admin can manage payers
CREATE POLICY "Admin full access on payers" ON public.payers
  FOR ALL TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- Drivers can read payers (to select when logging voucher rides)
CREATE POLICY "Drivers can read payers" ON public.payers
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') = 'driver');

-- Add foreign key from rides.payer_id to payers.id (if not already)
-- Using DO block to handle case where constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'rides_payer_id_fkey'
    AND table_name = 'rides'
  ) THEN
    ALTER TABLE public.rides
      ADD CONSTRAINT rides_payer_id_fkey
      FOREIGN KEY (payer_id) REFERENCES public.payers(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- 3. Create index for outstanding payment queries
CREATE INDEX IF NOT EXISTS idx_rides_payment_status ON public.rides (payment_status)
  WHERE payment_status = 'Outstanding';

CREATE INDEX IF NOT EXISTS idx_rides_payer_id ON public.rides (payer_id)
  WHERE payer_id IS NOT NULL;
