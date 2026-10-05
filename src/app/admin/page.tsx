'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, DollarSign, Users, Activity, Scale, RefreshCw } from 'lucide-react';
import { getAdminDashboardKPIs, getDailyTotals } from '@/lib/data/dailySummary';
import { riyadhToday, addDays, monthOf, previousMonth } from '@/lib/dates';
import { createClient } from '@/lib/supabase/client';
import { AdminLiveBanner } from './AdminLiveBanner';
import { mapRecentRide, RECENT_RIDE_SELECT, type RecentActivity } from '@/lib/realtime/use-realtime-admin';

const RevenueChart = dynamic(() => import('./revenue-chart'), {
  ssr: false,
  loading: () => <div className="h-[220px] flex items-center justify-center text-zinc-400 text-sm">Loading chart…</div>
});
type Period = 'this_week' | 'this_month' | 'last_month';

const PERIOD_LABEL: Record<Period, string> = {
  this_week: 'Last 7 days',
  this_month: 'This month so far',
  last_month: 'Last month',
};

function periodRange(p: Period, today: string) {
  switch (p) {
    case 'this_week': return { start: addDays(today, -6), end: today };
    case 'this_month': return { start: monthOf(today).start, end: today };
    case 'last_month': return previousMonth(today);
  }
}

interface Kpis { totalRevenue: number; totalExpenses: number; beforeDriverPay: number; activeDrivers: number; }
interface DashboardData {
  kpis: Kpis;
  chartData: { date: string; revenue: number; expenses: number }[];
  activity: RecentActivity[];
  range: { start: string; end: string };
}

async function loadDashboard(period: Period): Promise<DashboardData> {
  const today = riyadhToday();
  const range = periodRange(period, today);
  const supabase = createClient();

  // Errors are thrown, never shown as zeros.
  const [vehicleKpis, activeCount, ridesResult, daily] = await Promise.all([
    getAdminDashboardKPIs(range.start, range.end),
    supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
    supabase.from('rides').select(RECENT_RIDE_SELECT).order('created_at', { ascending: false }).limit(5),
    getDailyTotals(range.start, range.end),
  ]);
  if (activeCount.error) throw new Error(activeCount.error.message);
  if (ridesResult.error) throw new Error(ridesResult.error.message);

  // One point per day of the period, including days without entries.
  const byDate = new Map(daily.map(d => [d.date, d]));
  const chartData: DashboardData['chartData'] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    const row = byDate.get(d);
    chartData.push({
      date: new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      revenue: row?.revenue ?? 0,
      expenses: row?.expenses ?? 0,
    });
  }

  return {
    kpis: {
      totalRevenue: vehicleKpis.reduce((s, v) => s + v.financials.totalRevenue, 0),
      totalExpenses: vehicleKpis.reduce((s, v) => s + v.financials.totalExpenses, 0),
      beforeDriverPay: vehicleKpis.reduce((s, v) => s + v.financials.netRevenue, 0),
      activeDrivers: activeCount.count ?? 0,
    },
    chartData,
    activity: (ridesResult.data ?? []).map(mapRecentRide),
    range,
  };
}

const fmt = (n: number) => `SAR ${n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function AdminOverview() {
  const [period, setPeriod] = useState<Period>('this_month');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let current = true;
    loadDashboard(period)
      .then(d => { if (current) { setData(d); setError(null); } })
      .catch(e => { if (current) setError(e instanceof Error ? e.message : 'The dashboard could not be loaded.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [period, reloadKey]);

  const changePeriod = (p: Period) => {
    if (p === period) return;
    setLoading(true);
    setPeriod(p);
  };
  // Used by "Retry" and by the live "new data" banner.
  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey(k => k + 1);
  }, []);

  const label = PERIOD_LABEL[period];
  const rangeText = data ? `${shortDate(data.range.start)} – ${shortDate(data.range.end)}` : '';

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          {label}{rangeText && ` · ${rangeText}`} · all vehicles
        </p>
        <div className="flex gap-2 mt-4" role="group" aria-label="Period">
          {(['this_week', 'this_month', 'last_month'] as Period[]).map(p => (
            <button key={p} onClick={() => changePeriod(p)} aria-pressed={period === p}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
              {p === 'this_week' ? 'Last 7 Days' : p === 'this_month' ? 'This Month' : 'Last Month'}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">The figures could not be loaded: {error}</span>
          <button onClick={reload} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950/40">
            <RefreshCw className="h-3.5 w-3.5" />Retry
          </button>
        </div>
      )}

      {!data && loading ? (
        <div className="p-8 text-center text-zinc-500">Loading dashboard…</div>
      ) : data && (
        <div className={`space-y-8 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`} aria-busy={loading}>
          {/* Live new-data banner, correction-request badge, latest rides */}
          <AdminLiveBanner initialActivity={data.activity} onRefresh={reload} />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-indigo-100 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-900/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">{fmt(data.kpis.totalRevenue)}</div>
                <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70">{label}</p>
              </CardContent>
            </Card>

            <Card className="border-rose-100 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Vehicle Expenses</CardTitle>
                <Activity className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">{fmt(data.kpis.totalExpenses)}</div>
                <p className="text-xs text-rose-600/70 dark:text-rose-400/70">{label}</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Before Driver Pay</CardTitle>
                <Scale className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{fmt(data.kpis.beforeDriverPay)}</div>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                  Revenue − vehicle expenses. Driver pay and office costs are not deducted yet.
                </p>
              </CardContent>
            </Card>

            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
                <Users className="h-4 w-4 text-zinc-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.kpis.activeDrivers}</div>
                <p className="text-xs text-zinc-500">Driver accounts set to Active</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle>Revenue vs Vehicle Expenses · {label}</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              {data.chartData.some(d => d.revenue || d.expenses) ? (
                <RevenueChart data={data.chartData} />
              ) : (
                <div className="h-48 flex items-center justify-center text-zinc-400 text-sm">
                  No rides or expenses in this period.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
