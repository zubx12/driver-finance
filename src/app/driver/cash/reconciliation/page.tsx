'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, CheckCircle2, AlertTriangle, Scale } from 'lucide-react';
import Link from 'next/link';
import { calculateCashInHand } from '@/lib/finance-service';

export default function CashReconciliationPage() {
  const router = useRouter();
  
  const allRides = useLiveQuery(() => db.rides.toArray(), [], []);
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), [], []);
  const allHandovers = useLiveQuery(() => db.cashHandovers.toArray(), [], []);

  const [actualCash, setActualCash] = useState('');
  const [reason, setReason] = useState('');
  const [explanation, setExplanation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const expectedCash = calculateCashInHand(allRides, allExpenses, allHandovers);
  const difference = (Number(actualCash) || 0) - expectedCash;
  const isBalanced = difference === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actualCash === '' || isNaN(Number(actualCash))) return;
    if (!isBalanced && (!reason || !explanation.trim())) return;
    
    setIsSubmitting(true);
    
    const reconciliation = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      expectedCash,
      actualCash: Number(actualCash),
      difference,
      reason: !isBalanced ? reason : undefined,
      explanation: !isBalanced ? explanation : undefined,
      syncStatus: 'pending' as const,
      createdAt: Date.now(),
    };

    await db.cashReconciliations.add(reconciliation);
    
    setIsSubmitting(false);
    router.push('/driver/cash');
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <Link href="/driver/cash" className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-bold text-lg tracking-tight">Daily Reconciliation</h1>
      </header>

      <main className="flex-1 p-4 pb-32">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-xl flex items-start gap-3 border border-emerald-100 dark:border-emerald-900/50">
            <Scale className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Balance Check</h3>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Count the physical cash you have with you and compare it to the expected amount to ensure your ledger is correct.</p>
            </div>
          </div>

          <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-4 border-b dark:border-zinc-800">
              <span className="text-zinc-500 font-medium">Expected Cash</span>
              <span className="text-xl font-bold">SAR {expectedCash.toLocaleString()}</span>
            </div>

            <div className="space-y-2 pt-2">
              <Label htmlFor="actualCash" className="text-zinc-900 dark:text-zinc-100 font-semibold text-base">Actual Cash With Me</Label>
              <div className="relative">
                <Input
                  id="actualCash"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  className="text-3xl h-16 pl-4 font-bold rounded-xl border-zinc-300 dark:border-zinc-700 focus-visible:ring-indigo-500 bg-zinc-50 dark:bg-zinc-950"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium">
                  SAR
                </div>
              </div>
            </div>
          </section>

          {actualCash !== '' && !isNaN(Number(actualCash)) && (
            <section className={`rounded-2xl p-5 border shadow-sm space-y-4 transition-all ${
              isBalanced 
                ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50' 
                : 'bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/50'
            }`}>
              <div className="flex justify-between items-center">
                <span className={`font-medium ${isBalanced ? 'text-emerald-800' : 'text-rose-800'}`}>Difference</span>
                <span className={`text-xl font-bold ${isBalanced ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {difference > 0 ? '+' : ''}{difference.toFixed(2)} SAR
                </span>
              </div>
              
              <div className="flex items-center gap-2 pt-2 border-t border-black/5 dark:border-white/5">
                {isBalanced ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="font-semibold text-emerald-700 text-sm">Cash Balanced</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    <span className="font-semibold text-rose-700 text-sm">
                      {difference > 0 ? 'Cash Overage' : 'Cash Shortage'}
                    </span>
                  </>
                )}
              </div>
            </section>
          )}

          {!isBalanced && actualCash !== '' && !isNaN(Number(actualCash)) && (
            <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2">
              <h2 className="font-semibold text-lg flex items-center gap-2 text-rose-600">
                Action Required
              </h2>
              <p className="text-sm text-zinc-500">Please explain the discrepancy.</p>
              
              <div className="space-y-2">
                <Label htmlFor="reason" className="text-zinc-500">Reason</Label>
                <select
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required={!isBalanced}
                  className="flex h-12 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="" disabled>Select Reason</option>
                  <option value="Forgot to record expense">Forgot to record expense</option>
                  <option value="Forgot to record cash ride">Forgot to record cash ride</option>
                  <option value="Cash adjustment">Cash adjustment</option>
                  <option value="Previous balance correction">Previous balance correction</option>
                  <option value="Personal payment">Personal payment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="explanation" className="text-zinc-500 flex justify-between">
                  Explanation
                  <span className="text-xs font-normal text-rose-500 uppercase tracking-wider bg-rose-50 dark:bg-rose-500/10 px-2 py-1 rounded">Required</span>
                </Label>
                <Input
                  id="explanation"
                  type="text"
                  placeholder="Provide more details"
                  required={!isBalanced}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="h-12 rounded-xl border-zinc-300 dark:border-zinc-700 focus-visible:ring-rose-500"
                />
              </div>
            </section>
          )}

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t dark:border-zinc-800 pb-safe">
            <Button 
              type="submit" 
              disabled={isSubmitting || actualCash === '' || isNaN(Number(actualCash)) || (!isBalanced && (!reason || !explanation.trim()))}
              className="w-full h-14 text-lg rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg gap-2 transition-all disabled:opacity-50 disabled:shadow-none"
            >
              <CheckCircle2 className="h-5 w-5" />
              Submit Reconciliation
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
