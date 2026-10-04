'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2, Lock, RotateCcw } from 'lucide-react';
import {
  closeSettlement, currentMonth, fetchSettlements, monthLabel, previousMonth, reopenSettlement,
  type DriverSettlement,
} from '@/lib/data/settlements';
import { SettlementBreakdown, balanceWords } from '@/components/SettlementBreakdown';

// Each driver is cleared with the office once a month (owner decisions M2/M4):
// the driver keeps their pay from the cash in hand, hands over the rest, or the
// office pays the difference now or carries it to next month. The calculation,
// the order of months and the lock on settled entries live in the database.

interface CloseForm { amount: string; method: 'cash' | 'bank_transfer'; reference: string; note: string; }
const emptyForm = (s: DriverSettlement): CloseForm => ({
  amount: Math.abs(s.closing_balance).toFixed(2), method: 'cash', reference: '', note: '',
});

export default function AdminDriverSettlementsPage() {
  const [month, setMonth] = useState(previousMonth());
  const [rows, setRows] = useState<DriverSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, CloseForm>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async (m: string) => {
    try {
      setRows(await fetchSettlements(m));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let current = true;
    fetchSettlements(month)
      .then(r => { if (current) { setRows(r); setError(null); setLoading(false); } })
      .catch(e => { if (current) { setError((e as Error).message); setLoading(false); } });
    return () => { current = false; };
  }, [month]);

  const changeMonth = (m: string) => {
    if (!m || m === month) return;
    setLoading(true); setNotice(null); setForms({});
    setMonth(m);
  };

  const close = async (s: DriverSettlement) => {
    const f = forms[s.driver_id] ?? emptyForm(s);
    const amount = Number(f.amount || 0);
    if (!Number.isFinite(amount) || amount < 0 || amount > Math.abs(s.closing_balance) + 0.001) {
      setError(`The amount paid now must be between 0 and ${Math.abs(s.closing_balance).toFixed(2)}.`);
      return;
    }
    setBusy(s.driver_id); setError(null); setNotice(null);
    try {
      await closeSettlement({
        driverId: s.driver_id, month, settledAmount: amount,
        method: amount > 0 ? f.method : null, reference: f.reference, note: f.note,
      });
      const carried = s.closing_balance - Math.sign(s.closing_balance) * amount;
      setNotice(`${s.driver_name ?? 'Driver'}: ${monthLabel(month)} settled${carried !== 0 ? `, SAR ${Math.abs(carried).toFixed(2)} carried to next month` : ''}.`);
      await load(month);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  const reopen = async (s: DriverSettlement) => {
    const reason = (reasons[s.driver_id] ?? '').trim();
    if (!reason) { setError('Write why the settlement is reopened.'); return; }
    setBusy(s.driver_id); setError(null); setNotice(null);
    try {
      await reopenSettlement(s.driver_id, month, reason);
      setNotice(`${s.driver_name ?? 'Driver'}: ${monthLabel(month)} reopened.`);
      await load(month);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  const open = rows.filter(r => r.status === 'open');
  const owedToOffice = open.filter(r => r.closing_balance > 0).reduce((t, r) => t + r.closing_balance, 0);
  const owedToDrivers = open.filter(r => r.closing_balance < 0).reduce((t, r) => t - r.closing_balance, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Driver Settlements</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Clear each driver once a month: cash collected, expenses they paid, their pay and what they handed over.
          </p>
        </div>
        <label className="text-xs font-semibold text-zinc-500 space-y-1">
          <span>Month</span>
          <Input type="month" max={currentMonth()} value={month} onChange={e => changeMonth(e.target.value)} className="h-9 w-44" />
        </label>
      </header>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-xl flex items-center gap-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{notice}
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-400 py-12 text-sm">Loading settlements…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-zinc-400 py-12 text-sm">No driver has anything to settle for {monthLabel(month)}.</div>
      ) : (
        <>
          <div className="text-sm text-zinc-500">
            {monthLabel(month)} · {rows.length - open.length} of {rows.length} settled
            {open.length > 0 && ` · open: drivers owe SAR ${owedToOffice.toFixed(2)}, office owes SAR ${owedToDrivers.toFixed(2)}`}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map(s => {
              const f = forms[s.driver_id] ?? emptyForm(s);
              const setF = (patch: Partial<CloseForm>) => setForms(all => ({ ...all, [s.driver_id]: { ...f, ...patch } }));
              const ready = s.status === 'open' && s.blockers.length === 0;
              return (
                <Card key={s.driver_id} className="border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{s.driver_name ?? 'Driver'}</span>
                      {s.status === 'closed' ? (
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1"><Lock className="h-3.5 w-3.5" />Settled</span>
                      ) : (
                        <span className="text-xs font-semibold text-zinc-500">{balanceWords(s.closing_balance, 'office')}</span>
                      )}
                    </div>

                    <SettlementBreakdown s={s} />

                    {s.status === 'open' && s.blockers.length > 0 && (
                      <ul className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2 space-y-0.5">
                        {s.blockers.map(b => <li key={b}>• {b}</li>)}
                      </ul>
                    )}

                    {ready && (
                      <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                        <div className="text-xs text-zinc-500">
                          {s.closing_balance > 0 ? 'Received from the driver now' : s.closing_balance < 0 ? 'Paid to the driver now' : 'Nothing to pay'}
                          {s.closing_balance !== 0 && ' (the rest is carried to next month)'}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="number" min="0" step="0.01" disabled={s.closing_balance === 0}
                            value={f.amount} onChange={e => setF({ amount: e.target.value })} className="h-8 text-xs" />
                          <select value={f.method} disabled={s.closing_balance === 0}
                            onChange={e => setF({ method: e.target.value as CloseForm['method'] })}
                            className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-xs">
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Bank transfer</option>
                          </select>
                          <Input placeholder="Reference (optional)" value={f.reference} onChange={e => setF({ reference: e.target.value })} className="h-8 text-xs" />
                          <Input placeholder="Note (optional)" value={f.note} onChange={e => setF({ note: e.target.value })} className="h-8 text-xs" />
                        </div>
                        <Button size="sm" disabled={busy === s.driver_id} onClick={() => close(s)}
                          className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
                          {busy === s.driver_id ? 'Saving…' : `Settle ${monthLabel(month)}`}
                        </Button>
                      </div>
                    )}

                    {s.status === 'closed' && (
                      <div className="flex gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                        {s.note && <span className="text-xs text-zinc-500 flex-1">Note: {s.note}</span>}
                        <Input placeholder="Reason to reopen" value={reasons[s.driver_id] ?? ''}
                          onChange={e => setReasons(r => ({ ...r, [s.driver_id]: e.target.value }))} className="h-8 text-xs flex-1" />
                        <Button size="sm" variant="outline" disabled={busy === s.driver_id} onClick={() => reopen(s)} className="h-8 text-xs">
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />Reopen
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
