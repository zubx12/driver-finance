'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  HOLDER_LABELS, collectVoucher, fetchPartnerVouchers, payOutVoucherShare,
  type PartnerVoucher, type VoucherHolderStatus,
} from '@/lib/data/partnerVouchers';

// Vouchers handed to partners as part of their share (Phase 7E).
// office:  every partner; pays out parts that someone else collected.
// partner: their own; marks a voucher collected when they receive the money.

type Filter = 'action' | 'all';
const fmt = (n: number) => Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLE: Record<VoucherHolderStatus, string> = {
  with_you: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  collected_by_you: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  owed_to_you: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  paid_to_you: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  cancelled: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

const PARTNER_LABELS: Record<VoucherHolderStatus, string> = {
  with_you: 'Yours to collect',
  collected_by_you: 'Collected by you',
  owed_to_you: 'Collected by someone else: the office owes you',
  paid_to_you: 'Paid to you by the office',
  cancelled: 'Cancelled / disputed',
};

export function PartnerVoucherList({ mode }: { mode: 'office' | 'partner' }) {
  const [rows, setRows] = useState<PartnerVoucher[]>([]);
  const [filter, setFilter] = useState<Filter>('action');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, 'cash' | 'bank_transfer'>>({});

  const load = useCallback(async () => {
    try {
      setRows(await fetchPartnerVouchers());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let current = true;
    fetchPartnerVouchers()
      .then(r => { if (current) { setRows(r); setLoading(false); } })
      .catch(e => { if (current) { setError((e as Error).message); setLoading(false); } });
    return () => { current = false; };
  }, []);

  const needsAction = (r: PartnerVoucher) =>
    mode === 'office' ? r.holder_status === 'owed_to_you' : r.holder_status === 'with_you' || r.holder_status === 'owed_to_you';
  const shown = filter === 'action' ? rows.filter(needsAction) : rows;
  const labels = mode === 'office' ? HOLDER_LABELS : PARTNER_LABELS;
  const totalShown = shown.reduce((t, r) => t + Number(r.amount), 0);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id); setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={filter === 'action' ? 'default' : 'outline'} className="rounded-lg" onClick={() => setFilter('action')}>
          {mode === 'office' ? 'Owed to partners' : 'To collect / owed to you'}
        </Button>
        <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} className="rounded-lg" onClick={() => setFilter('all')}>
          All handed vouchers
        </Button>
        {!loading && shown.length > 0 && (
          <span className="text-sm text-zinc-500 ml-auto">{shown.length} · SAR {fmt(totalShown)}</span>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-400 py-10 text-sm">Loading vouchers…</div>
      ) : shown.length === 0 ? (
        <div className="text-center text-zinc-400 py-10 text-sm">
          {filter === 'action' ? 'Nothing to do here.' : 'No vouchers have been handed over yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(r => (
            <Card key={r.id} className="border-zinc-200 dark:border-zinc-800 rounded-xl">
              <CardContent className="p-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">SAR {fmt(r.amount)}</span>
                    <span className="text-xs text-zinc-500">{r.percentage}% of {fmt(r.ride_amount)}</span>
                    {mode === 'office' && <span className="text-sm">{r.partner_name}</span>}
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[r.holder_status]}`}>
                      {labels[r.holder_status]}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {r.ride_date} · {r.vehicle} · {r.payer ?? 'Voucher'}{r.reference ? ` · ref ${r.reference}` : ''}
                    {r.collected_by_name && ` · collected by ${r.collected_by_name} (${r.collected_by_role})`}
                    {r.paid_out_at && ` · paid out ${new Date(r.paid_out_at).toLocaleDateString()}${r.paid_out_reference ? ` ref ${r.paid_out_reference}` : ''}`}
                  </div>
                </div>

                {mode === 'office' && r.holder_status === 'owed_to_you' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={methods[r.id] ?? 'cash'} onChange={e => setMethods(m => ({ ...m, [r.id]: e.target.value as 'cash' | 'bank_transfer' }))}
                      className="h-8 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-xs">
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank transfer</option>
                    </select>
                    <Input placeholder="Reference" value={refs[r.id] ?? ''} onChange={e => setRefs(x => ({ ...x, [r.id]: e.target.value }))} className="h-8 w-32 text-xs" />
                    <Button size="sm" disabled={busy === r.id} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => run(r.id, () => payOutVoucherShare(r.id, methods[r.id] ?? 'cash', refs[r.id] ?? ''))}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Paid to partner
                    </Button>
                  </div>
                )}

                {mode === 'partner' && r.holder_status === 'with_you' && (
                  <Button size="sm" disabled={busy === r.id} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => run(r.id, () => collectVoucher(r.ride_id))}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />I collected it
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
