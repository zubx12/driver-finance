import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Car, DollarSign, Users, Activity } from 'lucide-react';
import { getAdminDashboardKPIs } from '@/lib/data/dailySummary';
import { getAdminDrivers } from '@/lib/data/drivers';
import { RevenueChart } from './revenue-chart';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  // getAdminDashboardKPIs returns per-vehicle breakdown — sum for company-wide totals
  const [vehicleKpis, allDrivers] = await Promise.all([
    getAdminDashboardKPIs(monthStart, today).catch(() => [] as Awaited<ReturnType<typeof getAdminDashboardKPIs>>),
    getAdminDrivers().catch(() => []),
  ]);

  const kpis = {
    totalRevenue:  vehicleKpis.reduce((s, v) => s + v.financials.totalRevenue, 0),
    totalExpenses: vehicleKpis.reduce((s, v) => s + v.financials.totalExpenses, 0),
    netRevenue:    vehicleKpis.reduce((s, v) => s + v.financials.netRevenue, 0),
    activeDrivers: allDrivers.filter(d => d.status === 'Active').length,
  };

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Month-to-date financial performance.
          </p>
        </div>
      </header>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-indigo-100 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">
              {kpis ? `${fmt(kpis.totalRevenue)} SAR` : '—'}
            </div>
            <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70">Month to date</p>
          </CardContent>
        </Card>
        
        <Card className="border-rose-100 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <Activity className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">
              {kpis ? `${fmt(kpis.totalExpenses)} SAR` : '—'}
            </div>
            <p className="text-xs text-rose-600/70 dark:text-rose-400/70">Month to date</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {kpis ? `${fmt(kpis.netRevenue)} SAR` : '—'}
            </div>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Month to date</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
            <Users className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kpis ? kpis.activeDrivers : '—'}
            </div>
            <p className="text-xs text-zinc-500">Registered and active</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-4 md:grid-cols-7">
        <Card className="col-span-4 border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle>Revenue vs Expenses</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <RevenueChart />
          </CardContent>
        </Card>

        <Card className="col-span-3 border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <CardHeader>
            <CardTitle>Recent Driver Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Car className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">Driver {1000 + i}</p>
                    <p className="text-sm text-zinc-500">Synced {i * 12} SAR</p>
                  </div>
                  <div className="text-sm text-zinc-500">{i * 5}m ago</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
