-- Link each driver to their primary vehicle
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_vehicle ON drivers(vehicle_id);

-- Bonus rate for salary drivers (% of net revenue paid as bonus after expenses)
-- e.g. driver on fixed salary SAR 4000 also gets 8% bonus of net revenue
ALTER TABLE driver_compensation ADD COLUMN IF NOT EXISTS bonus_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Comment: bonus_rate = 0 means no bonus. For commission drivers, bonus_rate is ignored.