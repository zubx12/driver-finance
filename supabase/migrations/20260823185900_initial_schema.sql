-- Phase 1: Database Schema & RLS Security

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. DRIVERS TABLE
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    linked_auth_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. PARTNERS TABLE
CREATE TABLE public.partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    linked_auth_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. VEHICLES TABLE
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    plate_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Maintenance', 'Inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. VEHICLE PARTNERS (Ownership Split)
CREATE TABLE public.vehicle_partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    percentage NUMERIC(5, 2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(vehicle_id, partner_id, effective_from)
);

-- 5. RIDES TABLE (Revenue)
CREATE TABLE public.rides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Voucher', 'Card', 'Transfer')),
    payer_id UUID, -- Optional, if voucher is tied to a specific payer company
    reference TEXT,
    ride_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. EXPENSES TABLE
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    category TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Card', 'Transfer')),
    description TEXT,
    receipt_image_url TEXT NOT NULL, -- Mandatory based on design!
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. DAILY SUMMARY (Rollup Table)
CREATE TABLE public.daily_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    summary_date DATE NOT NULL,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    total_revenue NUMERIC(12, 2) DEFAULT 0,
    cash_revenue NUMERIC(12, 2) DEFAULT 0,
    voucher_revenue NUMERIC(12, 2) DEFAULT 0,
    total_expenses NUMERIC(12, 2) DEFAULT 0,
    cash_expenses NUMERIC(12, 2) DEFAULT 0,
    net_revenue NUMERIC(12, 2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(summary_date, driver_id, vehicle_id)
);

-- 8. AUDIT LOG
CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    changed_by UUID REFERENCES auth.users(id), -- Nullable if system triggered
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. SALARY CALCULATIONS
CREATE TABLE public.salary_calculations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
    total_revenue NUMERIC(12, 2) NOT NULL,
    total_expenses NUMERIC(12, 2) NOT NULL,
    net_revenue NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finalized_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.salary_calculation_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calculation_id UUID NOT NULL REFERENCES public.salary_calculations(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.partners(id),
    ownership_percentage NUMERIC(5, 2) NOT NULL,
    share_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_calculation_shares ENABLE ROW LEVEL SECURITY;

-- Helper to check if current user is Admin (assuming 'role' claim in JWT or via another table)
-- We will assume the JWT holds the role claim: auth.jwt() ->> 'role'
-- For this setup, we'll keep it simple and just use auth.uid() based checks for drivers/partners.

-- DRIVER POLICIES
-- Drivers can only see their own driver record
CREATE POLICY "Drivers can view own record" ON public.drivers
    FOR SELECT USING (auth.uid() = linked_auth_id);

-- Drivers can see vehicles they have driven (or all vehicles, if we want them to select from a list to drive)
-- For now, let drivers see all active vehicles so they can select them.
CREATE POLICY "Drivers can view active vehicles" ON public.vehicles
    FOR SELECT USING (status = 'Active');

-- Drivers can insert/select their own rides
CREATE POLICY "Drivers can insert own rides" ON public.rides
    FOR INSERT WITH CHECK (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
    );
CREATE POLICY "Drivers can view own rides" ON public.rides
    FOR SELECT USING (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
    );

-- Drivers can insert/select their own expenses
CREATE POLICY "Drivers can insert own expenses" ON public.expenses
    FOR INSERT WITH CHECK (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
    );
CREATE POLICY "Drivers can view own expenses" ON public.expenses
    FOR SELECT USING (
        driver_id IN (SELECT id FROM public.drivers WHERE linked_auth_id = auth.uid())
    );

-- PARTNER POLICIES
-- Partners can see their own partner record
CREATE POLICY "Partners can view own record" ON public.partners
    FOR SELECT USING (auth.uid() = linked_auth_id);

-- Partners can see vehicles they are assigned to
CREATE POLICY "Partners can view their vehicles" ON public.vehicles
    FOR SELECT USING (
        id IN (
            SELECT vehicle_id FROM public.vehicle_partners 
            WHERE partner_id IN (SELECT id FROM public.partners WHERE linked_auth_id = auth.uid())
            AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
        )
    );

-- Partners can see daily_summary for their vehicles
CREATE POLICY "Partners can view daily_summary for their vehicles" ON public.daily_summary
    FOR SELECT USING (
        vehicle_id IN (
            SELECT vehicle_id FROM public.vehicle_partners 
            WHERE partner_id IN (SELECT id FROM public.partners WHERE linked_auth_id = auth.uid())
        )
    );

-- Partners can see salary calculations for their vehicles
CREATE POLICY "Partners can view salary calculations for their vehicles" ON public.salary_calculations
    FOR SELECT USING (
        vehicle_id IN (
            SELECT vehicle_id FROM public.vehicle_partners 
            WHERE partner_id IN (SELECT id FROM public.partners WHERE linked_auth_id = auth.uid())
        )
    );

-- Partners can see their OWN salary calculation shares
CREATE POLICY "Partners can view own calculation shares" ON public.salary_calculation_shares
    FOR SELECT USING (
        partner_id IN (SELECT id FROM public.partners WHERE linked_auth_id = auth.uid())
    );

-- ADMIN POLICIES (Assuming Admin has bypass RLS or specific admin policies)
-- An admin policy would look like: 
-- CREATE POLICY "Admin full access" ON public.rides FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
