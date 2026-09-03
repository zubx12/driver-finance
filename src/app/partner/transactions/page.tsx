'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePartner } from '@/contexts/PartnerContext';
import { ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react';

type TxType = 'all' | 'ride' | 'expense';

interface Tx {
  id: string;
  type: 'ride' | 'expense';
  date: string;
  amount: number;
  description: string;
  driverName: string;
  vehicleName: string;
  paymentMethod?: string;
}

export default function PartnerTransactionsPage() {
  const { partnerId, loading: partnerLoading } = usePartner();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TxType>('all');

  useEffect(() => {
    if (!partnerId) return;
    const load = async () => {
      setLoading(true);
      const supabase = createClient();

      // Get all vehicle_ids this partner owns
      const { data: vp } = await supabase
        .from('vehicle_partners')
        .select('vehicle_id')
        .eq('partner_id', partnerId)
        .is('effective_to', null);

      const vehicleIds = (vp ?? []).map((v: any) => v.vehicle_id);
      if (vehicleIds.length === 0) { setLoading(false); return; }

      // Fetch rides + expenses in parallel
      const [ridesRes, expensesRes] = await Promise.all([
        supabase
          .from('rides')
          .select('id, ride_date, amount, payment_method, drivers(name), vehicles(make, model)')
          .in('vehicle_id', vehicleIds)
          .order('ride_date', { ascending: false })
          .limit(200),
        supabase
          .from('expenses')
          .select('id, expense_date, amount, description, drivers(name), vehicles(make, model)')
          .in('vehicle_id', vehicleIds)
          .order('expense_date', { ascending: false })
          .limit(200),
      ]);

      const rides: Tx[] = (ridesRes.data ?? []).map((r: any) => ({
        id: r.id, type: 'ride',
        date: r.ride_date,
        amount: r.amount,
        description: `${r.payment_method ?? 'Cash'} Ride`,
        driverName: r.drivers?.name ?? 'Unknown Driver',
        vehicleName: r.vehicles ? `${r.vehicles.make} ${r.vehicles.model}` : '',
        paymentMethod: r.payment_method,
      }));

      const expenses: Tx[] = (expensesRes.data ?? []).map((e: any) => ({
        id: e.id, type: 'expense',
        date: e.expense_date,
        amount: e.amount,
        description: e.description ?? 'Expense',
        driverName: e.drivers?.name ?? 'Unknown Driver',
        vehicleName: e.vehicles ? `${e.vehicles.make} ${e.vehicles.model}` : '',
      }));

      setTxs([...rides, ...expenses].sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    };
    load();
  }, [partnerId]);

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2 });

  const filtered = txs.filter(t => {
    if (filter !== 'all' && t.type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.driverName.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.vehicleName.toLowerCase().includes(q);
    }
    return true;
  });

  const totalRevenue = txs.filter(t => t.type === 'ride').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  if (partnerLoading || loading) {
    return <div className="p-6 text-zinc-400 text-sm">Loading transactions...</div>;
  }

  return (
    <div className="py-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-sm text-zinc-500">All rides and expenses across your vehicles.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold mb-1">
            <ArrowDownToLine className="h-3.5 w-3.5" />Total Revenue
          </div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">SAR {fmt(totalRevenue)}</div>
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 text-xs font-semibold mb-1">
            <ArrowUpFromLine className="h-3.5 w-3.5" />Total Expenses
          </div>
          <div className="text-xl font-bold text-rose-700 dark:text-rose-300">SAR {fmt(totalExpenses)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search driver, vehicle..." className="w-full h-10 pl-9 pr-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        {(['all', 'ride', 'expense'] as TxType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`h-10 px-4 rounded-xl text-sm font-medium border transition-colors capitalize ${filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'}`}>
            {f === 'all' ? 'All' : f === 'ride' ? 'Rides' : 'Expenses'}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          {txs.length === 0 ? 'No transactions yet. Data will appear as drivers log rides.' : 'No results match your search.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
          {filtered.map(tx => (
            <div key={tx.id} className="flex items-center gap-4 p-4">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${tx.type === 'ride' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-rose-100 dark:bg-rose-900/30'}`}>
                {tx.type === 'ride'
                  ? <ArrowDownToLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  : <ArrowUpFromLine className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.description}</p>
                <p className="text-xs text-zinc-500 truncate">{tx.driverName} · {tx.vehicleName}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold ${tx.type === 'ride' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {tx.type === 'ride' ? '+' : '-'}SAR {fmt(tx.amount)}
                </p>
                <p className="text-xs text-zinc-400">{new Date(tx.date).toLocaleDateString('en-SA', { day: 'numeric', month: 'short' })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}