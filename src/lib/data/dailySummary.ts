import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbDailySummary {
  id: string;
  summary_date: string; // YYYY-MM-DD
  driver_id: string;
  vehicle_id: string;
  total_revenue: number;
  cash_revenue: number;
  voucher_revenue: number;
  total_expenses: number;
  cash_expenses: number;
  net_revenue: number;
  updated_at: string;
}

export interface PeriodFinancials {
  totalRevenue: number;
  cashRevenue: number;
  voucherRevenue: number;
  totalExpenses: number;
  cashExpenses: number;
  netRevenue: number;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Get daily summary rows for a specific driver and date range. */
export async function getDriverDailySummaries(
  driverId: string,
  start: string,
  end: string
): Promise<DbDailySummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('daily_summary')
    .select('*')
    .eq('driver_id', driverId)
    .gte('summary_date', start)
    .lte('summary_date', end)
    .order('summary_date', { ascending: false });

  if (error) throw new Error(`getDriverDailySummaries: ${error.message}`);
  return data ?? [];
}

/** Get the summary for a specific driver on a specific date. */
export async function getDriverDaySummary(
  driverId: string,
  date: string
): Promise<DbDailySummary | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('daily_summary')
    .select('*')
    .eq('driver_id', driverId)
    .eq('summary_date', date)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(`getDriverDaySummary: ${error.message}`);
  return data ?? null;
}

/**
 * Get aggregated financials for a vehicle across a date range.
 * Used by partner dashboard — RLS already scopes to their vehicles.
 */
export async function getVehiclePeriodFinancials(
  vehicleId: string,
  start: string,
  end: string
): Promise<PeriodFinancials> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('daily_summary')
    .select('total_revenue, cash_revenue, voucher_revenue, total_expenses, cash_expenses, net_revenue')
    .eq('vehicle_id', vehicleId)
    .gte('summary_date', start)
    .lte('summary_date', end);

  if (error) throw new Error(`getVehiclePeriodFinancials: ${error.message}`);

  const rows = data ?? [];
  return {
    totalRevenue: rows.reduce((s, r) => s + r.total_revenue, 0),
    cashRevenue: rows.reduce((s, r) => s + r.cash_revenue, 0),
    voucherRevenue: rows.reduce((s, r) => s + r.voucher_revenue, 0),
    totalExpenses: rows.reduce((s, r) => s + r.total_expenses, 0),
    cashExpenses: rows.reduce((s, r) => s + r.cash_expenses, 0),
    netRevenue: rows.reduce((s, r) => s + r.net_revenue, 0),
  };
}

/**
 * Get aggregated KPIs across all vehicles for the admin dashboard.
 * Returns one aggregated row per vehicle for the given period.
 */
export async function getAdminDashboardKPIs(
  start: string,
  end: string
): Promise<{ vehicleId: string; financials: PeriodFinancials }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('daily_summary')
    .select('vehicle_id, total_revenue, cash_revenue, voucher_revenue, total_expenses, cash_expenses, net_revenue')
    .gte('summary_date', start)
    .lte('summary_date', end);

  if (error) throw new Error(`getAdminDashboardKPIs: ${error.message}`);

  // Group by vehicle_id
  const grouped = new Map<string, PeriodFinancials>();
  for (const row of data ?? []) {
    const existing = grouped.get(row.vehicle_id) ?? {
      totalRevenue: 0, cashRevenue: 0, voucherRevenue: 0,
      totalExpenses: 0, cashExpenses: 0, netRevenue: 0
    };
    grouped.set(row.vehicle_id, {
      totalRevenue: existing.totalRevenue + row.total_revenue,
      cashRevenue: existing.cashRevenue + row.cash_revenue,
      voucherRevenue: existing.voucherRevenue + row.voucher_revenue,
      totalExpenses: existing.totalExpenses + row.total_expenses,
      cashExpenses: existing.cashExpenses + row.cash_expenses,
      netRevenue: existing.netRevenue + row.net_revenue,
    });
  }

  return Array.from(grouped.entries()).map(([vehicleId, financials]) => ({ vehicleId, financials }));
}
