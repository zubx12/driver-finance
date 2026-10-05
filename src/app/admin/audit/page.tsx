'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldCheck, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AUDIT_TABLES, AuditEntry, type AuditRow } from '@/components/admin/AuditEntry';

// Every insert, change and deletion of money and access data is recorded by a
// database trigger and cannot be edited or deleted (migrations 20260930000001
// and 20261004000002). get_audit_log adds names and a "from -> to" view.

const PAGE_SIZE = 50;
const TABLES = [{ value: '', label: 'Everything' }, ...AUDIT_TABLES];

interface Filters { table: string; record: string; from: string; to: string; page: number; }

async function fetchAudit(f: Filters): Promise<{ rows?: AuditRow[]; error?: string }> {
  const { data, error } = await createClient().rpc('get_audit_log', {
    p_table: f.table || null,
    p_record_id: f.record || null,
    p_from: f.from || null,
    p_to: f.to || null,
    p_limit: PAGE_SIZE,
    p_offset: f.page * PAGE_SIZE,
  });
  if (error) return { error: error.message };
  return { rows: (data ?? []) as AuditRow[] };
}

function AuditLog() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>({
    table: params.get('table') ?? '', record: params.get('record') ?? '', from: '', to: '', page: 0,
  });
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((r: { rows?: AuditRow[]; error?: string }) => {
    if (r.error) setError(r.error);
    else { setRows(r.rows ?? []); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    let current = true;
    fetchAudit(filters).then((r) => { if (current) apply(r); });
    return () => { current = false; };
  }, [filters, apply]);

  const update = (patch: Partial<Filters>) => {
    setLoading(true);
    setFilters(prev => ({ ...prev, page: 0, ...patch }));
  };

  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="flex items-start gap-3">
        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-lg mt-1">
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Every change to money and account data: who, when, and what changed. Entries cannot be edited or deleted.
          </p>
        </div>
      </header>

      <Card className="border-zinc-200 dark:border-zinc-800 rounded-xl">
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-zinc-500 space-y-1">
            <span>Show</span>
            <select value={filters.table} onChange={e => update({ table: e.target.value })}
              className="h-9 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-sm font-normal text-zinc-900 dark:text-zinc-100">
              {TABLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-500 space-y-1">
            <span>From</span>
            <Input type="date" value={filters.from} onChange={e => update({ from: e.target.value })} className="h-9" />
          </label>
          <label className="text-xs font-semibold text-zinc-500 space-y-1">
            <span>To</span>
            <Input type="date" value={filters.to} onChange={e => update({ to: e.target.value })} className="h-9" />
          </label>
          <label className="text-xs font-semibold text-zinc-500 space-y-1">
            <span>One record (id)</span>
            <Input value={filters.record} placeholder="Paste a ride/expense id"
              onChange={e => {
                const v = e.target.value.trim();
                if (v === '' || /^[0-9a-f-]{36}$/i.test(v)) update({ record: v });
              }}
              className="h-9 font-mono text-xs" />
          </label>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-400 py-12 text-sm">Loading audit log...</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-zinc-400 py-12 text-sm">No changes match these filters.</div>
      ) : (
        <>
          <div className="text-sm text-zinc-500">{total} change{total === 1 ? '' : 's'}</div>
          <div className="space-y-2">
            {rows.map(row => (
              <AuditEntry key={row.id} row={row} onRecordClick={record => update({ record, table: '' })} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={filters.page === 0}
              onClick={() => { setLoading(true); setFilters(p => ({ ...p, page: p.page - 1 })); }}>
              <ChevronLeft className="h-4 w-4" />Newer
            </Button>
            <span className="text-xs text-zinc-500">Page {filters.page + 1} of {pages}</span>
            <Button variant="outline" size="sm" disabled={filters.page + 1 >= pages}
              onClick={() => { setLoading(true); setFilters(p => ({ ...p, page: p.page + 1 })); }}>
              Older<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminAuditLogPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<div className="text-center text-zinc-400 py-12 text-sm">Loading audit log...</div>}>
      <AuditLog />
    </Suspense>
  );
}
