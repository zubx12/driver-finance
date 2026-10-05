'use client';

import type { VehicleMonthReport } from '@/lib/data/reports';
import { monthLabel } from '@/lib/data/settlements';
import { ReportLines, ReportSection, ReportTable, money } from './ReportTable';

const PAID_BY: Record<string, string> = { driver: 'Driver', company: 'Company', office: 'Office' };
const until = (to: string | null) => (to ? `to ${to}` : 'onward');

/** The monthly vehicle report (money-flow plan §5, sections 1-7). */
export function VehicleMonthReportView({ r, onReceipt }: { r: VehicleMonthReport; onReceipt?: (path: string) => void }) {
  const p = r.payout;
  return (
    <article className="space-y-6 text-zinc-900 dark:text-zinc-100 print:text-black">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {r.vehicle.plate_number} · {r.vehicle.make} {r.vehicle.model} {r.vehicle.year}
        </h1>
        <p className="text-sm text-zinc-500 print:text-zinc-700">
          Monthly vehicle report · {monthLabel(r.period_start.slice(0, 7))} ({r.period_start} to {r.period_end}) ·{' '}
          payout {p ? (p.status === 'finalized' ? 'finalized' : 'DRAFT, figures may still change') : 'not calculated yet'}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 print:grid-cols-2">
        <ReportSection title="1. Owners">
          <ReportTable rows={r.owners} empty="No owner in this month."
            columns={[
              { label: 'Partner', cell: o => o.partner },
              { label: '%', num: true, cell: o => `${o.percentage}%` },
              { label: 'Dates', cell: o => `${o.from} ${until(o.to)}` },
            ]} />
        </ReportSection>
        <ReportSection title="Drivers">
          <ReportTable rows={r.drivers} empty="No driver assignment recorded in this month."
            columns={[
              { label: 'Driver', cell: d => d.driver },
              { label: 'Dates', cell: d => `${d.from} ${until(d.to)}` },
            ]} />
        </ReportSection>
      </div>

      <ReportSection title="2. Revenue by day">
        <ReportTable rows={r.revenue_by_day} empty="No rides in this month."
          columns={[
            { label: 'Date', cell: d => d.date },
            { label: 'Rides', num: true, cell: d => d.rides },
            { label: 'Cash', num: true, cell: d => money(d.cash) },
            { label: 'Vouchers', num: true, cell: d => money(d.vouchers) },
            ...(r.revenue_totals.other ? [{ label: 'Other', num: true, cell: (d: VehicleMonthReport['revenue_by_day'][number]) => money(d.other) }] : []),
            { label: 'Total', num: true, cell: d => money(d.total) },
          ]}
          footer={['Total', r.revenue_totals.rides, money(r.revenue_totals.cash), money(r.revenue_totals.vouchers),
            ...(r.revenue_totals.other ? [money(r.revenue_totals.other)] : []), money(r.revenue_totals.total)]} />
      </ReportSection>

      <ReportSection title="3. Vouchers"
        note={`Outstanding SAR ${money(r.revenue_totals.vouchers_outstanding)} · collected SAR ${money(r.revenue_totals.vouchers_collected)}`}>
        <ReportTable rows={r.vouchers} empty="No vouchers in this month."
          columns={[
            { label: 'Date', cell: v => v.date },
            { label: 'Payer', cell: v => v.payer ?? '–' },
            { label: 'Ref', cell: v => v.reference ?? '' },
            { label: 'Amount', num: true, cell: v => money(v.amount) },
            { label: 'Status', cell: v => v.status },
            { label: 'Collected by', cell: v => v.collected_by ? `${v.collected_by} (${v.collected_by_role})${v.collected_at ? `, ${v.collected_at.slice(0, 10)}` : ''}` : '' },
            { label: 'Handed to', cell: v => v.handed_to.map(h => `${h.partner} ${h.percentage}% = ${money(h.amount)}`).join('; ') },
          ]} />
      </ReportSection>

      <ReportSection title="4. Expenses">
        <ReportTable rows={r.expenses} empty="No expenses in this month."
          columns={[
            { label: 'Date', cell: e => e.date },
            { label: 'Category', cell: e => <>{e.category}{e.kind === 'charged' && <span className="text-zinc-500"> (charged to vehicle)</span>}{e.description && <span className="block text-zinc-500 print:text-zinc-700">{e.description}</span>}</> },
            { label: 'Paid by', cell: e => PAID_BY[e.paid_by] ?? e.paid_by },
            { label: 'Driver', cell: e => e.driver ?? '' },
            { label: 'Amount', num: true, cell: e => money(e.amount) },
            ...(onReceipt ? [{ label: 'Receipt', cell: (e: VehicleMonthReport['expenses'][number]) => e.receipt
              ? <button className="text-indigo-600 underline print:hidden" onClick={() => onReceipt(e.receipt!)}>Open</button> : '' }] : []),
          ]}
          footer={['Total', '', '', '', money(r.expenses.reduce((t, e) => t + Number(e.amount), 0)), ...(onReceipt ? [''] : [])]} />
      </ReportSection>

      <ReportSection title="5. Corrections (adjustments)">
        <ReportTable rows={r.adjustments} empty="No adjustments."
          columns={[
            { label: 'Reason', cell: a => a.reason },
            { label: 'Recorded', cell: a => a.created_at.slice(0, 10) },
            { label: 'Amount', num: true, cell: a => money(a.amount) },
          ]} />
      </ReportSection>

      {p ? (
        <>
          <ReportSection title="6. Driver pay">
            <ReportTable rows={r.driver_pay} empty="No driver pay for this month."
              columns={[
                { label: 'Driver', cell: d => d.driver },
                { label: 'Terms', cell: d => d.type === 'commission'
                  ? `${d.commission_percentage}% commission${d.base_net != null ? ` of ${money(d.base_net)}` : ''}`
                  : `Salary ${money(d.fixed_salary_amount)}${d.days_applied != null ? ` for ${d.days_applied} days` : ''}` },
                { label: 'Bonus', num: true, cell: d => money(d.bonus_amount) },
                { label: 'Pay', num: true, cell: d => money(d.amount) },
              ]} />
          </ReportSection>

          <ReportSection title="7. Balance to share">
            <ReportLines lines={[
              { label: 'Revenue', value: p.total_revenue },
              { label: 'Vehicle expenses', value: -p.total_expenses },
              { label: 'Office expenses', value: -p.company_expenses },
              { label: 'Charged expenses', value: -p.charged_expenses },
              { label: 'Adjustments', value: p.adjustments_total },
              { label: 'Driver pay', value: -p.driver_pay_total },
              ...(p.loss_brought_forward ? [{ label: 'Loss brought forward', value: -p.loss_brought_forward }] : []),
              { label: 'Balance to share', value: p.net_revenue, bold: true },
              ...(p.loss_carried_forward ? [{ label: 'Loss carried to next month', value: p.loss_carried_forward }] : []),
              ...(p.company_retained ? [{ label: 'Kept by the company', value: p.company_retained, hint: 'no owner for part of the month' }] : []),
            ]} />
            {p.admin_notes && <p className="text-xs text-zinc-500 print:text-zinc-700">Note: {p.admin_notes}</p>}
            <ReportTable rows={r.shares} empty="No partner shares."
              columns={[
                { label: 'Partner', cell: s => s.partner },
                { label: '%', num: true, cell: s => `${s.percentage}%` },
                { label: 'Share', num: true, cell: s => money(s.share) },
                { label: 'Paid in cash', num: true, cell: s => s.settlement_status === 'paid' ? money(s.cash_amount) : '' },
                { label: 'In vouchers', num: true, cell: s => s.settlement_status === 'paid' ? money(s.voucher_amount) : '' },
                { label: 'Status', cell: s => s.settlement_status === 'paid'
                  ? `Paid ${s.paid_at?.slice(0, 10) ?? ''}${s.payment_reference ? `, ref ${s.payment_reference}` : ''}${s.vouchers_kept_by_office ? ' (vouchers kept by office)' : ''}`
                  : s.settlement_status === 'pending' ? 'To pay' : 'Not finalized' },
              ]}
              footer={['Total', '', money(r.shares.reduce((t, s) => t + Number(s.share), 0)), '', '', '']} />
          </ReportSection>
        </>
      ) : (
        <ReportSection title="6-7. Driver pay and partner shares">
          <p className="text-sm text-zinc-500">The payout for this month has not been calculated yet (Salary Runs).</p>
        </ReportSection>
      )}

      <footer className="text-[10px] text-zinc-400 print:text-zinc-600 pt-4">
        Printed {new Date().toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' })} (Riyadh time)
      </footer>
    </article>
  );
}
