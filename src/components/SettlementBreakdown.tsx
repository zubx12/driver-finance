import type { DriverSettlement } from '@/lib/data/settlements';

const fmt = (n: number) => Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Signed amount: "+1,000.00" / "−1,000.00". */
export const signed = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${fmt(Math.abs(n))}`;

/** Who owes whom, in words, for a balance (+ driver owes the office). */
export function balanceWords(n: number, who: 'office' | 'driver'): string {
  if (Number(n) === 0) return 'Nothing owed';
  if (n > 0) return who === 'office' ? `Driver owes SAR ${fmt(n)}` : `You owe the office SAR ${fmt(n)}`;
  return who === 'office' ? `Office owes SAR ${fmt(-n)}` : `The office owes you SAR ${fmt(-n)}`;
}

/** The settlement formula, line by line (money-flow plan §2). */
export function SettlementBreakdown({ s }: { s: DriverSettlement }) {
  const lines: { label: string; value: number; hint?: string }[] = [
    { label: 'Opening balance', value: s.opening_balance, hint: 'carried from last month' },
    { label: 'Cash collected', value: s.cash_collected },
    { label: 'Vouchers collected in cash', value: s.vouchers_collected },
    { label: 'Expenses paid by the driver', value: -s.expenses_paid },
    { label: 'Driver pay', value: -s.driver_pay, hint: s.pay_lines.length > 1 ? s.pay_lines.map(p => `${p.vehicle} ${fmt(p.driver_pay)}`).join(', ') : undefined },
    { label: 'Cash handed over (confirmed)', value: -s.handovers_confirmed },
  ];
  return (
    <div className="text-sm">
      {lines.map(l => (
        <div key={l.label} className="flex justify-between gap-3 py-1">
          <span className="text-zinc-600 dark:text-zinc-400">
            {l.label}{l.hint && <span className="block text-[11px] text-zinc-400">{l.hint}</span>}
          </span>
          <span className={`font-mono tabular-nums ${l.value < 0 ? 'text-rose-600' : ''}`}>{signed(l.value)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-zinc-200 dark:border-zinc-800 font-bold">
        <span>Closing balance</span>
        <span className="font-mono tabular-nums">{signed(s.closing_balance)}</span>
      </div>
      {s.status === 'closed' && (
        <>
          <div className="flex justify-between gap-3 py-1 text-zinc-600 dark:text-zinc-400">
            <span>Paid at settlement{s.settle_method ? ` (${s.settle_method === 'bank_transfer' ? 'bank transfer' : 'cash'}${s.settle_reference ? `, ref ${s.settle_reference}` : ''})` : ''}</span>
            <span className="font-mono tabular-nums">{fmt(s.settled_amount ?? 0)}</span>
          </div>
          {Number(s.written_off ?? 0) > 0 && (
            <div className="flex justify-between gap-3 py-1 text-zinc-600 dark:text-zinc-400">
              <span>Written off{s.write_off_reason ? ` (${s.write_off_reason})` : ''}</span>
              <span className="font-mono tabular-nums">{fmt(s.written_off ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 py-1 font-semibold">
            <span>Carried to next month</span>
            <span className="font-mono tabular-nums">{signed(s.carried_forward ?? 0)}</span>
          </div>
        </>
      )}
      {(s.handovers_submitted_count > 0 || s.handovers_disputed > 0) && (
        <p className="text-[11px] text-amber-600 mt-2">
          Not counted: {s.handovers_submitted_count > 0 ? `SAR ${fmt(s.handovers_submitted)} waiting for confirmation` : ''}
          {s.handovers_submitted_count > 0 && s.handovers_disputed > 0 ? ', ' : ''}
          {s.handovers_disputed > 0 ? `SAR ${fmt(s.handovers_disputed)} disputed` : ''}
        </p>
      )}
    </div>
  );
}
