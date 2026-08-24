-- Add username column to drivers and partners tables
-- Username is used as the login identifier instead of phone number

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Index for fast login lookups
CREATE INDEX IF NOT EXISTS idx_drivers_username ON drivers(username);
CREATE INDEX IF NOT EXISTS idx_partners_username ON partners(username);
