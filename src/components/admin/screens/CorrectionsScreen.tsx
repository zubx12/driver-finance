'use client';

/**
 * Admin Correction Requests (/admin/corrections)
 *
 * Drivers flag entries they can no longer edit. Approving a request APPLIES
 * the correction (apply_correction, migration 20261004000002):
 *   - open month  -> the entry itself is corrected;
 *   - paid month  -> the paid record stays as it is and the difference is
 *                    added to this month's payout as a salary adjustment.
 * New requests appear live (Supabase Realtime).
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle, Clock, Radio, AlertCircle, History } from 'lucide-react';

interface RequestRow {
  id: string;
  driver_id: string;
  record_type: 'ride' | 'expense';
  record_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  resolution: 'edited' | 'adjusted' | 'rejected' | null;
  applied_values: { amount_before: number; amount_after: number; date_before: string; date_after: string } | null;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
  drivers: { name: string } | null;
}

interface Entry { amount: number; date: string; vehicleId: string | null; detail: string; }
interface Paid { vehicle_id: string; period_start: string; period_end: string; }
interface Draft { amount: string; date: string; note: string; }

interface LoadResult { requests?: RequestRow[]; entries?: Record<string, Entry>; paid?: Paid[]; error?: string; }

const fmt = (n: number) => Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function load(): Promise<LoadResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('correction_requests')
    .select('id, driver_id, record_type, record_id, reason, status, resolution, applied_values, admin_note, created_at, resolved_at, drivers(name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { error: error.message };
  const requests = (data ?? []) as unknown as RequestRow[];

  const pending = requests.filter(r => r.status === 'pending');
  const rideIds = pending.filter(r => r.record_type === 'ride').map(r => r.record_id);
  const expenseIds = pending.filter(r => r.record_type === 'expense').map(r => r.record_id);

  const [rides, expenses] = await Promise.all([
    rideIds.length
      ? supabase.from('rides').select('id, amount, ride_date, vehicle_id, payment_method, vehicles(plate_number)').in('id', rideIds)
      : Promise.resolve({ data: [] }),
    expenseIds.length
      ? supabase.from('expenses').select('id, amount, expense_date, vehicle_id, charged_vehicle_id, category, allocation').in('id', expenseIds)
      : Promise.resolve({ data: [] }),
  ]);

  const entries: Record<string, Entry> = {};
  for (const r of (rides.data ?? []) as unknown as { id: string; amount: number; ride_date: string; vehicle_id: string; payment_method: string; vehicles: { plate_number: string } | null }[]) {
    entries[r.id] = { amount: Number(r.amount), date: r.ride_date, vehicleId: r.vehicle_id, detail: `${r.payment_method} ride · ${r.vehicles?.plate_number ?? ''}` };
  }
  for (const e of (expenses.data ?? []) as { id: string; amount: number; expense_date: string; vehicle_id: string | null; charged_vehicle_id: string | null; category: string; allocation: string }[]) {
    entries[e.id] = { amount: Number(e.amount), date: e.expense_date, vehicleId: e.vehicle_id ?? e.charged_vehicle_id, detail: `${e.category} expense (${e.allocation})` };
  }

  const vehicleIds = [...new Set(Object.values(entries).map(e => e.vehicleId).filter(Boolean))] as string[];
  const { data: paid } = vehicleIds.length
    ? await supabase.from('salary_calculations').select('vehicle_id, period_start, period_end').eq('status', 'finalized').in('vehicle_id', vehicleIds)
    : { data: [] };

  return { requests, entries, paid: (paid ?? []) as Paid[] };
}

export default function AdminCorrectionsPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [paid, setPaid] = useState<Paid[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((r: LoadResult) => {
    if (r.error) setError(r.error);
    else {
      setRequests(r.requests ?? []);
      setEntries(r.entries ?? {});
      setPaid(r.paid ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let current = true;
    const refresh = () => load().then(r => { if (current) apply(r); });
    refresh();

    const supabase = createClient();
    const channel = supabase
      .channel('admin-corrections-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'correction_requests' }, refresh)
      .subscribe(s => setIsConnected(s === 'SUBSCRIBED'));

    return () => { current = false; supabase.removeChannel(channel); };
  }, [apply]);

  const isPaidMonth = (entry: Entry | undefined) =>
    !!entry?.vehicleId && paid.some(p => p.vehicle_id === entry.vehicleId && entry.date >= p.period_start && entry.date <= p.period_end);

  const draftFor = (req: RequestRow): Draft => {
    const entry = entries[req.record_id];
    return drafts[req.id] ?? { amount: entry ? String(entry.amount) : '', date: entry?.date ?? '', note: '' };
  };
  const setDraft = (req: RequestRow, patch: Partial<Draft>) =>
    setDrafts(prev => ({ ...prev, [req.id]: { ...draftFor(req), ...patch } }));

  async function approve(req: RequestRow) {
    const entry = entries[req.record_id];
    const d = draftFor(req);
    const amount = Number(d.amount);
    if (!entry) { setError('The entry for this request could not be loaded.'); return; }
    if (!Number.isFinite(amount) || amount < 0) { setError('Enter a valid corrected amount.'); return; }

    setBusy(req.id); setError(null); setNotice(null);
    const { data, error: err } = await createClient().rpc('apply_correction', {
      p_request_id: req.id,
      p_amount: amount !== entry.amount ? amount : null,
      p_date: d.date && d.date !== entry.date ? d.date : null,
      p_note: d.note || null,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    setNotice(data === 'adjusted'
      ? `${req.drivers?.name ?? 'Driver'}: correction recorded as an adjustment on this month's payout (the paid month is unchanged).`
      : `${req.drivers?.name ?? 'Driver'}: entry corrected.`);
    apply(await load());
  }

  async function reject(req: RequestRow) {
    setBusy(req.id); setError(null); setNotice(null);
    const { error: err } = await createClient().rpc('reject_correction', {
      p_request_id: req.id, p_note: draftFor(req).note || null,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    apply(await load());
  }

  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Correction Requests</h1>
          <p className="text-sm text-zinc-500 mt-1">Approving a request applies the correction. Every change is recorded in the audit log.</p>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${isConnected ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500'}`}>
          <Radio className="h-3 w-3" />{isConnected ? 'Live' : 'Connecting…'}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-xl flex items-center gap-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{notice}
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" /> Pending ({pending.length})
        </h2>
        {isLoading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : pending.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-zinc-400">No pending requests.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {pending.map(req => {
              const entry = entries[req.record_id];
              const paidMonth = isPaidMonth(entry);
              const d = draftFor(req);
              return (
                <Card key={req.id} className="border-amber-200 dark:border-amber-900/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm">{req.drivers?.name ?? 'Unknown driver'}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {entry
                            ? <>{entry.detail} · {entry.date} · SAR {fmt(entry.amount)}</>
                            : <>This {req.record_type} could not be loaded (it may have been deleted).</>}
                          {' · '}requested {new Date(req.created_at).toLocaleString('en-SA')}
                        </CardDescription>
                      </div>
                      <Link href={`/admin/audit?record=${req.record_id}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1 shrink-0">
                        <History className="h-3 w-3" />History
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 italic">&ldquo;{req.reason}&rdquo;</p>
                    {paidMonth && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
                        This entry is in a month that has already been paid. Only the amount can be corrected; the difference will be added to this month&apos;s payout as an adjustment.
                      </p>
                    )}
                    {entry && (
                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="text-xs font-semibold text-zinc-500 space-y-1">
                          <span>Corrected amount (SAR)</span>
                          <Input type="number" min="0" step="0.01" value={d.amount} onChange={e => setDraft(req, { amount: e.target.value })} className="h-9" />
                        </label>
                        <label className="text-xs font-semibold text-zinc-500 space-y-1">
                          <span>Corrected date</span>
                          <Input type="date" value={d.date} disabled={paidMonth} onChange={e => setDraft(req, { date: e.target.value })} className="h-9" />
                        </label>
                        <label className="text-xs font-semibold text-zinc-500 space-y-1">
                          <span>Note to driver (optional)</span>
                          <Input value={d.note} onChange={e => setDraft(req, { note: e.target.value })} className="h-9" />
                        </label>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy === req.id || !entry} className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approve(req)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />{busy === req.id ? 'Applying…' : 'Apply correction'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === req.id} className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => reject(req)}>
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">Resolved ({resolved.length})</h2>
          <div className="space-y-2">
            {resolved.map(req => (
              <Card key={req.id} className="opacity-80">
                <CardContent className="py-3 flex items-start gap-3">
                  {req.status === 'approved'
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0 text-sm">
                    <span className="font-medium">{req.drivers?.name ?? 'Unknown driver'}</span>
                    <span className="text-zinc-400 mx-1.5">·</span>
                    <span className="text-zinc-500">{req.record_type}</span>
                    <span className="text-zinc-400 mx-1.5">·</span>
                    <span className="text-zinc-600 dark:text-zinc-300">
                      {req.resolution === 'edited' && 'Entry corrected'}
                      {req.resolution === 'adjusted' && 'Adjustment added to the current payout'}
                      {(req.resolution === 'rejected' || (!req.resolution && req.status === 'rejected')) && 'Rejected'}
                      {!req.resolution && req.status === 'approved' && 'Approved (before corrections were applied automatically)'}
                    </span>
                    {req.applied_values && (
                      <span className="text-zinc-500">
                        {' '}· SAR {fmt(req.applied_values.amount_before)} → {fmt(req.applied_values.amount_after)}
                        {req.applied_values.date_before !== req.applied_values.date_after && <> · {req.applied_values.date_before} → {req.applied_values.date_after}</>}
                      </span>
                    )}
                    {req.admin_note && <p className="text-xs text-zinc-500 mt-0.5">Note: {req.admin_note}</p>}
                  </div>
                  <Link href={`/admin/audit?record=${req.record_id}`} className="text-xs text-indigo-600 hover:underline shrink-0">History</Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
