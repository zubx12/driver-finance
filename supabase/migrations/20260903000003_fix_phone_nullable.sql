-- SEC-08: Make phone column nullable since accounts are created by admin
-- with username-based auth, not phone numbers. The API routes (create-driver,
-- create-partner) never send a phone value.
ALTER TABLE public.drivers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.partners ALTER COLUMN phone DROP NOT NULL;
