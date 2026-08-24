-- Migration: Add driver_compensation table (missing from initial schema)
-- Both compensation types supported: commission (revenue share) and fixed_salary

CREATE TABLE public.driver_compensation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL, -- NULL = applies to any vehicle
    compensation_type TEXT NOT NULL CHECK (compensation_type IN ('commission', 'fixed_salary')),
    commission_percentage NUMERIC(5, 2) CHECK (
        (compensation_type = 'commission' AND commission_percentage IS NOT NULL AND commission_percentage > 0 AND commission_percentage <= 100)
        OR compensation_type != 'commission'
    ),
    fixed_salary_amount NUMERIC(10, 2) CHECK (
        (compensation_type = 'fixed_salary' AND fixed_salary_amount IS NOT NULL AND fixed_salary_amount >= 0)
        OR compensation_type != 'fixed_salary'
    ),
    pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('weekly', 'monthly')),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Constraint: effective_to must be after effective_from if set
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Index for fast lookups during salary calculation
CREATE INDEX idx_driver_compensation_driver ON public.driver_compensation(driver_id, effective_from);
CREATE INDEX idx_driver_compensation_vehicle ON public.driver_compensation(vehicle_id, effective_from);

-- RLS
ALTER TABLE public.driver_compensation ENABLE ROW LEVEL SECURITY;

-- Drivers can read their own compensation record
CREATE POLICY "Drivers can view own compensation" ON public.driver_compensation
    FOR SELECT USING (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
    );

-- Admin full access (see next migration for admin helper function)
CREATE POLICY "Admin full access on driver_compensation" ON public.driver_compensation
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');
