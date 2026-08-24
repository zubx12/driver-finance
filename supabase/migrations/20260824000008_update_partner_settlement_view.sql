CREATE OR REPLACE VIEW partner_settlement_view AS
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
  scs.ownership_percentage
FROM settlements s
JOIN partners p ON p.id = s.partner_id
JOIN salary_calculation_shares scs ON scs.id = s.share_id
JOIN salary_calculations sc ON sc.id = scs.calculation_id
JOIN vehicles v ON v.id = sc.vehicle_id;