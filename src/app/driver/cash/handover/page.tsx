'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/dexie';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, CheckCircle2, Building, ArrowUpFromLine } from 'lucide-react';
import Link from 'next/link';

export default function CashHandoverPage() {
  const router = useRouter();
  
  const [amount, setAmount] = useState('');
  const [handedTo, setHandedTo] = useState('Office Manager');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
    if (!handedTo) return;
    
    setIsSubmitting(true);
    
    const handover = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      amount: Number(amount),
      handedTo,
      reference,
      notes,
      syncStatus: 'pending' as const,
      createdAt: Date.now(),
    };

    await db.cashHandovers.add(handover);
    
    setIsSubmitting(false);
    router.push('/driver/cash');
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <Link href="/driver/cash" className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-bold text-lg tracking-tight">Cash Handover</h1>
      </header>

      <main className="flex-1 p-4 pb-32">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-xl flex items-start gap-3 border border-blue-100 dark:border-blue-900/50">
            <Building className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Office Handover</h3>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Record physical cash handed over to the company office. This will instantly reduce your Expected Cash in Hand.</p>
            </div>
          </div>

          <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              Amount to Hand Over
            </h2>
            <div className="space-y-2">
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-3xl h-16 pl-4 font-bold rounded-xl border-zinc-300 dark:border-zinc-700 focus-visible:ring-indigo-500"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium">
                  SAR
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="space-y-2">
              <Label htmlFor="handedTo" className="text-zinc-500">Handed To *</Label>
              <select
                id="handedTo"
                value={handedTo}
                onChange={(e) => setHandedTo(e.target.value)}
                required
                className="flex h-12 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="Office Manager">Office Manager</option>
                <option value="Cashier">Cashier</option>
                <option value="Supervisor">Supervisor</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference" className="text-zinc-500">Receipt / Reference (Optional)</Label>
              <Input
                id="reference"
                type="text"
                placeholder="e.g. REC-5849"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="h-12 rounded-xl border-zinc-300 dark:border-zinc-700 focus-visible:ring-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-zinc-500">Notes (Optional)</Label>
              <Input
                id="notes"
                type="text"
                placeholder="Additional details"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-12 rounded-xl border-zinc-300 dark:border-zinc-700 focus-visible:ring-indigo-500"
              />
            </div>
          </section>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t dark:border-zinc-800 pb-safe">
            <Button 
              type="submit" 
              disabled={isSubmitting || !amount || Number(amount) <= 0}
              className="w-full h-14 text-lg rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg gap-2 transition-all disabled:opacity-50 disabled:shadow-none"
            >
              <ArrowUpFromLine className="h-5 w-5" />
              Confirm Handover
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
