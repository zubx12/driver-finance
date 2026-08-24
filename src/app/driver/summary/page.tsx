'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { MOCK_DRIVER, getActiveVehicleForDriver, getActiveArrangementForDriver } from '@/lib/mock-data';

export default function DriverSummaryPage() {
  const allRides = useLiveQuery(() => db.rides.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  
  const activeVehicle = getActiveVehicleForDriver(MOCK_DRIVER.id);
  const activeArrangement = activeVehicle ? getActiveArrangementForDriver(MOCK_DRIVER.id, activeVehicle.id) : null;
  const driverPercentage = activeArrangement?.percentage || 0;

  // Calculate totals
  const totalRevenue = allRides.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netRevenue = totalRevenue - totalExpenses;
  const estimatedShare = netRevenue > 0 ? netRevenue * (driverPercentage / 100) : 0;

  // Prepare chart data (Mocking trend data based on all-time sum for visual effect)
  // In a real app, we'd group by date. For now, we'll create a mock 7-day trend.
  const chartData = [
    { name: 'Mon', revenue: 200, expense: 50 },
    { name: 'Tue', revenue: 450, expense: 80 },
    { name: 'Wed', revenue: 300, expense: 40 },
    { name: 'Thu', revenue: 500, expense: 120 },
    { name: 'Fri', revenue: 400, expense: 60 },
    { name: 'Sat', revenue: Math.max(0, totalRevenue - 1850), expense: Math.max(0, totalExpenses - 350) },
    { name: 'Sun', revenue: totalRevenue, expense: totalExpenses }, // Today's actual cumulative
  ];

  // Group expenses by category
  const expenseBreakdown = allExpenses.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Financial Summary</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Your all-time performance</p>
      </header>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-emerald-200/50 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-emerald-800 dark:text-emerald-400">Revenue</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
              SAR {totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-rose-200/50 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-rose-800 dark:text-rose-400">Expenses</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg font-bold text-rose-700 dark:text-rose-300">
              SAR {totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 border-indigo-100 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-900/50">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-indigo-900 dark:text-indigo-100">Net Revenue</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-400">
              SAR {netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 border-transparent text-white shadow-xl relative overflow-hidden" style={{ backgroundColor: '#059669' }}>
          <CardHeader className="p-4 pb-2 relative z-10 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-emerald-100 uppercase tracking-wider">Estimated Share</CardTitle>
            <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-md">{driverPercentage}%</span>
          </CardHeader>
          <CardContent className="p-4 pt-0 relative z-10">
            <div className="text-4xl font-extrabold tracking-tight">
              SAR {estimatedShare.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TREND CHART */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Revenue Trend</h2>
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardContent className="p-4 pt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      {/* EXPENSE BREAKDOWN */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Expense Breakdown</h2>
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardContent className="p-0 divide-y dark:divide-zinc-800">
            {Object.keys(expenseBreakdown).length === 0 ? (
              <div className="p-6 text-center text-zinc-500 text-sm">No expenses recorded yet.</div>
            ) : (
              Object.entries(expenseBreakdown).map(([category, amount]) => (
                <div key={category} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-rose-500"></div>
                    <span className="font-medium text-sm capitalize">{category}</span>
                  </div>
                  <span className="font-bold text-sm">SAR {amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  );
}
