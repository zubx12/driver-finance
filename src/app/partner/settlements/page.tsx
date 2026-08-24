'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePartner } from '@/contexts/PartnerContext';
import { CheckCircle, Clock, Wallet } from 'lucide-react';

type Tab = 'pending' | 'paid';

interface Settlement {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  payment_reference: string | null;
  notes: string | null;
  period_start: string;
  period_end: string;
  vehicle_name: string;
  plate_number: string;
  ownership_percentage: number;
}

export default function PartnerSettlementsPage() {
  const { partnerId, loading: partnerLoading } = usePartner();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');

  useEffect(() => {
    if (!partnerId) return;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('partner_settlement_view')
        .select('*')
        .eq('partner_id', partnerId)
        .order('period_start', { ascending: false });
      setSettlements(data ?? []);
      setLoading(false);
    };
    load();
  }, [partnerId]);

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2 });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-SA', { day: 'numeric', month: 'short', year: 'numeric' });

  const visible = settlements.filter(s => s.status === tab);
  const totalPending = settlements.filter(s => s.status === 'pending').reduce((s, r) => s + r.amount, 0);
  const totalPaid = settlements.filter(s => s.status === 'paid').reduce((s, r) => s + r.amount, 0);

  if (partnerLoading || loading) return <div className="p-6 text-zinc-400 text-sm">Loading settlements...</div>;

  return (
    <div className="py-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Wallet</h1>
        <p className="text-sm text-zinc-500">Your revenue share settlements from salary runs.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-semibold mb-1">
            <Clock className="h-3.5 w-3.5" />Pending
          </div>
          <div className="text-xl font-bold text-amber-700 dark:text-amber-300">SAR {fmt(totalPending)}</div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold mb-1">
            <CheckCircle className="h-3.5 w-3.5" />Total Paid
          </div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">SAR {fmt(totalPaid)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
        {(['pending', 'paid'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 h-9 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500'}`}>
            {t === 'pending' ? `Pending (${settlements.filter(s => s.status === 'pending').length})` : `Paid (${settlements.filter(s => s.status === 'paid').length})`}
          </button>
        ))}
      </div>

      {/* Settlement List */}
      {visible.length === 0 ? (
        <div className="text-center py-16 space-y-3 text-zinc-400">
          <Wallet className="h-10 w-10 mx-auto opacity-30" />
          <p className="font-medium text-zinc-500">No {tab} settlements</p>
          <p className="text-sm">{tab === 'pending' ? 'Settlements appear after admin runs and finalizes a salary calculation.' : 'Paid settlements will appear here once your admin marks them as paid.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(s => (
            <div key={s.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{s.vehicle_name}</p>
                  <p className="text-xs text-zinc-500 font-mono">{s.plate_number} · {s.ownership_percentage}% share</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${s.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                  {s.status === 'pending' ? 'Pending' : 'Paid'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div>
                  <p className="text-xs text-zinc-500">Period</p>
                  <p className="text-sm font-medium">{fmtDate(s.period_start)} – {fmtDate(s.period_end)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">Your Share</p>
                  <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">SAR {fmt(s.amount)}</p>
                </div>
              </div>
              {s.status === 'paid' && s.paid_at && (
                <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                  <span>Paid {fmtDate(s.paid_at)}</span>
                  {s.payment_reference && <span className="font-mono">{s.payment_reference}</span>}
                </div>
              )}
              {s.notes && <p className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2">{s.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}