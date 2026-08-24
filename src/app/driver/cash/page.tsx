'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, PlusCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { 
  calculateCashInHand, 
  generateLedger, 
  INITIAL_OPENING_CASH, 
  calculateCashRevenue,
  calculateCashExpenses,
  calculateTotalHandovers
} from '@/lib/finance-service';

export default function DriverCashPage() {
  const allRides = useLiveQuery(() => db.rides.toArray(), [], []);
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), [], []);
  const allHandovers = useLiveQuery(() => db.cashHandovers.toArray(), [], []);

  const cashInHand = calculateCashInHand(allRides, allExpenses, allHandovers);
  const ledger = generateLedger(allRides, allExpenses, allHandovers).reverse(); // Newest first

  const totalCashRides = calculateCashRevenue(allRides);
  const totalCashExpenses = calculateCashExpenses(allExpenses);
  const totalHandovers = calculateTotalHandovers(allHandovers);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <Link href="/driver" className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-bold text-lg tracking-tight">MY CASH</h1>
      </header>

      <main className="flex-1 p-4 pb-32 space-y-6">
        
        {/* BIG BALANCE CARD */}
        <Card className="border-indigo-600 bg-indigo-600 text-white shadow-lg overflow-hidden">
          <CardHeader className="p-5 pb-2 text-center">
            <CardTitle className="text-sm font-medium text-indigo-100 uppercase tracking-wider">
              Expected Cash in Hand
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 text-center">
            <div className="text-5xl font-bold tracking-tight">
              SAR {cashInHand.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        {/* CASH BREAKDOWN */}
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="p-0 divide-y dark:divide-zinc-800">
            <div className="flex justify-between p-4 text-sm">
              <span className="text-zinc-500">Opening Cash</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">SAR {INITIAL_OPENING_CASH.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-4 text-sm">
              <span className="text-emerald-600 flex items-center gap-1"><ArrowDownToLine className="w-4 h-4"/> Cash Revenue</span>
              <span className="font-semibold text-emerald-600">+ SAR {totalCashRides.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-4 text-sm">
              <span className="text-rose-600 flex items-center gap-1"><ArrowUpFromLine className="w-4 h-4"/> Cash Expenses</span>
              <span className="font-semibold text-rose-600">- SAR {totalCashExpenses.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-4 text-sm">
              <span className="text-amber-600 flex items-center gap-1"><ArrowUpFromLine className="w-4 h-4"/> Cash Handed Over</span>
              <span className="font-semibold text-amber-600">- SAR {totalHandovers.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-4 text-sm bg-zinc-50 dark:bg-zinc-900/50">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">Expected Cash</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">SAR {cashInHand.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* ACTIONS */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/driver/cash/handover">
            <Button className="w-full h-12 bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 shadow-sm gap-2">
              <ArrowUpFromLine className="w-4 h-4" /> Handover
            </Button>
          </Link>
          <Link href="/driver/cash/reconciliation">
            <Button className="w-full h-12 bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-50 shadow-sm gap-2">
              <CheckCircle className="w-4 h-4" /> Reconcile
            </Button>
          </Link>
        </div>

        {/* CASH LEDGER */}
        <div className="space-y-4">
          <h2 className="font-bold text-lg px-1">Cash Ledger</h2>
          <div className="space-y-3">
            {ledger.map((entry) => (
              <Card key={entry.id} className="border-zinc-200 shadow-sm overflow-hidden">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm">{entry.type}</p>
                      <p className="text-xs text-zinc-500">{entry.description}</p>
                      <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wider">{entry.date}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${entry.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {entry.isPositive ? '+' : '-'} SAR {entry.amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t text-xs">
                    <span className="text-zinc-500">Running Balance</span>
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">SAR {entry.runningBalance.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
