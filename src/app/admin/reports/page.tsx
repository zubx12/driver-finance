'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Download, Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getReceiptSignedUrl } from '@/lib/data/expenses';
import { currentMonth, previousMonth } from '@/lib/data/settlements';
import {
  driverStatementCsv, fetchDriverStatement, fetchVehicleMonthReport, vehicleReportCsv,
  type DriverStatement, type VehicleMonthReport,
} from '@/lib/data/reports';
import { downloadCsv } from '@/lib/csv';
import { VehicleMonthReportView } from '@/components/reports/VehicleMonthReportView';
import { DriverStatementView } from '@/components/reports/DriverStatementView';

// Monthly vehicle report and driver statement (owner decision M2, Phase 7F):
// everything for one vehicle (or driver) and month on one printable page.
// Print uses the browser's print dialog (choose "Save as PDF" for a PDF).

type Kind = 'vehicle' | 'driver';
interface Option { id: string; label: string; }

// Links such as /admin/reports?kind=driver&driver=<id>&month=2026-08 open
// straight on that report (used by the driver page's Statement button).
export default function AdminReportsPage() {
  return (
    <Suspense fallback={<div className="text-center text-zinc-400 py-16 text-sm">Loading…</div>}>
      <ReportsPage />
    </Suspense>
  );
}

function ReportsPage() {
  const params = useSearchParams();
  const linkKind: Kind = params.get('kind') === 'driver' ? 'driver' : 'vehicle';
  const linkTarget = params.get(linkKind) ?? '';
  const linkMonth = params.get('month') ?? '';

  const [kind, setKind] = useState<Kind>(linkKind);
  const [month, setMonth] = useState(/^\d{4}-\d{2}$/.test(linkMonth) ? linkMonth : previousMonth());
  const [vehicles, setVehicles] = useState<Option[]>([]);
  const [drivers, setDrivers] = useState<Option[]>([]);
  const [vehicleId, setVehicleId] = useState(linkKind === 'vehicle' ? linkTarget : '');
  const [driverId, setDriverId] = useState(linkKind === 'driver' ? linkTarget : '');
  const [report, setReport] = useState<VehicleMonthReport | null>(null);
  const [statement, setStatement] = useState<DriverStatement | null>(null);
  const [loading, setLoading] = useState(Boolean(linkTarget));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('vehicles').select('id, plate_number, make, model').order('plate_number')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: `${v.plate_number} · ${v.make} ${v.model}` }))));
    supabase.from('drivers').select('id, name').order('name')
      .then(({ data }) => setDrivers((data ?? []).map(d => ({ id: d.id, label: d.name }))));
  }, []);

  const selectedId = kind === 'vehicle' ? vehicleId : driverId;

  useEffect(() => {
    if (!selectedId || !month) return;
    let current = true;
    const load = kind === 'vehicle'
      ? fetchVehicleMonthReport(selectedId, month).then(r => { if (current) { setReport(r); setStatement(null); } })
      : fetchDriverStatement(selectedId, month).then(s => { if (current) { setStatement(s); setReport(null); } });
    load
      .then(() => { if (current) setError(null); })
      .catch(e => { if (current) { setError((e as Error).message); setReport(null); setStatement(null); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [kind, selectedId, month]);

  const choose = (k: Kind, id: string) => {
    setLoading(Boolean(id));
    if (k === 'vehicle') setVehicleId(id); else setDriverId(id);
  };
  const switchKind = (k: Kind) => {
    if (k === kind) return;
    setReport(null); setStatement(null); setError(null);
    setLoading(Boolean(k === 'vehicle' ? vehicleId : driverId));
    setKind(k);
  };
  const changeMonth = (m: string) => {
    if (!m || m === month) return;
    setLoading(Boolean(selectedId));
    setMonth(m);
  };

  const driverName = drivers.find(d => d.id === driverId)?.label ?? 'Driver';
  const shown = kind === 'vehicle' ? report : statement;

  const exportCsv = () => {
    if (kind === 'vehicle' && report) {
      downloadCsv(`vehicle-report-${report.vehicle.plate_number}-${month}.csv`, vehicleReportCsv(report));
    } else if (kind === 'driver' && statement) {
      downloadCsv(`driver-statement-${driverName.replace(/\s+/g, '-')}-${month}.csv`, driverStatementCsv(statement, driverName));
    }
  };

  const openReceipt = async (path: string) => {
    try {
      window.open(await getReceiptSignedUrl(path, 300), '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the receipt.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="space-y-4 print:hidden">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Monthly Reports</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Everything for one vehicle or driver in a month. Print it, save it as PDF, or download a CSV for Excel.
          </p>
        </header>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex rounded-lg border border-zinc-300 dark:border-zinc-700 overflow-hidden h-9">
            {(['vehicle', 'driver'] as Kind[]).map(k => (
              <button key={k} onClick={() => switchKind(k)}
                className={`px-3 text-sm ${kind === k ? 'bg-indigo-600 text-white' : 'text-zinc-600 dark:text-zinc-300'}`}>
                {k === 'vehicle' ? 'Vehicle report' : 'Driver statement'}
              </button>
            ))}
          </div>
          <label className="text-xs font-semibold text-zinc-500 space-y-1">
            <span>{kind === 'vehicle' ? 'Vehicle' : 'Driver'}</span>
            <select value={selectedId} onChange={e => choose(kind, e.target.value)}
              className="h-9 w-64 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-sm font-normal text-zinc-900 dark:text-zinc-100">
              <option value="">Choose…</option>
              {(kind === 'vehicle' ? vehicles : drivers).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-500 space-y-1">
            <span>Month</span>
            <Input type="month" max={currentMonth()} value={month} onChange={e => changeMonth(e.target.value)} className="h-9 w-44" />
          </label>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" disabled={!shown} onClick={exportCsv} className="h-9 gap-2"><Download className="h-4 w-4" />CSV</Button>
            <Button disabled={!shown} onClick={() => window.print()} className="h-9 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Printer className="h-4 w-4" />Print / PDF
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
      </div>

      {!selectedId ? (
        <div className="text-center text-zinc-400 py-16 text-sm print:hidden">
          Choose a {kind === 'vehicle' ? 'vehicle' : 'driver'} and a month.
        </div>
      ) : loading ? (
        <div className="text-center text-zinc-400 py-16 text-sm print:hidden">Loading report…</div>
      ) : kind === 'vehicle' && report ? (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 print:border-0 print:p-0 print:bg-white">
          <VehicleMonthReportView r={report} onReceipt={openReceipt} />
        </div>
      ) : kind === 'driver' && statement ? (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 print:border-0 print:p-0 print:bg-white">
          <DriverStatementView st={statement} driverName={driverName} who="office" />
        </div>
      ) : null}
    </div>
  );
}
