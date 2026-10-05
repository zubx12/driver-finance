'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Building2, Car, Undo2, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getReceiptSignedUrl } from '@/lib/data/expenses';

// Driver and company expenses never reduce a vehicle's payout on their own
// (docs/payout-rules.md, D5). Here the office decides, per expense: keep it as
// a company cost, or charge it to a vehicle for that month. The database
// refuses changes inside finalized months and records every decision.

type ReviewStatus = 'unreviewed' | 'company_cost' | 'charged';
type Filter = ReviewStatus | 'all';

interface Vehicle { id: string; make: string; model: string; plate_number: string; }
interface ExpenseRow {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  description: string | null;
  allocation: 'Driver' | 'Company';
  review_status: ReviewStatus;
  charged_vehicle_id: string | null;
  receipt_image_url: string;
  drivers: { name: string; vehicle_id: string | null } | null;
}

const PAGE_SIZE = 100;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'unreviewed', label: 'To review' },
  { key: 'company_cost', label: 'Company cost' },
  { key: 'charged', label: 'Charged to vehicle' },
  { key: 'all', label: 'All' },
];

const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vehicleLabel = (v?: Vehicle) => (v ? `${v.make} ${v.model} (${v.plate_number})` : 'Unknown vehicle');

async function fetchExpenses(filter: Filter): Promise<{ rows?: ExpenseRow[]; total?: number; error?: string }> {
  let query = createClient()
    .from('expenses')
    .select('id, expense_date, amount, category, description, allocation, review_status, charged_vehicle_id, receipt_image_url, drivers(name, vehicle_id)', { count: 'exact' })
    .neq('allocation', 'Vehicle')
    .order('expense_date', { ascending: false })
    .limit(PAGE_SIZE);
  if (filter !== 'all') query = query.eq('review_status', filter);
  const { data, error, count } = await query;
  if (error) return { error: error.message };
  return { rows: (data ?? []) as unknown as ExpenseRow[], total: count ?? 0 };
}

export default function ExpenseReviewPage() {
  const [filter, setFilter] = useState<Filter>('unreviewed');
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [chosenVehicle, setChosenVehicle] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applyResult = useCallback((result: { rows?: ExpenseRow[]; total?: number; error?: string }) => {
    if (result.error) setError(result.error);
    else { setRows(result.rows ?? []); setTotal(result.total ?? 0); }
    setLoading(false);
  }, []);

  useEffect(() => {
    let current = true;
    fetchExpenses(filter).then((r) => { if (current) applyResult(r); });
    return () => { current = false; };
  }, [filter, applyResult]);

  useEffect(() => {
    createClient().from('vehicles').select('id, make, model, plate_number').order('make')
      .then(({ data }) => setVehicles((data ?? []) as Vehicle[]));
  }, []);

  const changeFilter = (f: Filter) => {
    if (f === filter) return;
    setLoading(true);
    setFilter(f);
  };

  const decide = async (row: ExpenseRow, decision: ReviewStatus) => {
    const vehicleId = decision === 'charged' ? (chosenVehicle[row.id] ?? row.drivers?.vehicle_id ?? '') : null;
    if (decision === 'charged' && !vehicleId) { setError('Choose the vehicle to charge this expense to.'); return; }
    setBusy(row.id); setError(null); setNotice(null);
    const { error: err } = await createClient().rpc('review_unallocated_expense', {
      p_expense_id: row.id, p_decision: decision, p_vehicle_id: vehicleId,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    setNotice(
      decision === 'charged' ? `SAR ${fmt(Number(row.amount))} charged to ${vehicleLabel(vehicles.find(v => v.id === vehicleId))}.`
      : decision === 'company_cost' ? `SAR ${fmt(Number(row.amount))} kept as a company cost.`
      : 'Decision undone; the expense is back in the review list.'
    );
    applyResult(await fetchExpenses(filter));
  };

  const openReceipt = async (path: string) => {
    try {
      window.open(await getReceiptSignedUrl(path, 300), '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the receipt.');
    }
  };

  const shownTotal = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Expense Review</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Expenses drivers filed as <strong>Driver</strong> or <strong>Company</strong>. They do not reduce any payout until you charge them to a vehicle.
        </p>
      </header>

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
        <div className="text-center text-zinc-400 py-12 text-sm">Loading expenses...</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-zinc-400 py-12 text-sm">
          {filter === 'unreviewed' ? 'Nothing to review. All driver and company expenses have a decision.' : 'No expenses in this list.'}
        </div>
      ) : (
        <>
          <div className="text-sm text-zinc-500">
            {total} expense{total === 1 ? '' : 's'} · SAR {fmt(shownTotal)}
            {total > rows.length && ` (showing the latest ${rows.length})`}
          </div>
          <div className="space-y-3">
            {rows.map(row => {
              const selected = chosenVehicle[row.id] ?? row.charged_vehicle_id ?? row.drivers?.vehicle_id ?? '';
              return (
                <Card key={row.id} className="border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">SAR {fmt(Number(row.amount))}</span>
                        <span className="text-[10px] font-bold uppercase bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{row.allocation}</span>
                        <span className="text-sm text-zinc-600 dark:text-zinc-300">{row.category}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {row.expense_date} · {row.drivers?.name ?? 'Unknown driver'}
                        {row.description && <> · {row.description}</>}
                      </div>
                      {row.review_status !== 'unreviewed' && (
                        <div className="text-xs mt-1 font-medium text-indigo-600 dark:text-indigo-400">
                          {row.review_status === 'company_cost'
                            ? 'Kept as a company cost'
                            : `Charged to ${vehicleLabel(vehicles.find(v => v.id === row.charged_vehicle_id))}`}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => openReceipt(row.receipt_image_url)}>
                        <ImageIcon className="h-3.5 w-3.5" />Receipt
                      </Button>
                      {row.review_status === 'unreviewed' ? (
                        <>
                          <Button variant="outline" size="sm" className="gap-1 text-xs rounded-lg" disabled={busy === row.id}
                            onClick={() => decide(row, 'company_cost')}>
                            <Building2 className="h-3.5 w-3.5" />Company cost
                          </Button>
                          <select
                            aria-label="Vehicle to charge"
                            value={selected}
                            onChange={e => setChosenVehicle(prev => ({ ...prev, [row.id]: e.target.value }))}
                            className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-xs max-w-[12rem]"
                          >
                            <option value="">Choose vehicle…</option>
                            {vehicles.map(v => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
                          </select>
                          <Button size="sm" className="gap-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white" disabled={busy === row.id || !selected}
                            onClick={() => decide(row, 'charged')}>
                            <Car className="h-3.5 w-3.5" />Charge
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" className="gap-1 text-xs rounded-lg" disabled={busy === row.id}
                          onClick={() => decide(row, 'unreviewed')}>
                          <Undo2 className="h-3.5 w-3.5" />Undo
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
