'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, ArrowRight, CheckCircle2, Circle, Lock, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { currentMonth, monthLabel, previousMonth } from '@/lib/data/settlements';

// Month-end close (money-flow plan §6, Phase 7G): the steps in the order the
// money moves, what is still open in each, and the office's sign-off.

interface CloseStatus {
  period_start: string;
  period_end: string;
  month_ended: boolean;
  handovers_to_review: { count: number; amount: number };
  expenses_to_review: { count: number; amount: number };
  vehicles: { vehicle_id: string; vehicle: string; status: 'missing' | 'draft' | 'finalized'; net_revenue: number | null }[];
  drivers: { driver_id: string; driver: string; status: 'open' | 'closed'; closing_balance: number; carried_forward: number | null }[];
  shares: { settlement_id: string; partner: string; vehicle: string; amount: number; status: string; cash_amount: number | null; voucher_amount: number | null }[];
  vouchers_owed_to_partners: { count: number; amount: number };
  open_items: string[];
  ready_to_close: boolean;
  closed: boolean;
  closed_at: string | null;
  close_note: string | null;
}

const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchStatus(month: string): Promise<CloseStatus> {
  const { data, error } = await createClient().rpc('get_month_close_status', { p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return data as CloseStatus;
}

function Step({ n, title, done, href, action, children }: {
  n: number; title: string; done: boolean; href: string; action: string; children: React.ReactNode;
}) {
  return (
    <Card className={`rounded-xl ${done ? 'border-emerald-200 dark:border-emerald-900/50' : 'border-zinc-200 dark:border-zinc-800'}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> : <Circle className="h-5 w-5 text-zinc-400 shrink-0" />}
          <span className="font-bold">{n}. {title}</span>
          {!done && (
            <Link href={href} className="ml-auto text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              {action}<ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        <div className="text-sm text-zinc-600 dark:text-zinc-400 pl-7 space-y-1">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function MonthClosePage() {
  const [month, setMonth] = useState(previousMonth());
  const [status, setStatus] = useState<CloseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  const reload = useCallback(async (m: string) => {
    try {
      setStatus(await fetchStatus(m));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let current = true;
    fetchStatus(month)
      .then(s => { if (current) { setStatus(s); setError(null); setLoading(false); } })
      .catch(e => { if (current) { setError((e as Error).message); setLoading(false); } });
    return () => { current = false; };
  }, [month]);

  const changeMonth = (m: string) => {
    if (!m || m === month) return;
    setLoading(true); setNotice(null); setNote(''); setReason('');
    setMonth(m);
  };

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) => {
    setBusy(true); setError(null); setNotice(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice(done);
    setNote(''); setReason('');
    await reload(month);
  };

  const s = status;
  const vehiclesOpen = s?.vehicles.filter(v => v.status !== 'finalized') ?? [];
  const driversOpen = s?.drivers.filter(d => d.status !== 'closed') ?? [];
  const sharesOpen = s?.shares.filter(x => x.status !== 'paid') ?? [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Month-End Close</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Close each month in order: review, finalize payouts, settle drivers, pay partners, then sign off.
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

      {loading || !s ? (
        <div className="text-center text-zinc-400 py-12 text-sm">{loading ? 'Loading checklist…' : ''}</div>
      ) : (
        <>
          {s.closed && (
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-3 text-sm">
              <Lock className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <b>{monthLabel(month)} is closed</b>{s.closed_at ? ` on ${new Date(s.closed_at).toLocaleDateString('en-GB')}` : ''}
                {s.close_note ? `. Note: ${s.close_note}` : ''}
              </span>
            </div>
          )}

          <Step n={0} title="Before closing" href={s.handovers_to_review.count ? '/admin/handovers' : '/admin/expense-review'}
            action="Review"
            done={s.month_ended && s.handovers_to_review.count === 0 && s.expenses_to_review.count === 0}>
            {!s.month_ended && <p>The month has not ended yet.</p>}
            <p>Cash handovers to confirm: <b>{s.handovers_to_review.count}</b>{s.handovers_to_review.count > 0 && ` (SAR ${fmt(s.handovers_to_review.amount)})`}
              {s.handovers_to_review.count > 0 && <Link href="/admin/handovers" className="text-indigo-600 ml-2">Cash Handovers</Link>}</p>
            <p>Driver/company expenses to review: <b>{s.expenses_to_review.count}</b>{s.expenses_to_review.count > 0 && ` (SAR ${fmt(s.expenses_to_review.amount)})`}
              {s.expenses_to_review.count > 0 && <Link href="/admin/expense-review" className="text-indigo-600 ml-2">Expense Review</Link>}</p>
          </Step>

          <Step n={1} title="Finalize vehicle payouts" href="/admin/salary" action="Salary Runs" done={vehiclesOpen.length === 0}>
            <p>{s.vehicles.length - vehiclesOpen.length} of {s.vehicles.length} finalized.</p>
            {vehiclesOpen.map(v => (
              <p key={v.vehicle_id}>• {v.vehicle}: {v.status === 'missing' ? 'not calculated' : 'draft'}</p>
            ))}
          </Step>

          <Step n={2} title="Settle drivers" href="/admin/driver-settlements" action="Driver Settlements" done={driversOpen.length === 0}>
            <p>{s.drivers.length - driversOpen.length} of {s.drivers.length} settled.</p>
            {driversOpen.map(d => (
              <p key={d.driver_id}>• {d.driver}: {d.closing_balance > 0 ? `owes the office SAR ${fmt(d.closing_balance)}`
                : d.closing_balance < 0 ? `office owes SAR ${fmt(-d.closing_balance)}` : 'nothing owed'}</p>
            ))}
          </Step>

          <Step n={3} title="Pay partners" href="/admin/settlements" action="Partner Settlements" done={sharesOpen.length === 0}>
            <p>{s.shares.length - sharesOpen.length} of {s.shares.length} shares paid.</p>
            {sharesOpen.map(x => <p key={x.settlement_id}>• {x.partner} ({x.vehicle}): SAR {fmt(x.amount)}</p>)}
            {s.vouchers_owed_to_partners.count > 0 && (
              <p className="text-amber-700 dark:text-amber-400">
                Also: {s.vouchers_owed_to_partners.count} voucher part(s) collected by someone else are owed to partners
                (SAR {fmt(s.vouchers_owed_to_partners.amount)}, any month): Partner Settlements → Vouchers.
              </p>
            )}
          </Step>

          <Card className="rounded-xl border-zinc-200 dark:border-zinc-800">
            <CardContent className="p-4 space-y-3">
              {s.closed ? (
                <div className="flex flex-wrap gap-2">
                  <Input placeholder="Reason to reopen" value={reason} onChange={e => setReason(e.target.value)} className="h-9 flex-1 min-w-48" />
                  <Button variant="outline" disabled={busy || !reason.trim()} className="h-9 gap-2"
                    onClick={() => run(() => createClient().rpc('reopen_month', { p_month: `${month}-01`, p_reason: reason }), `${monthLabel(month)} reopened.`)}>
                    <RotateCcw className="h-4 w-4" />Reopen month
                  </Button>
                </div>
              ) : s.ready_to_close ? (
                <div className="flex flex-wrap gap-2">
                  <Input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} className="h-9 flex-1 min-w-48" />
                  <Button disabled={busy} className="h-9 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => run(() => createClient().rpc('close_month', { p_month: `${month}-01`, p_note: note || null }), `${monthLabel(month)} closed.`)}>
                    <Lock className="h-4 w-4" />Close {monthLabel(month)}
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-zinc-500">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300">{s.open_items.length} item(s) still open:</p>
                  <ul className="mt-1 space-y-0.5">{s.open_items.map(i => <li key={i}>• {i}</li>)}</ul>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
