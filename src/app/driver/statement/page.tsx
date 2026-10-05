'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDriver } from '@/contexts/DriverContext';
import { currentMonth, monthLabel, previousMonth } from '@/lib/data/settlements';
import { driverStatementCsv, fetchDriverStatement, type DriverStatement } from '@/lib/data/reports';
import { downloadCsv } from '@/lib/csv';
import { DriverStatementView } from '@/components/reports/DriverStatementView';

// The driver's own monthly statement (Phase 7F): the settlement with every
// ride, voucher, expense and handover behind it. Needs a connection.
export default function DriverStatementPage() {
  const { driverId, driverName } = useDriver();
  const [month, setMonth] = useState(previousMonth());
  const [st, setSt] = useState<DriverStatement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    let current = true;
    fetchDriverStatement(driverId, month)
      .then(s => { if (current) { setSt(s); setFailed(false); } })
      .catch(() => { if (current) { setSt(null); setFailed(true); } });
    return () => { current = false; };
  }, [driverId, month]);

  const shown = st && st.settlement.period_start.startsWith(month) ? st : null;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950 print:bg-white">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm print:hidden">
        <Link href="/driver/cash" className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-bold text-lg tracking-tight">MY STATEMENT</h1>
      </header>

      <main className="flex-1 p-4 pb-32 space-y-4 print:p-0">
        <div className="flex items-center gap-2 print:hidden">
          {[previousMonth(), currentMonth()].map(m => (
            <button key={m} onClick={() => setMonth(m)}
              className={`text-sm px-3 py-1.5 rounded-lg border ${m === month ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'}`}>
              {monthLabel(m)}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" disabled={!shown} className="h-8 px-2"
              onClick={() => shown && downloadCsv(`statement-${month}.csv`, driverStatementCsv(shown, driverName || 'Driver'))}>
              <Download className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={!shown} className="h-8 px-2" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {failed ? (
          <p className="text-sm text-zinc-500 text-center py-10">Connect to the internet to see your statement.</p>
        ) : !shown ? (
          <p className="text-sm text-zinc-400 text-center py-10">Loading…</p>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 print:border-0 print:p-0">
            <DriverStatementView st={shown} driverName={driverName || 'Driver'} who="driver" />
          </div>
        )}
      </main>
    </div>
  );
}
