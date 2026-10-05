'use client';

import type { DriverStatement } from '@/lib/data/reports';
import { monthLabel } from '@/lib/data/settlements';
import { SettlementBreakdown, balanceWords } from '@/components/SettlementBreakdown';
import { ReportSection, ReportTable, money } from './ReportTable';

const HANDOVER_STATUS = { submitted: 'Waiting for the office', confirmed: 'Confirmed', disputed: 'Disputed' } as const;

/** Driver statement: the monthly settlement with every entry behind it. */
export function DriverStatementView({ st, driverName, who }: { st: DriverStatement; driverName: string; who: 'office' | 'driver' }) {
  const s = st.settlement;
  const sum = (xs: { amount: number }[]) => money(xs.reduce((t, x) => t + Number(x.amount), 0));
  return (
    <article className="space-y-6 text-zinc-900 dark:text-zinc-100 print:text-black">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{driverName}</h1>
        <p className="text-sm text-zinc-500 print:text-zinc-700">
          Driver statement · {monthLabel(s.period_start.slice(0, 7))} ({s.period_start} to {s.period_end}) ·{' '}
          {s.status === 'closed' ? 'settled' : 'open, figures may still change'}
        </p>
        {(st.employment ?? []).map(e => (
          <p key={e.joined_on} className="text-xs text-zinc-500 print:text-zinc-700">
            Joined {e.joined_on}
            {e.last_working_day && ` · last working day ${e.last_working_day}`}
            {e.left_on && ` · left ${e.left_on}`}
            {e.leave_reason && ` (${e.leave_reason})`}
          </p>
        ))}
        {st.assignments.length > 0 && (
          <p className="text-xs text-zinc-500 print:text-zinc-700">
            Vehicles: {st.assignments.map(a => `${a.vehicle} ${a.from} ${a.to ? `to ${a.to}` : 'onward'}`).join('; ')}
          </p>
        )}
      </header>

      <ReportSection title="Settlement">
        <div className="max-w-md">
          <SettlementBreakdown s={s} />
          <p className="text-sm font-semibold mt-2">
            {balanceWords(s.status === 'closed' ? (s.carried_forward ?? 0) : s.closing_balance, who)}
            {s.status === 'closed' && (s.carried_forward ?? 0) !== 0 ? ' (carried to next month)' : ''}
          </p>
        </div>
      </ReportSection>

      <ReportSection title="Cash rides">
        <ReportTable rows={st.cash_rides} empty="No cash rides."
          columns={[
            { label: 'Date', cell: r => r.date },
            { label: 'Vehicle', cell: r => r.vehicle ?? '' },
            { label: 'Amount', num: true, cell: r => money(r.amount) },
          ]}
          footer={['Total', '', sum(st.cash_rides)]} />
      </ReportSection>

      <ReportSection title="Vouchers collected in cash">
        <ReportTable rows={st.vouchers_collected} empty="No vouchers collected."
          columns={[
            { label: 'Collected on', cell: v => v.collected_on },
            { label: 'Ride date', cell: v => v.ride_date },
            { label: 'Payer', cell: v => v.payer ?? '' },
            { label: 'Ref', cell: v => v.reference ?? '' },
            { label: 'Amount', num: true, cell: v => money(v.amount) },
          ]}
          footer={['Total', '', '', '', sum(st.vouchers_collected)]} />
      </ReportSection>

      <ReportSection title="Expenses paid by the driver">
        <ReportTable rows={st.expenses_paid} empty="No expenses paid by the driver."
          columns={[
            { label: 'Date', cell: e => e.date },
            { label: 'Category', cell: e => <>{e.category}{e.description && <span className="block text-zinc-500 print:text-zinc-700">{e.description}</span>}</> },
            { label: 'Vehicle', cell: e => e.vehicle ?? '' },
            { label: 'Paid from', cell: e => e.from },
            { label: 'Amount', num: true, cell: e => money(e.amount) },
          ]}
          footer={['Total', '', '', '', sum(st.expenses_paid)]} />
      </ReportSection>

      <ReportSection title="Cash handovers" note="Only confirmed handovers count in the settlement.">
        <ReportTable rows={st.handovers} empty="No handovers."
          columns={[
            { label: 'Date', cell: h => h.date },
            { label: 'Method', cell: h => (h.method === 'bank_transfer' ? 'Bank transfer' : 'Cash') + (h.reference ? `, ref ${h.reference}` : '') },
            { label: 'Status', cell: h => <>{HANDOVER_STATUS[h.status] ?? h.status}{h.admin_note && <span className="block text-zinc-500 print:text-zinc-700">{h.admin_note}</span>}</> },
            { label: 'Amount', num: true, cell: h => money(h.amount) },
          ]} />
      </ReportSection>

      <footer className="text-[10px] text-zinc-400 print:text-zinc-600 pt-4">
        Printed {new Date().toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' })} (Riyadh time)
      </footer>
    </article>
  );
}
