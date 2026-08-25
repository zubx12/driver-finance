import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Users, Activity } from 'lucide-react';
import { getAdminDashboardKPIs } from '@/lib/data/dailySummary';
import { getAdminDrivers } from '@/lib/data/drivers';
import { createClient } from '@/lib/supabase/server';
import { RevenueChart } from './revenue-chart';
import { AdminLiveBanner } from './AdminLiveBanner';
import type { RecentActivity } from '@/lib/realtime/use-realtime-admin';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  const supabase = await createClient();

  const [vehicleKpis, allDrivers, recentRidesRes] = await Promise.all([
    getAdminDashboardKPIs(monthStart, today).catch(() => []),
    getAdminDrivers().catch(() => []),
    // Last 5 synced rides with driver name
    supabase
      .from('rides')
      .select('id, amount, ride_date, created_at, drivers(name)')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const kpis = {
    totalRevenue:  vehicleKpis.reduce((s: number, v: any) => s + v.financials.totalRevenue, 0),
    totalExpenses: vehicleKpis.reduce((s: number, v: any) => s + v.financials.totalExpenses, 0),
    netRevenue:    vehicleKpis.reduce((s: number, v: any) => s + v.financials.netRevenue, 0),
    activeDrivers: allDrivers.filter((d: any) => d.status === 'Active').length,
  };

  const recentRides = recentRidesRes.data ?? [];

  // Shape for the AdminLiveBanner client component
  const initialActivity: RecentActivity[] = recentRides.map((r: any) => ({
    id: r.id,
    driverName: r.drivers?.name ?? 'Unknown Driver',
    amount: r.amount,
    createdAt: r.created_at,
    type: 'ride' as const,
  }));

  // Build last 7 days chart data from daily_summary
  const chartRes = await supabase
    .from('daily_summary')
    .select('summary_date, total_revenue, total_expenses')
    .gte('summary_date', new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0])
    .order('summary_date', { ascending: true });

  const chartData = (chartRes.data ?? []).map((row: any) => ({
    date: new Date(row.summary_date).toLocaleDateString('en-SA', { weekday: 'short' }),
    revenue: row.total_revenue,
    expenses: row.total_expenses,
  }));

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Month-to-date financial performance.</p>
      </header>

      {/* Client component: live new-data banner, correction-request badge, live activity feed */}
      <AdminLiveBanner initialActivity={initialActivity} />

      {/* KPI Cards — SSR values; refreshed via router.refresh() when new data arrives */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-indigo-100 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">{fmt(kpis.totalRevenue)} SAR</div>
            <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70">Month to date</p>
          </CardContent>
        </Card>

        <Card className="border-rose-100 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <Activity className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">{fmt(kpis.totalExpenses)} SAR</div>
            <p className="text-xs text-rose-600/70 dark:text-rose-400/70">Month to date</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{fmt(kpis.netRevenue)} SAR</div>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Month to date</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
            <Users className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.activeDrivers}</div>
            <p className="text-xs text-zinc-500">Registered and active</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue chart */}
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle>Revenue vs Expenses — Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          {chartData.length > 0 ? (
            <RevenueChart data={chartData} />
          ) : (
            <div className="h-48 flex items-center justify-center text-zinc-400 text-sm">
              No data yet — chart will populate as rides are synced.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}