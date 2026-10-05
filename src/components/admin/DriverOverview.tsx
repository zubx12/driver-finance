'use client';

import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

// Driver workspace, Overview tab: the selected month against the previous
// one, this month / last month / year to date, and the last 12 months.
// Figures come from get_driver_months (settlement figures from
// get_driver_settlement), so they match Driver Settlements and statements.

export interface DriverMonth {
  month: string;
  rides: number; cash_rides: number; voucher_rides: number;
  revenue: number; cash: number; vouchers: number; other: number; vouchers_outstanding: number;
  expenses: number; expenses_total: number; expenses_paid_by_driver: number;
  driver_pay: number; pay_status: 'none' | 'draft' | 'finalized';
  handovers_confirmed: number; vouchers_collected: number;
  settlement_status: 'open' | 'closed';
  closing_balance: number; carried_forward: number | null;
}

const money = (n: number) => Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (m: string, style: 'long' | 'short' = 'long') =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: style, year: 'numeric', timeZone: 'UTC' });

function addMonths(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function Change({ now, before }: { now: number; before: number }) {
  if (!before) return null;
  const pct = ((now - before) / Math.abs(before)) * 100;
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return <span className="text-xs text-zinc-400">no change</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function DriverOverview({ driverId, month, onSelectMonth }: {
  driverId: string;
  /** Selected month, YYYY-MM. */
  month: string;
  onSelectMonth: (month: string) => void;
}) {
  const [rows, setRows] = useState<DriverMonth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    // The last 12 months up to the selected one, and back to January for "year to date".
    const january = `${month.slice(0, 4)}-01`;
    const from = addMonths(month, -11) < january ? addMonths(month, -11) : january;
    createClient().rpc('get_driver_months', { p_driver_id: driverId, p_from: `${from}-01`, p_to: `${month}-01` })
      .then(({ data, error: err }) => {
        if (!current) return;
        if (err) setError(err.message);
        else { setRows((data ?? []) as DriverMonth[]); setError(null); }
      });
    return () => { current = false; };
  }, [driverId, month]);

  if (error) return <p role="alert" className="text-sm text-red-600">The overview could not be loaded: {error}</p>;
  if (!rows) return <div className="h-40 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />;

  const cur = rows.find(r => r.month === month);
  const prev = rows.find(r => r.month === addMonths(month, -1));
  const ytd = rows.filter(r => r.month.slice(0, 4) === month.slice(0, 4));
  const sum = (xs: DriverMonth[], k: keyof DriverMonth) => xs.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  const last12 = rows.filter(r => r.month > addMonths(month, -12)).reverse();
  const maxRevenue = Math.max(1, ...last12.map(r => Number(r.revenue)));

  if (!cur) return null;

  const cards: { label: string; value: string; now: number; before?: number; note?: string }[] = [
    { label: 'Bookings', value: String(cur.rides), now: cur.rides, before: prev?.rides,
      note: `${cur.cash_rides} cash · ${cur.voucher_rides} voucher` },
    { label: 'Revenue', value: `SAR ${money(cur.revenue)}`, now: cur.revenue, before: prev?.revenue,
      note: `cash ${money(cur.cash)} · vouchers ${money(cur.vouchers)}${cur.other ? ` · other ${money(cur.other)}` : ''}` },
    { label: 'Expenses paid by driver', value: `SAR ${money(cur.expenses_paid_by_driver)}`, now: cur.expenses_paid_by_driver,
      before: prev?.expenses_paid_by_driver, note: `all expenses ${money(cur.expenses_total)}` },
    { label: 'Driver pay', value: cur.pay_status === 'finalized' ? `SAR ${money(cur.driver_pay)}` : '–', now: cur.driver_pay,
      before: cur.pay_status === 'finalized' ? prev?.driver_pay : undefined,
      note: cur.pay_status === 'finalized' ? 'from the finalized payout' : cur.pay_status === 'draft' ? 'payout not finalized yet' : 'no payout yet' },
    { label: 'Cash handed over', value: `SAR ${money(cur.handovers_confirmed)}`, now: cur.handovers_confirmed,
      before: prev?.handovers_confirmed, note: 'confirmed by the office' },
    { label: 'Balance at month end', value: `SAR ${money(Math.abs(cur.closing_balance))}`, now: cur.closing_balance,
      note: cur.closing_balance > 0 ? 'driver owes the office' : cur.closing_balance < 0 ? 'office owes the driver' : 'nothing owed' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        {cards.map(c => (
          <Card key={c.label} className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-1 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{c.label}</CardTitle>
              {c.before !== undefined && <Change now={c.now} before={c.before} />}
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{c.value}</div>
              {c.note && <p className="text-xs text-zinc-500 mt-1">{c.note}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      {prev && <p className="text-xs text-zinc-400 -mt-3">Arrows compare with {monthName(prev.month)}.</p>}

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">This month, last month, year to date</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500">
              <tr><th className="text-left py-1"></th><th className="text-right">Bookings</th><th className="text-right">Revenue</th>
                <th className="text-right">Expenses paid</th><th className="text-right">Driver pay</th></tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {[
                { label: monthName(month), xs: [cur] },
                ...(prev ? [{ label: monthName(prev.month), xs: [prev] }] : []),
                { label: `Year to date ${month.slice(0, 4)}`, xs: ytd },
              ].map(row => (
                <tr key={row.label} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 font-sans">{row.label}</td>
                  <td className="text-right">{sum(row.xs, 'rides')}</td>
                  <td className="text-right">{money(sum(row.xs, 'revenue'))}</td>
                  <td className="text-right">{money(sum(row.xs, 'expenses_paid_by_driver'))}</td>
                  <td className="text-right">{money(sum(row.xs.filter(x => x.pay_status === 'finalized'), 'driver_pay'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-zinc-400 mt-2">Driver pay counts finalized payouts only.</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Last 12 months</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="text-left py-1">Month</th><th className="text-right">Bookings</th><th className="text-right">Cash</th>
                <th className="text-right">Vouchers</th><th className="text-right">Revenue</th><th className="hidden md:table-cell w-28"></th>
                <th className="text-right">Expenses paid</th><th className="text-right">Pay</th><th className="text-right">Handed over</th>
                <th className="text-right">Balance</th><th className="text-left pl-3">Settlement</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {last12.map(r => (
                <tr key={r.month} onClick={() => onSelectMonth(r.month)}
                  className={`border-t border-zinc-100 dark:border-zinc-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40 ${r.month === month ? 'bg-indigo-50/60 dark:bg-indigo-950/20' : ''}`}>
                  <td className="py-1.5 font-sans font-medium">{monthName(r.month, 'short')}</td>
                  <td className="text-right">{r.rides}</td>
                  <td className="text-right">{money(r.cash)}</td>
                  <td className="text-right">{money(r.vouchers)}</td>
                  <td className="text-right font-semibold">{money(r.revenue)}</td>
                  <td className="hidden md:table-cell px-2">
                    <div className="h-2 rounded bg-indigo-100 dark:bg-indigo-950/40">
                      <div className="h-2 rounded bg-indigo-500" style={{ width: `${(Number(r.revenue) / maxRevenue) * 100}%` }} />
                    </div>
                  </td>
                  <td className="text-right">{money(r.expenses_paid_by_driver)}</td>
                  <td className="text-right">{r.pay_status === 'finalized' ? money(r.driver_pay) : r.pay_status === 'draft' ? 'draft' : '–'}</td>
                  <td className="text-right">{money(r.handovers_confirmed)}</td>
                  <td className="text-right">{money(r.closing_balance)}</td>
                  <td className="pl-3 font-sans">{r.settlement_status === 'closed' ? 'Settled' : 'Open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-zinc-400 mt-2">
            Click a month to open it. Balance: + the driver owes the office, − the office owes the driver.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
