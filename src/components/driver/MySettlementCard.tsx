'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Lock } from 'lucide-react';
import { useDriver } from '@/contexts/DriverContext';
import { currentMonth, fetchSettlement, monthLabel, previousMonth, type DriverSettlement } from '@/lib/data/settlements';
import { SettlementBreakdown, balanceWords } from '@/components/SettlementBreakdown';

/**
 * The driver's monthly settlement with the office (Phase 7D), as the office
 * sees it: only confirmed handovers and finalized pay count. Needs a connection.
 */
export function MySettlementCard() {
  const { driverId } = useDriver();
  const [month, setMonth] = useState(previousMonth());
  const [data, setData] = useState<DriverSettlement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    let current = true;
    fetchSettlement(driverId, month)
      .then(s => { if (current) { setData(s); setFailed(false); } })
      .catch(() => { if (current) { setData(null); setFailed(true); } });
    return () => { current = false; };
  }, [driverId, month]);

  const months = [previousMonth(), currentMonth()];
  const s = data && data.period_start.startsWith(month) ? data : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-bold text-lg">Monthly Settlement</h2>
        <div className="flex gap-1">
          {months.map(m => (
            <button key={m} onClick={() => setMonth(m)}
              className={`text-xs px-2 py-1 rounded-lg border ${m === month ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'}`}>
              {monthLabel(m).split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardContent className="p-4 space-y-3">
          {failed ? (
            <p className="text-sm text-zinc-500">Connect to the internet to see your settlement.</p>
          ) : !s ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{monthLabel(month)}</span>
                {s.status === 'closed' ? (
                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1"><Lock className="h-3.5 w-3.5" />Settled</span>
                ) : (
                  <span className="text-xs text-zinc-500">{month === currentMonth() ? 'In progress' : 'Waiting for the office'}</span>
                )}
              </div>
              <SettlementBreakdown s={s} />
              <p className="text-sm font-semibold text-center pt-1">
                {balanceWords(s.status === 'closed' ? (s.carried_forward ?? 0) : s.closing_balance, 'driver')}
                {s.status === 'closed' && (s.carried_forward ?? 0) !== 0 ? ' (carried to next month)' : ''}
              </p>
              {s.status === 'open' && s.pay_lines.some(p => p.status !== 'finalized') && (
                <p className="text-[11px] text-zinc-400 text-center">Your pay is added once the office finalizes the month.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
