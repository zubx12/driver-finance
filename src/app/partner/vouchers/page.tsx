'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePartner } from '@/contexts/PartnerContext';
import { FileText, AlertCircle } from 'lucide-react';

interface PayerSummary {
  payerId: string;
  payerName: string;
  totalFares: number;
  collected: number;
  outstanding: number;
}

export default function PartnerVouchersPage() {
  const { partnerId, loading: partnerLoading } = usePartner();
  const [payers, setPayers] = useState<PayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [totalCollected, setTotalCollected] = useState(0);

  useEffect(() => {
    if (!partnerId) return;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();

      // Get vehicle_ids for this partner
      const { data: vp } = await supabase
        .from('vehicle_partners')
        .select('vehicle_id')
        .eq('partner_id', partnerId)
        .is('effective_to', null);

      const vehicleIds = (vp ?? []).map((v: any) => v.vehicle_id);
      if (vehicleIds.length === 0) { setLoading(false); return; }

      // Get all voucher rides for partner vehicles
      const { data: rides } = await supabase
        .from('rides')
        .select('id, amount, payment_type, payer_name, voucher_collected')
        .in('vehicle_id', vehicleIds)
        .eq('payment_type', 'voucher');

      if (!rides || rides.length === 0) { setLoading(false); return; }

      // Group by payer_name
      const map: Record<string, PayerSummary> = {};
      for (const r of rides) {
        const key = r.payer_name ?? 'Unknown Payer';
        if (!map[key]) map[key] = { payerId: key, payerName: key, totalFares: 0, collected: 0, outstanding: 0 };
        map[key].totalFares += r.amount ?? 0;
        if (r.voucher_collected) map[key].collected += r.amount ?? 0;
        else map[key].outstanding += r.amount ?? 0;
      }

      const list = Object.values(map).sort((a, b) => b.outstanding - a.outstanding);
      setPayers(list);
      setTotalOutstanding(list.reduce((s, p) => s + p.outstanding, 0));
      setTotalCollected(list.reduce((s, p) => s + p.collected, 0));
      setLoading(false);
    };
    load();
  }, [partnerId]);

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2 });

  if (partnerLoading || loading) return <div className="p-6 text-zinc-400 text-sm">Loading vouchers...</div>;

  return (
    <div className="py-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Voucher Receivables</h1>
        <p className="text-sm text-zinc-500">Outstanding balances owed by voucher payers.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Outstanding</p>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-300">SAR {fmt(totalOutstanding)}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Collected</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">SAR {fmt(totalCollected)}</p>
        </div>
      </div>

      {/* Payer Breakdown */}
      {payers.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 space-y-3">
          <FileText className="h-10 w-10 mx-auto opacity-30" />
          <p>No voucher rides recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payers.map(p => (
            <div key={p.payerId} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{p.payerName}</p>
                  <p className="text-xs text-zinc-500">Total fares: SAR {fmt(p.totalFares)}</p>
                </div>
                {p.outstanding > 0 && (
                  <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0">
                    <AlertCircle className="h-3 w-3" />Outstanding
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <div>
                  <p className="text-xs text-zinc-500">Collected</p>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">SAR {fmt(p.collected)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Still Owed</p>
                  <p className={`text-base font-bold ${p.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>SAR {fmt(p.outstanding)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}