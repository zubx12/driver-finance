'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { riyadhToday } from '@/lib/dates';

// Drivers submit cash handovers from the app; the office confirms them, or
// disputes them with a reason. Only confirmed handovers reduce a driver's cash
// in hand (money-flow plan, 7B/7D). Every decision is in the audit log.

type Status = 'submitted' | 'confirmed' | 'disputed';
type Filter = Status | 'all';

interface HandoverRow {
  id: string;
  driver_id: string;
  amount: number;
  handover_date: string;
  method: 'cash' | 'bank_transfer';
  handed_to: string | null;
  reference: string | null;
  notes: string | null;
  status: Status;
  admin_note: string | null;
  drivers: { name: string } | null;
  vehicles: { plate_number: string } | null;
}
interface DriverOption { id: string; name: string; vehicle_id: string | null; }

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'submitted', label: 'To confirm' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'all', label: 'All' },
];
const fmt = (n: number) => Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchHandovers(filter: Filter): Promise<{ rows?: HandoverRow[]; error?: string }> {
  let q = createClient()
    .from('cash_handovers')
    .select('id, driver_id, amount, handover_date, method, handed_to, reference, notes, status, admin_note, drivers(name), vehicles(plate_number)')
    .order('handover_date', { ascending: false })
    .limit(200);
  if (filter !== 'all') q = q.eq('status', filter);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { rows: (data ?? []) as unknown as HandoverRow[] };
}

export default function AdminHandoversPage() {
  const [filter, setFilter] = useState<Filter>('submitted');
  const [rows, setRows] = useState<HandoverRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Office records a handover directly (cash given without the app).
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ driverId: '', amount: '', date: riyadhToday(), method: 'cash', reference: '' });

  const apply = useCallback((r: { rows?: HandoverRow[]; error?: string }) => {
    if (r.error) setError(r.error);
    else setRows(r.rows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let current = true;
    fetchHandovers(filter).then(r => { if (current) apply(r); });
    return () => { current = false; };
  }, [filter, apply]);

  useEffect(() => {
    createClient().from('drivers').select('id, name, vehicle_id').in('status', ['Active', 'Leaving']).order('name')
      .then(({ data }) => setDrivers((data ?? []) as DriverOption[]));
  }, []);

  const changeFilter = (f: Filter) => {
    if (f === filter) return;
    setLoading(true);
    setFilter(f);
  };

  const review = async (row: HandoverRow, decision: 'confirmed' | 'disputed') => {
    setBusy(row.id); setError(null); setNotice(null);
    const { error: err } = await createClient().rpc('review_cash_handover', {
      p_id: row.id, p_decision: decision, p_note: notes[row.id] || null,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    setNotice(`${row.drivers?.name ?? 'Driver'}: SAR ${fmt(row.amount)} ${decision === 'confirmed' ? 'confirmed' : 'marked as disputed'}.`);
    apply(await fetchHandovers(filter));
  };

  const recordHandover = async () => {
    const amount = Number(form.amount);
    const driver = drivers.find(d => d.id === form.driverId);
    if (!driver) { setError('Choose the driver.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter the amount received.'); return; }
    setBusy('new'); setError(null); setNotice(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // Received in person by the office, so it is recorded as confirmed.
    const { error: err } = await supabase.from('cash_handovers').insert({
      driver_id: driver.id,
      vehicle_id: driver.vehicle_id,
      amount,
      handover_date: form.date,
      method: form.method,
      reference: form.reference || null,
      handed_to: 'Office',
      status: 'confirmed',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      admin_note: 'Recorded by the office',
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    setNotice(`${driver.name}: SAR ${fmt(amount)} recorded and confirmed.`);
    setForm({ driverId: '', amount: '', date: riyadhToday(), method: 'cash', reference: '' });
    setShowForm(false);
    apply(await fetchHandovers(filter));
  };

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cash Handovers</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Cash drivers hand to the office. Only confirmed handovers reduce a driver&apos;s cash in hand.</p>
        </div>
        <Button className="gap-2 rounded-xl" onClick={() => setShowForm(s => !s)}>
          <Plus className="h-4 w-4" />Record a handover
        </Button>
      </header>

      {showForm && (
        <Card className="border-indigo-200 dark:border-indigo-900/50 rounded-xl">
          <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <label className="text-xs font-semibold text-zinc-500 space-y-1 lg:col-span-2">
              <span>Driver</span>
              <select value={form.driverId} onChange={e => setForm(f => ({ ...f, driverId: e.target.value }))}
                className="h-9 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-sm font-normal text-zinc-900 dark:text-zinc-100">
                <option value="">Choose driver…</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-zinc-500 space-y-1">
              <span>Amount (SAR)</span>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="h-9" />
            </label>
            <label className="text-xs font-semibold text-zinc-500 space-y-1">
              <span>Date</span>
              <Input type="date" max={riyadhToday()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9" />
            </label>
            <label className="text-xs font-semibold text-zinc-500 space-y-1">
              <span>Method</span>
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                className="h-9 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-sm font-normal text-zinc-900 dark:text-zinc-100">
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-zinc-500 space-y-1 sm:col-span-2 lg:col-span-4">
              <span>Reference (optional)</span>
              <Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} className="h-9" />
            </label>
            <Button disabled={busy === 'new'} onClick={recordHandover} className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white">
              {busy === 'new' ? 'Saving…' : 'Save'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <Button key={f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'} className="rounded-lg" onClick={() => changeFilter(f.key)}>
            {f.label}
          </Button>
        ))}
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

      {loading ? (
        <div className="text-center text-zinc-400 py-12 text-sm">Loading handovers…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-zinc-400 py-12 text-sm">
          {filter === 'submitted' ? 'Nothing to confirm.' : 'No handovers in this list.'}
        </div>
      ) : (
        <>
          <div className="text-sm text-zinc-500">{rows.length} handover{rows.length === 1 ? '' : 's'} · SAR {fmt(total)}</div>
          <div className="space-y-3">
            {rows.map(row => (
              <Card key={row.id} className="border-zinc-200 dark:border-zinc-800 rounded-xl">
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">SAR {fmt(row.amount)}</span>
                      <span className="text-sm">{row.drivers?.name ?? 'Unknown driver'}</span>
                      {row.vehicles?.plate_number && <span className="text-xs text-zinc-500">{row.vehicles.plate_number}</span>}
                      <span className="text-[10px] font-bold uppercase bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
                        {row.method === 'bank_transfer' ? 'Bank transfer' : 'Cash'}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {row.handover_date}{row.handed_to ? ` · to ${row.handed_to}` : ''}{row.reference ? ` · ref ${row.reference}` : ''}{row.notes ? ` · ${row.notes}` : ''}
                    </div>
                    {row.admin_note && <div className="text-xs mt-1 text-indigo-600 dark:text-indigo-400">Office: {row.admin_note}</div>}
                  </div>
                  {row.status === 'confirmed' ? (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Confirmed</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input placeholder={row.status === 'disputed' ? 'Note (optional)' : 'Reason if disputing'} value={notes[row.id] ?? ''}
                        onChange={e => setNotes(n => ({ ...n, [row.id]: e.target.value }))} className="h-8 w-48 text-xs" />
                      <Button size="sm" disabled={busy === row.id} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => review(row, 'confirmed')}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Confirm
                      </Button>
                      {row.status === 'submitted' && (
                        <Button size="sm" variant="outline" disabled={busy === row.id} className="h-8 text-xs border-red-200 text-red-600"
                          onClick={() => review(row, 'disputed')}>
                          <XCircle className="h-3.5 w-3.5 mr-1" />Dispute
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
