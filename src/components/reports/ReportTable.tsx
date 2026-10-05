import type { ReactNode } from 'react';

// Plain, print-friendly building blocks for the monthly reports (Phase 7F).

export const money = (n: number | null | undefined) =>
  n == null ? '–' : Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ReportSection({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="space-y-2 break-inside-avoid-page">
      <h2 className="text-base font-bold border-b border-zinc-300 dark:border-zinc-700 print:border-black pb-1">{title}</h2>
      {note && <p className="text-xs text-zinc-500 print:text-zinc-700">{note}</p>}
      {children}
    </section>
  );
}

export interface Column<T> {
  label: string;
  cell: (row: T) => ReactNode;
  /** Right-aligned numbers. */
  num?: boolean;
}

export function ReportTable<T>({ rows, columns, empty, footer }: {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
  footer?: ReactNode[];
}) {
  if (rows.length === 0) return <p className="text-sm text-zinc-500 print:text-zinc-700">{empty ?? 'None.'}</p>;
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-zinc-300 dark:border-zinc-700 print:border-black">
            {columns.map(c => (
              <th key={c.label} className={`py-1 px-1.5 font-semibold text-zinc-600 dark:text-zinc-400 print:text-black ${c.num ? 'text-right' : 'text-left'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800 print:border-zinc-300 break-inside-avoid">
              {columns.map(c => (
                <td key={c.label} className={`py-1 px-1.5 align-top ${c.num ? 'text-right font-mono tabular-nums whitespace-nowrap' : ''}`}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="border-t-2 border-zinc-300 dark:border-zinc-700 print:border-black font-bold">
              {footer.map((f, i) => (
                <td key={i} className={`py-1 px-1.5 ${columns[i]?.num ? 'text-right font-mono tabular-nums whitespace-nowrap' : ''}`}>{f}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Label / value lines, e.g. the payout calculation. */
export function ReportLines({ lines }: { lines: { label: string; value: number | null; bold?: boolean; hint?: string }[] }) {
  return (
    <table className="w-full max-w-md text-sm">
      <tbody>
        {lines.map(l => (
          <tr key={l.label} className={l.bold ? 'font-bold border-t border-zinc-300 dark:border-zinc-700 print:border-black' : ''}>
            <td className="py-0.5 pr-4">{l.label}{l.hint && <span className="text-xs text-zinc-500 print:text-zinc-700"> ({l.hint})</span>}</td>
            <td className="py-0.5 text-right font-mono tabular-nums">{money(l.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
