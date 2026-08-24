'use client';

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { useDriver } from '@/contexts/DriverContext';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Lock, ShieldAlert, TrendingUp } from 'lucide-react';

export default function RevenueSharePage() {
  const router = useRouter();
  const { payType, commissionRate, fixedSalary, bonusRate, vehicleMake, vehicleModel, loading } = useDriver();

  const allRides = useLiveQuery(() => db.rides.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];

  const totalRevenue = allRides.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netRevenue = totalRevenue - totalExpenses;

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isCommission = payType === 'commission';
  const rate = commissionRate ?? 0;
  const bonus = bonusRate ?? 0;
  const salary = fixedSalary ?? 0;

  const estimatedShare = isCommission
    ? (netRevenue > 0 ? netRevenue * (rate / 100) : 0)
    : salary + (bonus > 0 && netRevenue > 0 ? netRevenue * (bonus / 100) : 0);

  if (loading) return <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.back()} className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg tracking-tight">Revenue Arrangement</h1>
      </header>

      <main className="flex-1 p-4 pb-24 space-y-6">

        {/* HERO CARD */}
        <div style={{ backgroundColor: '#059669' }} className="rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-20">
            <TrendingUp className="h-48 w-48 -mr-10" />
          </div>
          <div className="relative z-10 space-y-2">
            <h2 className="text-sm font-bold text-emerald-100 uppercase tracking-widest">
              {isCommission ? 'Estimated Earnings' : 'Fixed Salary + Bonus'}
            </h2>
            <div className="text-5xl font-extrabold tracking-tight">SAR {fmt(estimatedShare)}</div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold tracking-wide backdrop-blur-sm">
                {allRides.length} RIDES
              </span>
              {isCommission ? (
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold tracking-wide backdrop-blur-sm">
                  YOUR SHARE: {rate}%
                </span>
              ) : (
                <>
                  <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold tracking-wide backdrop-blur-sm">
                    SALARY: SAR {fmt(salary)}/mo
                  </span>
                  {bonus > 0 && (
                    <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold tracking-wide backdrop-blur-sm">
                      BONUS: {bonus}%
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* LOCK NOTE */}
        <div className="flex items-start gap-2 bg-zinc-100 dark:bg-zinc-900 p-3 rounded-lg border dark:border-zinc-800">
          <Lock className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Your pay arrangement is configured by company management and cannot be changed from the Driver App.
          </p>
        </div>

        {/* CALCULATION BREAKDOWN */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-2">Breakdown</h3>
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900">
            <CardContent className="p-5 font-mono text-sm space-y-3">
              <div className="flex justify-between text-zinc-500">
                <span>Total Revenue</span>
                <span>SAR {fmt(totalRevenue)}</span>
              </div>
              <div className="flex justify-between text-rose-500 border-b dark:border-zinc-100/10 pb-3">
                <span>− Total Expenses</span>
                <span>SAR {fmt(totalExpenses)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1">
                <span>Net Revenue</span>
                <span>SAR {fmt(netRevenue)}</span>
              </div>

              {isCommission ? (
                <>
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 border-b dark:border-zinc-100/10 pb-3">
                    <span>× Commission Rate</span>
                    <span>{rate}%</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-1 text-indigo-600 dark:text-indigo-400">
                    <span>Estimated Share</span>
                    <span>SAR {fmt(estimatedShare)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-indigo-600 dark:text-indigo-400 pt-1">
                    <span>Fixed Salary</span>
                    <span>SAR {fmt(salary)}</span>
                  </div>
                  {bonus > 0 && (
                    <>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 border-b dark:border-zinc-100/10 pb-3">
                        <span>+ Bonus ({bonus}% of net)</span>
                        <span>SAR {fmt(netRevenue > 0 ? netRevenue * (bonus / 100) : 0)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg pt-1 text-indigo-600 dark:text-indigo-400">
                        <span>Total Pay</span>
                        <span>SAR {fmt(estimatedShare)}</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          <p className="text-[11px] text-zinc-500 text-center px-4 leading-relaxed">
            ℹ This is an estimate based on your logged rides. Final payout is set by admin.
          </p>
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