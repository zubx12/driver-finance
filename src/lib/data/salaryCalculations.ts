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

export interface SalaryCalculationWithShares extends DbSalaryCalculation {
  shares: DbSalaryCalculationShare[];
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Get all salary calculations for a vehicle, newest first. */
export async function getCalculationsForVehicle(
  vehicleId: string
): Promise<SalaryCalculationWithShares[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('salary_calculations')
    .select('*, salary_calculation_shares(*)')
    .eq('vehicle_id', vehicleId)
    .order('period_start', { ascending: false });

  if (error) throw new Error(`getCalculationsForVehicle: ${error.message}`);
  return (data ?? []).map(row => ({
    ...row,
    shares: row.salary_calculation_shares ?? [],
  }));
}

/** Get all salary calculations across all vehicles. Admin only. */
export async function getAllSalaryCalculations(): Promise<SalaryCalculationWithShares[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('salary_calculations')
    .select('*, salary_calculation_shares(*)')
    .order('period_start', { ascending: false });

  if (error) throw new Error(`getAllSalaryCalculations: ${error.message}`);
  return (data ?? []).map(row => ({
    ...row,
    shares: row.salary_calculation_shares ?? [],
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

/**
 * Admin: trigger a salary calculation run via the Edge Function.
 * The Edge Function handles all the math and writes to salary_calculations.
 */
export async function runSalaryCalculation(
  vehicleId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ calculationId: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('calculate-salary', {
    body: { vehicle_id: vehicleId, period_start: periodStart, period_end: periodEnd },
  });

  if (error) throw new Error(`runSalaryCalculation: ${error.message}`);
  return data;
}

/**
 * Admin: finalize a salary calculation.
 * Once finalized, the status is locked — cannot be re-calculated.
 * This is enforced by a CHECK constraint in the DB.
 */
export async function finalizeCalculation(calculationId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('salary_calculations')
    .update({
      status: 'finalized',
      finalized_at: new Date().toISOString(),
    })
    .eq('id', calculationId)
    .eq('status', 'draft'); // Cannot finalize something already finalized

  if (error) throw new Error(`finalizeCalculation: ${error.message}`);
}
