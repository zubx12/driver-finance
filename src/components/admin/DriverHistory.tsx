'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { AssignmentHistory } from '@/components/admin/AssignmentHistory';
import { AuditEntry, auditTableLabel, type AuditRow } from '@/components/admin/AuditEntry';

// Driver workspace, History tab (W5): employment periods, vehicle
// assignments, correction requests, and every change to the driver and their
// records from the audit log (get_driver_history), newest first.

interface Period { id: string; joined_on: string; last_working_day: string | null; left_on: string | null; leave_reason: string | null; }
interface Correction {
  id: string; record_type: 'ride' | 'expense'; reason: string; status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null; created_at: string; resolved_at: string | null;
}

const PAGE_SIZE = 30;
const day = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Riyadh' });
const STATUS_STYLE: Record<Correction['status'], string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

export function DriverHistory({ driverId }: { driverId: string }) {
  const router = useRouter();
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [corrections, setCorrections] = useState<Correction[] | null>(null);
  const [changes, setChanges] = useState<AuditRow[] | null>(null);
  const [page, setPage] = useState(0);
  const [table, setTable] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const supabase = createClient();
    supabase.rpc('get_driver_employment', { p_driver_id: driverId }).then(({ data }) => {
      if (current) setPeriods(((data as { periods?: Period[] } | null)?.periods) ?? []);
    });
    supabase.from('correction_requests')
      .select('id, record_type, reason, status, admin_note, created_at, resolved_at')
      .eq('driver_id', driverId).order('created_at', { ascending: false }).limit(50)
      .then(({ data, error: err }) => {
        if (!current) return;
        if (err) setError(err.message); else setCorrections((data ?? []) as Correction[]);
      });
    return () => { current = false; };
  }, [driverId]);

  useEffect(() => {
    let current = true;
    createClient().rpc('get_driver_history', { p_driver_id: driverId, p_limit: 200, p_offset: 0 })
      .then(({ data, error: err }) => {
        if (!current) return;
        if (err) setError(err.message); else setChanges((data ?? []) as AuditRow[]);
      });
    return () => { current = false; };
  }, [driverId]);

  const tables = [...new Set((changes ?? []).map(c => c.table_name))].sort();
  const filtered = (changes ?? []).filter(c => !table || c.table_name === table);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const total = changes?.[0]?.total_count ?? 0;

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Employment</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {!periods ? <div className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              : periods.length === 0 ? <p className="text-zinc-400">No employment record.</p>
              : periods.map(p => (
                <p key={p.id}>
                  Joined <b>{day(p.joined_on)}</b>
                  {p.last_working_day && <> · last working day <b>{day(p.last_working_day)}</b></>}
                  {p.left_on && <> · left <b>{day(p.left_on)}</b></>}
                  {!p.last_working_day && <span className="text-emerald-600"> · current</span>}
                  {p.leave_reason && <span className="block text-xs text-zinc-500">Reason: {p.leave_reason}</span>}
                </p>
              ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Correction requests</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {!corrections ? <div className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              : corrections.length === 0 ? <p className="text-zinc-400">None.</p> : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {corrections.map(c => (
                  <li key={c.id} className="py-1.5">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mr-2 ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                    {c.record_type} · {day(c.created_at)}
                    <span className="block text-xs text-zinc-500">{c.reason}{c.admin_note ? ` · office: ${c.admin_note}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AssignmentHistory driverId={driverId} />

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">
            Changes {total > 0 && <span className="font-normal text-zinc-500">· {total}{total > 200 ? ' (latest 200 shown)' : ''}</span>}
          </CardTitle>
          <select value={table} onChange={e => { setTable(e.target.value); setPage(0); }} aria-label="Show changes to"
            className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-xs text-zinc-900 dark:text-zinc-100">
            <option value="">Everything</option>
            {tables.map(t => <option key={t} value={t}>{auditTableLabel(t)}</option>)}
          </select>
        </CardHeader>
        <CardContent className="space-y-2">
          {!changes ? <div className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
            : shown.length === 0 ? <p className="text-sm text-zinc-400">No changes recorded.</p>
            : shown.map(row => (
              <AuditEntry key={row.id} row={row} onRecordClick={record => router.push(`/admin/audit?record=${record}`)} />
            ))}
          {pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />Newer
              </Button>
              <span className="text-xs text-zinc-500">Page {page + 1} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>
                Older<ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <p className="text-[11px] text-zinc-400">Click a record id to see its complete history in the Audit Log.</p>
        </CardContent>
      </Card>
    </div>
  );
}
