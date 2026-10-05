'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { fetchDriverStatement, type DriverStatement } from '@/lib/data/reports';
import { SettlementBreakdown, balanceWords } from '@/components/SettlementBreakdown';

// Driver workspace, "Cash & vouchers" tab: the month's cash with the office
// (the settlement, 7D) and the driver's vouchers grouped by payer, each with
// who collected it and which partners hold it (7E).

interface DriverVoucher {
  ride_id: string; date: string; vehicle: string | null; payer_id: string | null; payer: string | null;
  reference: string | null; amount: number; status: string;
  collected_by: string | null; collected_by_role: string | null; collected_at: string | null;
  handed_to: { partner: string; percentage: number; amount: number; paid_out_at: string | null }[];
}

const money = (n: number) => Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HANDOVER_STATUS: Record<string, string> = { submitted: 'Waiting for the office', confirmed: 'Confirmed', disputed: 'Disputed' };

export function DriverCashVouchers({ driverId, month, monthStart, monthEnd }: {
  driverId: string; month: string; monthStart: string; monthEnd: string;
}) {
  const [st, setSt] = useState<DriverStatement | null>(null);
  const [vouchers, setVouchers] = useState<DriverVoucher[] | null>(null);
  const [scope, setScope] = useState<'month' | 'outstanding'>('month');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    fetchDriverStatement(driverId, month)
      .then(s => { if (current) setSt(s); })
      .catch(e => { if (current) setError((e as Error).message); });
    return () => { current = false; };
  }, [driverId, month]);

  useEffect(() => {
    let current = true;
    const args = scope === 'month'
      ? { p_driver_id: driverId, p_from: monthStart, p_to: monthEnd }
      : { p_driver_id: driverId, p_outstanding_only: true };
    createClient().rpc('get_driver_vouchers', args).then(({ data, error: err }) => {
      if (!current) return;
      if (err) setError(err.message); else setVouchers((data ?? []) as DriverVoucher[]);
    });
    return () => { current = false; };
  }, [driverId, monthStart, monthEnd, scope]);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;

  const groups = new Map<string, { payer: string; items: DriverVoucher[] }>();
  for (const v of vouchers ?? []) {
    const key = v.payer_id ?? 'none';
    if (!groups.has(key)) groups.set(key, { payer: v.payer ?? 'No payer recorded', items: [] });
    groups.get(key)!.items.push(v);
  }
  const total = (xs: DriverVoucher[], f?: (v: DriverVoucher) => boolean) =>
    xs.filter(f ?? (() => true)).reduce((t, v) => t + Number(v.amount), 0);
  const handed = st?.handovers ?? [];
  const byStatus = (s: string) => handed.filter(h => h.status === s).reduce((t, h) => t + Number(h.amount), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Cash with the office this month</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!st ? <div className="h-32 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" /> : (
              <>
                <SettlementBreakdown s={st.settlement} />
                <p className="text-sm font-semibold">
                  {balanceWords(st.settlement.status === 'closed' ? (st.settlement.carried_forward ?? 0) : st.settlement.closing_balance, 'office')}
                  {st.settlement.status === 'closed' ? ' (settled)' : ''}
                </p>
                {st.settlement.status === 'open' && (
                  <Link href={`/admin/month-end?tab=drivers&month=${month}`} className="text-xs text-indigo-600">Settle in Month End →</Link>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Cash handovers this month</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Confirmed', byStatus('confirmed'), 'text-emerald-600'], ['Waiting', byStatus('submitted'), 'text-amber-600'],
                ['Disputed', byStatus('disputed'), 'text-rose-600']].map(([label, amount, cls]) => (
                <div key={label as string} className="rounded-lg bg-zinc-50 dark:bg-zinc-900/50 p-2">
                  <p className="text-xs text-zinc-500">{label}</p>
                  <p className={`font-bold ${cls}`}>{money(amount as number)}</p>
                </div>
              ))}
            </div>
            {handed.length === 0 ? <p className="text-zinc-400">No handovers this month.</p> : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {handed.map((h, i) => (
                  <li key={i} className="flex justify-between gap-2 py-1.5">
                    <span>{h.date} · {h.method === 'bank_transfer' ? 'bank transfer' : 'cash'}{h.reference ? ` · ref ${h.reference}` : ''}
                      <span className="block text-xs text-zinc-500">{HANDOVER_STATUS[h.status] ?? h.status}{h.admin_note ? ` · ${h.admin_note}` : ''}</span></span>
                    <span className="font-mono">{money(h.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold">Vouchers by payer</CardTitle>
          <div className="flex gap-1" role="group" aria-label="Which vouchers">
            {([['month', 'This month'], ['outstanding', 'All outstanding']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setScope(k)} aria-pressed={scope === k}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${scope === k ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {!vouchers ? <div className="h-20 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
            : vouchers.length === 0 ? <p className="text-sm text-zinc-400">{scope === 'month' ? 'No vouchers this month.' : 'No outstanding vouchers.'}</p>
            : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {[...groups.entries()].map(([key, g]) => (
                <div key={key} className="py-2">
                  <button onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))} aria-expanded={!!open[key]}
                    className="w-full flex items-center gap-2 text-left text-sm">
                    {open[key] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-semibold flex-1">{g.payer}</span>
                    <span className="text-xs text-zinc-500">{g.items.length} voucher{g.items.length === 1 ? '' : 's'}</span>
                    <span className="text-xs text-emerald-600 w-28 text-right">collected {money(total(g.items, v => v.status === 'Collected'))}</span>
                    <span className="text-xs text-amber-600 w-28 text-right">outstanding {money(total(g.items, v => v.status === 'Outstanding'))}</span>
                    <span className="font-mono w-24 text-right">{money(total(g.items))}</span>
                  </button>
                  {open[key] && (
                    <ul className="mt-2 ml-6 space-y-1 text-xs">
                      {g.items.map(v => (
                        <li key={v.ride_id} className="flex justify-between gap-3 rounded-md bg-zinc-50 dark:bg-zinc-900/40 px-3 py-1.5">
                          <span>
                            {v.date}{v.vehicle ? ` · ${v.vehicle}` : ''}{v.reference ? ` · ref ${v.reference}` : ''} · <b>{v.status}</b>
                            {v.collected_by && ` · collected by ${v.collected_by} (${v.collected_by_role})${v.collected_at ? ` on ${v.collected_at.slice(0, 10)}` : ''}`}
                            {v.handed_to.length > 0 && ` · held by ${v.handed_to.map(h => `${h.partner} ${h.percentage}%`).join(', ')}`}
                          </span>
                          <span className="font-mono">{money(v.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
