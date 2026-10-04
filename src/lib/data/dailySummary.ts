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
  voucherOutstanding: number;
  voucherCollected: number;
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

// Totals are computed in the database (get_period_financials /
// get_daily_totals, migration 20261004000003). Summing rows in the browser
// was capped at 1,000 rows by the API. The caller's row-level security still
// applies: admins see every vehicle, partners only their ownership dates.

interface PeriodFinancialsRow {
  vehicle_id: string;
  total_revenue: number;
  cash_revenue: number;
  voucher_revenue: number;
  total_expenses: number;
  cash_expenses: number;
  net_revenue: number;
  voucher_outstanding: number;
  voucher_collected: number;
}

const toFinancials = (r: PeriodFinancialsRow): PeriodFinancials => ({
  totalRevenue: Number(r.total_revenue),
  cashRevenue: Number(r.cash_revenue),
  voucherRevenue: Number(r.voucher_revenue),
  totalExpenses: Number(r.total_expenses),
  cashExpenses: Number(r.cash_expenses),
  netRevenue: Number(r.net_revenue),
  voucherOutstanding: Number(r.voucher_outstanding),
  voucherCollected: Number(r.voucher_collected),
});

const EMPTY: PeriodFinancials = {
  totalRevenue: 0, cashRevenue: 0, voucherRevenue: 0, totalExpenses: 0,
  cashExpenses: 0, netRevenue: 0, voucherOutstanding: 0, voucherCollected: 0,
};

async function periodFinancials(start: string, end: string): Promise<PeriodFinancialsRow[]> {
  const { data, error } = await createClient().rpc('get_period_financials', { p_start: start, p_end: end });
  if (error) throw new Error(`get_period_financials: ${error.message}`);
  return (data ?? []) as PeriodFinancialsRow[];
}

/** Totals for one vehicle over a date range (inclusive). */
export async function getVehiclePeriodFinancials(
  vehicleId: string,
  start: string,
  end: string
): Promise<PeriodFinancials> {
  const row = (await periodFinancials(start, end)).find(r => r.vehicle_id === vehicleId);
  return row ? toFinancials(row) : { ...EMPTY };
}

/** Totals per vehicle over a date range (inclusive), for the admin dashboard. */
export async function getAdminDashboardKPIs(
  start: string,
  end: string
): Promise<{ vehicleId: string; financials: PeriodFinancials }[]> {
  return (await periodFinancials(start, end)).map(r => ({ vehicleId: r.vehicle_id, financials: toFinancials(r) }));
}

/** Company-wide totals per day (inclusive range), for trend charts. */
export async function getDailyTotals(
  start: string,
  end: string
): Promise<{ date: string; revenue: number; expenses: number; net: number }[]> {
  const { data, error } = await createClient().rpc('get_daily_totals', { p_start: start, p_end: end });
  if (error) throw new Error(`get_daily_totals: ${error.message}`);
  return ((data ?? []) as { summary_date: string; total_revenue: number; total_expenses: number; net_revenue: number }[])
    .map(r => ({ date: r.summary_date, revenue: Number(r.total_revenue), expenses: Number(r.total_expenses), net: Number(r.net_revenue) }));
}
