-- Indexes for faster partner settlement queries
CREATE INDEX IF NOT EXISTS idx_settlements_partner ON settlements(partner_id, status);

-- View joining settlements -> shares -> calculations -> vehicles
-- Makes partner settlements page simple: SELECT * FROM partner_settlement_view WHERE partner_id = ?
CREATE OR REPLACE VIEW partner_settlement_view AS
SELECT
  s.id,
  s.partner_id,
  s.amount,
  s.status,
  s.paid_at,
  s.payment_reference,
  s.notes,
  sc.period_start,
  sc.period_end,
  v.make || ' ' || v.model AS vehicle_name,
  v.plate_number,
  scs.ownership_percentage
FROM settlements s
JOIN salary_calculation_shares scs ON scs.id = s.share_id
JOIN salary_calculations sc ON sc.id = scs.calculation_id
JOIN vehicles v ON v.id = sc.vehicle_id;

-- Add payer_name + voucher_collected to rides if not exists
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS voucher_collected BOOLEAN DEFAULT false;