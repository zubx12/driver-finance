import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbSalaryCalculation {
  id: string;
  period_start: string;
  period_end: string;
  vehicle_id: string;
  total_revenue: number;
  total_expenses: number;
  net_revenue: number;
  driver_pay_total: number;
  status: 'draft' | 'finalized';
  created_at: string;
  finalized_at: string | null;
}

export interface DbSalaryCalculationShare {
  id: string;
  calculation_id: string;
  partner_id: string;
  ownership_percentage: number;
  share_amount: number;
  created_at: string;
}

export interface DbDriverPayCalculation {
  id: string;
  calculation_id: string;
  driver_id: string;
  driver_compensation_id: string | null;
  compensation_type: 'commission' | 'fixed_salary';
  commission_percentage: number | null;
  fixed_salary_amount: number | null;
  bonus_rate: number;
  driver_pay_amount: number;
  created_at: string;
}

export interface SalaryCalculationWithShares extends DbSalaryCalculation {
  shares: DbSalaryCalculationShare[];
  driverPay?: DbDriverPayCalculation[];
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Get all salary calculations for a vehicle, newest first. */
export async function getCalculationsForVehicle(
  vehicleId: string
): Promise<SalaryCalculationWithShares[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('salary_calculations')
    .select('*, salary_calculation_shares(*), driver_pay_calculations(*)')
    .eq('vehicle_id', vehicleId)
    .order('period_start', { ascending: false });

  if (error) throw new Error(`getCalculationsForVehicle: ${error.message}`);
  return (data ?? []).map(row => ({
    ...row,
    shares: row.salary_calculation_shares ?? [],
    driverPay: row.driver_pay_calculations ?? [],
  }));
}

/** Get salary calculation shares for the currently logged-in partner. */
export async function getMyCalculationShares(): Promise<DbSalaryCalculationShare[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('salary_calculation_shares')
    .select('*, salary_calculations(period_start, period_end, vehicle_id, status)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getMyCalculationShares: ${error.message}`);
  return data ?? [];
}

/** Get all driver pay calculations for the currently logged-in driver. */
export async function getMyDriverPayCalculations(): Promise<DbDriverPayCalculation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('driver_pay_calculations')
    .select('*, salary_calculations(period_start, period_end, vehicle_id, status)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getMyDriverPayCalculations: ${error.message}`);
  return data ?? [];
}

