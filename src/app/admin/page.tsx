'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Users, Activity } from 'lucide-react';
import { getAdminDashboardKPIs } from '@/lib/data/dailySummary';
import { getAdminDrivers } from '@/lib/data/drivers';
import { createClient } from '@/lib/supabase/client';
import { RevenueChart } from './revenue-chart';
import { AdminLiveBanner } from './AdminLiveBanner';
import type { RecentActivity } from '@/lib/realtime/use-realtime-admin';
type Period = 'this_week' | 'this_month' | 'last_month';

export default function AdminOverview() {
  const [period, setPeriod] = useState<Period>('this_month');
  const [kpis, setKpis] = useState({ totalRevenue: 0, totalExpenses: 0, netRevenue: 0, activeDrivers: 0 });
  const [drivers, setDrivers] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [initialActivity, setInitialActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const getDateRange = (p: Period) => {
          const now = new Date();
          const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
          switch (p) {
            case 'this_week': {
              const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              return { start: weekAgo.toISOString().split('T')[0], end: today };
            }
            case 'this_month': {
              return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end: today };
            }
            case 'last_month': {
              const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
              return { start: lastMonth.toISOString().split('T')[0], end: lastDay.toISOString().split('T')[0] };
            }
          }
        };
        const { start, end } = getDateRange(period);

        const vehicleKpis = await getAdminDashboardKPIs(start, end).catch(() => []);
        const allDrivers = await getAdminDrivers().catch(() => []);

        const supabase = createClient();

        const { data: recentRidesRes } = await supabase
          .from('rides')
          .select('id, amount, ride_date, created_at, drivers(name)')
          .order('created_at', { ascending: false })
          .limit(5);

        const recentRides = recentRidesRes ?? [];
        const activity: RecentActivity[] = recentRides.map((r: any) => ({
          id: r.id,
          driverName: r.drivers?.name ?? 'Unknown Driver',
          amount: r.amount,
          createdAt: r.created_at,
          type: 'ride' as const,
        }));

        setInitialActivity(activity);

        setDrivers(allDrivers);
        setKpis({
          totalRevenue: vehicleKpis.reduce((s: number, v: any) => s + v.financials.totalRevenue, 0),
          totalExpenses: vehicleKpis.reduce((s: number, v: any) => s + v.financials.totalExpenses, 0),
          netRevenue: vehicleKpis.reduce((s: number, v: any) => s + v.financials.netRevenue, 0),
          activeDrivers: allDrivers.filter((d: any) => d.status === 'Active').length,
        });

        const startOf7Days = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
        const { data: rawChart } = await supabase
          .from('daily_summary')
          .select('summary_date, total_revenue, total_expenses')
          .gte('summary_date', startOf7Days)
          .order('summary_date', { ascending: true });

        // FIX ADM-03: Group by date to avoid duplicate points
        const grouped = (rawChart ?? []).reduce((acc: Record<string, { date: string; revenue: number; expenses: number }>, row: any) => {
          const key = row.summary_date;
          if (!acc[key]) {
            acc[key] = { 
              date: new Date(key).toLocaleDateString('en-SA', { weekday: 'short' }), 
              revenue: 0, 
              expenses: 0 
            };
          }
          acc[key].revenue += row.total_revenue;
          acc[key].expenses += row.total_expenses;
          return acc;
        }, {});
        setChartData(Object.values(grouped));
      } catch (e) {
        console.error('Failed to load admin dashboard:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [period]);

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Month-to-date financial performance.</p>
        <div className="flex gap-2 mt-4">
          {(['this_week', 'this_month', 'last_month'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'}`}>
              {p === 'this_week' ? 'This Week' : p === 'this_month' ? 'This Month' : 'Last Month'}
            </button>
          ))}
        </div>
      </header>

      {/* Client component: live new-data banner, correction-request badge, live activity feed */}
      <AdminLiveBanner initialActivity={initialActivity} />

      {/* KPI Cards */}
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