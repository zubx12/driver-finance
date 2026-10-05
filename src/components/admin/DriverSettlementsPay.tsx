'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { ReportTable, money } from '@/components/reports/ReportTable';

// Driver workspace, "Settlements & pay" tab: every closed monthly settlement
// (7D), pay per month and vehicle from the payout engine, and the pay terms.

interface MoneyHistory {
  settlements: {
    month: string; opening_balance: number; cash_collected: number; vouchers_collected: number;
    expenses_paid: number; driver_pay: number; handovers_confirmed: number; closing_balance: number;
    settled_amount: number; written_off: number; write_off_reason: string | null; carried_forward: number;
    settle_method: string | null; settle_reference: string | null; note: string | null; closed_at: string;
  }[];
  pay: {
    month: string; vehicle: string; status: string; type: 'commission' | 'fixed_salary';
    commission_percentage: number | null; fixed_salary_amount: number | null; bonus_rate: number | null;
    days_applied: number | null; base_net: number | null; commission_amount: number; salary_amount: number;
    bonus_amount: number; amount: number;
  }[];
  pay_terms: {
    vehicle: string | null; type: 'commission' | 'fixed_salary'; commission_percentage: number | null;
    fixed_salary_amount: number | null; bonus_rate: number | null; from: string; to: string | null;
  }[];
}

const monthName = (m: string) =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const signed = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${money(Math.abs(n))}`;

export function DriverSettlementsPay({ driverId }: { driverId: string }) {
  const [h, setH] = useState<MoneyHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    createClient().rpc('get_driver_money_history', { p_driver_id: driverId }).then(({ data, error: err }) => {
      if (!current) return;
      if (err) setError(err.message); else setH(data as MoneyHistory);
    });
    return () => { current = false; };
  }, [driverId]);

  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!h) return <div className="h-40 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />;

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly settlements</CardTitle></CardHeader>
        <CardContent>
          <ReportTable rows={h.settlements} empty="No month has been settled with this driver yet."
            columns={[
              { label: 'Month', cell: s => monthName(s.month) },
              { label: 'Opening', num: true, cell: s => signed(s.opening_balance) },
              { label: 'Cash + vouchers', num: true, cell: s => money(Number(s.cash_collected) + Number(s.vouchers_collected)) },
              { label: 'Expenses', num: true, cell: s => money(s.expenses_paid) },
              { label: 'Pay', num: true, cell: s => money(s.driver_pay) },
              { label: 'Handed over', num: true, cell: s => money(s.handovers_confirmed) },
              { label: 'Closing', num: true, cell: s => signed(s.closing_balance) },
              { label: 'Paid now', num: true, cell: s => money(s.settled_amount) },
              { label: 'Written off', num: true, cell: s => Number(s.written_off) > 0 ? money(s.written_off) : '' },
              { label: 'Carried', num: true, cell: s => signed(s.carried_forward) },
              { label: 'How / when', cell: s => <>{s.settle_method ? (s.settle_method === 'bank_transfer' ? 'Bank transfer' : 'Cash') : '–'}{s.settle_reference ? `, ref ${s.settle_reference}` : ''}
                <span className="block text-zinc-500">{new Date(s.closed_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' })}{s.write_off_reason ? ` · ${s.write_off_reason}` : ''}</span></> },
            ]} />
          <p className="text-[11px] text-zinc-400 mt-2">+ the driver owes the office, − the office owes the driver. Open months are on the Overview tab.</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Pay by month and vehicle</CardTitle></CardHeader>
        <CardContent>
          <ReportTable rows={h.pay} empty="No payout has included this driver yet."
            columns={[
              { label: 'Month', cell: p => monthName(p.month) },
              { label: 'Vehicle', cell: p => p.vehicle },
              { label: 'Terms', cell: p => p.type === 'commission'
                ? `${p.commission_percentage}% of ${money(p.base_net)}`
                : `Salary ${money(p.fixed_salary_amount)}${p.days_applied != null ? ` · ${p.days_applied} days` : ''}` },
              { label: 'Commission', num: true, cell: p => money(p.commission_amount) },
              { label: 'Salary', num: true, cell: p => money(p.salary_amount) },
              { label: 'Bonus', num: true, cell: p => money(p.bonus_amount) },
              { label: 'Pay', num: true, cell: p => <b>{money(p.amount)}</b> },
              { label: 'Payout', cell: p => p.status === 'finalized' ? 'Finalized' : 'Draft (may change)' },
            ]} />
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Pay terms history</CardTitle></CardHeader>
        <CardContent>
          <ReportTable rows={h.pay_terms} empty="No pay terms recorded."
            columns={[
              { label: 'Vehicle', cell: t => t.vehicle ?? '–' },
              { label: 'Terms', cell: t => t.type === 'commission' ? `${t.commission_percentage}% commission` : `Salary ${money(t.fixed_salary_amount)} / month` },
              { label: 'Bonus', cell: t => Number(t.bonus_rate) > 0 ? `${t.bonus_rate}%` : '–' },
              { label: 'From', cell: t => t.from },
              { label: 'Until', cell: t => t.to ?? 'now' },
            ]} />
        </CardContent>
      </Card>
    </div>
  );
}
