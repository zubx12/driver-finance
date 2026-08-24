'use client';

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Percent, Calculator, Lock, ShieldAlert, CalendarClock, TrendingUp } from 'lucide-react';
import { MOCK_DRIVER, getActiveVehicleForDriver, getActiveArrangementForDriver, MOCK_ARRANGEMENTS } from '@/lib/mock-data';

export default function RevenueSharePage() {
  const router = useRouter();
  
  const activeVehicle = getActiveVehicleForDriver(MOCK_DRIVER.id);
  const activeArrangement = activeVehicle ? getActiveArrangementForDriver(MOCK_DRIVER.id, activeVehicle.id) : null;
  const history = MOCK_ARRANGEMENTS.filter(a => a.driverId === MOCK_DRIVER.id);

  // Fetch real data from Dexie
  const allRides = useLiveQuery(() => db.rides.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];

  if (!activeArrangement) {
    return <div className="p-8 text-center">No active revenue arrangement found.</div>;
  }

  // Calculate real totals
  const totalRevenue = allRides.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netRevenue = totalRevenue - totalExpenses;
  const actualShare = netRevenue > 0 ? netRevenue * (activeArrangement.percentage / 100) : 0;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.back()} className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg tracking-tight">Revenue Arrangement</h1>
      </header>

      <main className="flex-1 p-4 pb-24 space-y-6">
        
        {/* TOTAL ACTUAL EARNINGS - HIGH PROMINENCE */}
        <div style={{ backgroundColor: '#059669' }} className="rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-20">
            <TrendingUp className="h-48 w-48 -mr-10" />
          </div>
          <div className="relative z-10 space-y-2">
            <h2 className="text-sm font-bold text-emerald-100 uppercase tracking-widest">Total Estimated Earnings</h2>
            <div className="text-5xl font-extrabold tracking-tight">
              SAR {actualShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold tracking-wide backdrop-blur-sm">
                {allRides.length} RIDES
              </span>
              <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold tracking-wide backdrop-blur-sm">
                YOUR SHARE: {activeArrangement.percentage}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-zinc-100 dark:bg-zinc-900 p-3 rounded-lg border dark:border-zinc-800">
          <Lock className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Your revenue percentage is configured by company management and cannot be changed from the Driver App.
          </p>
        </div>

        {/* REAL CALCULATION BREAKDOWN */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-2">Current Period Breakdown</h3>
          
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900">
            <CardContent className="p-5 font-mono text-sm space-y-3">
              <div className="flex justify-between text-zinc-500">
                <span>Total Revenue</span>
                <span>SAR {totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-rose-500 border-b dark:border-zinc-100/10 pb-3">
                <span>- Total Expenses</span>
                <span>SAR {totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1">
                <span>Net Revenue</span>
                <span>SAR {netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-[#059669] dark:text-emerald-400 border-b dark:border-zinc-100/10 pb-3">
                <span>× Driver %</span>
                <span>{activeArrangement.percentage}%</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-1 text-indigo-600 dark:text-indigo-400">
                <span>Estimated Share</span>
                <span>SAR {actualShare.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </CardContent>
          </Card>
          <p className="text-[11px] text-zinc-500 text-center px-4 leading-relaxed">
            ⓘ This is an estimate based on your logged rides. Final payout may be adjusted by company management.
          </p>
        </section>

        {/* HISTORY */}
        <section className="space-y-3 pt-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-2 flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Arrangement History
          </h3>
          
          <div className="space-y-2">
            {history.map((arr, i) => (
              <Card key={i} className={`border-zinc-200 dark:border-zinc-800 shadow-sm ${arr.status === 'Ended' ? 'opacity-60 bg-zinc-50 dark:bg-zinc-900/50' : 'border-emerald-200 dark:border-emerald-900/50'}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{arr.percentage}% of {arr.calculationBasis}</h4>
                    <p className="text-xs text-zinc-500 mt-1">
                      {new Date(arr.effectiveFrom).toLocaleDateString()} &rarr; {arr.effectiveTo ? new Date(arr.effectiveTo).toLocaleDateString() : 'Present'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${arr.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                      {arr.status}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* REPORT ISSUE */}
        <button className="w-full flex items-center justify-center gap-2 p-4 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors border border-transparent hover:border-rose-200 dark:hover:border-rose-900">
          <ShieldAlert className="h-4 w-4" />
          Report Incorrect Information
        </button>

      </main>
    </div>
  );
}
