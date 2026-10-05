'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { fetchDriverStatement, type DriverStatement } from '@/lib/data/reports';
import { buildDriverMonthReport, monthPeriod, type DriverMonthReportInput, type ReportSection } from '@/lib/reports/driverMonthReport';
import { exportDriverReportCsv, exportDriverReportPdf, exportDriverReportXlsx } from '@/lib/reports/exportDriverReport';

// Driver workspace, Reports tab (W4): the month's report on screen and as a
// PDF, Excel or CSV file, all built from the same report model.

const money = (n: number) => Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SectionTable({ s }: { s: ReportSection }) {
  const moneyCols = new Set(s.money ?? []);
  const fmt = (c: string | number | null, i: number) => (typeof c === 'number' && moneyCols.has(i) ? money(c) : c ?? '');
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold">{s.title}</h3>
      {s.rows.length === 0 ? <p className="text-xs text-zinc-400">None.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              {s.columns.map((c, i) => <th key={c} className={`py-1 px-1.5 font-medium ${moneyCols.has(i) ? 'text-right' : 'text-left'}`}>{c}</th>)}
            </tr></thead>
            <tbody>
              {s.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-zinc-100 dark:border-zinc-800/60">
                  {row.map((c, i) => <td key={i} className={`py-1 px-1.5 ${moneyCols.has(i) ? 'text-right font-mono tabular-nums' : ''}`}>{fmt(c, i)}</td>)}
                </tr>
              ))}
            </tbody>
            {s.total && (
              <tfoot><tr className="font-bold">
                {s.total.map((c, i) => <td key={i} className={`py-1 px-1.5 ${moneyCols.has(i) ? 'text-right font-mono tabular-nums' : ''}`}>{fmt(c, i)}</td>)}
              </tr></tfoot>
            )}
          </table>
        </div>
      )}
      {s.note && <p className="text-[11px] text-zinc-400">{s.note}</p>}
    </div>
  );
}

export function DriverReportsTab({ driverId, month, driver, vehicle, rides, expenses }: {
  driverId: string;
  month: string;
  driver: DriverMonthReportInput['driver'];
  vehicle: DriverMonthReportInput['vehicle'];
  rides: DriverMonthReportInput['rides'];
  expenses: DriverMonthReportInput['expenses'];
}) {
  const [statement, setStatement] = useState<DriverStatement | null>(null);
  const [generatedBy, setGeneratedBy] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    fetchDriverStatement(driverId, month)
      .then(s => { if (current) setStatement(s); })
      .catch(e => { if (current) setError((e as Error).message); });
    createClient().auth.getUser().then(({ data }) => { if (current) setGeneratedBy(data.user?.email ?? null); });
    return () => { current = false; };
  }, [driverId, month]);

  const report = useMemo(() => statement && buildDriverMonthReport({
    month, driver, vehicle, rides, expenses,
    settlement: statement.settlement,
    handovers: statement.handovers,
    employment: statement.employment ?? [],
    generatedAt: new Date(),
    generatedBy,
  }), [statement, month, driver, vehicle, rides, expenses, generatedBy]);

  const run = async (kind: string, f: () => void | Promise<void>) => {
    setBusy(kind); setError(null);
    try { await f(); } catch (e) { setError(e instanceof Error ? e.message : 'The file could not be created.'); }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold">Monthly report · {monthPeriod(month).label}</CardTitle>
            <p className="text-xs text-zinc-500">
              {report?.company} · {driver.name} ({driver.driver_code}){statement?.settlement.status === 'open' ? ' · month not settled yet, figures may change' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!report || !!busy} onClick={() => report && run('pdf', () => exportDriverReportPdf(report))}
              className="h-9 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
              <FileText className="h-4 w-4" />{busy === 'pdf' ? 'Creating…' : 'Download PDF'}
            </Button>
            <Button size="sm" variant="outline" disabled={!report || !!busy} onClick={() => report && run('xlsx', () => exportDriverReportXlsx(report))} className="h-9 gap-2">
              <FileSpreadsheet className="h-4 w-4" />{busy === 'xlsx' ? 'Creating…' : 'Excel'}
            </Button>
            <Button size="sm" variant="outline" disabled={!report || !!busy} onClick={() => report && run('csv', () => exportDriverReportCsv(report))} className="h-9 gap-2">
              <Download className="h-4 w-4" />CSV
            </Button>
            <Link href={`/admin/reports?tab=monthly&kind=driver&driver=${driverId}&month=${month}`}>
              <Button size="sm" variant="ghost" className="h-9 gap-2"><Printer className="h-4 w-4" />Print view</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p role="alert" className="text-sm text-red-600 mb-2">{error}</p>}
          {!report ? <div className="h-40 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" /> : (
            <div className="space-y-5">
              <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                {report.info.map(([k, v]) => (
                  <div key={k} className="flex gap-2"><dt className="text-zinc-500 w-32 shrink-0">{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              <div className="grid gap-5 lg:grid-cols-2">
                {report.sections.slice(0, 5).map(s => <SectionTable key={s.title} s={s} />)}
              </div>
              {report.sections.slice(5).map(s => <SectionTable key={s.title} s={s} />)}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-[11px] text-zinc-400">
        The PDF, Excel and CSV files contain exactly what is shown here. Excel has a Summary sheet and one sheet each for bookings, expenses and handovers.
      </p>
    </div>
  );
}
