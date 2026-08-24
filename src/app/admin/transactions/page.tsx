'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Edit, Receipt, Car } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

type TrxType = 'All' | 'Ride' | 'Expense';
interface Transaction { id: string; type: 'Ride' | 'Expense'; driverName: string; vehiclePlate: string; amount: number; detail: string; date: string; }

export default function AdminTransactionsPage() {
  const [filter, setFilter] = useState<TrxType>('All');
  const [search, setSearch] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const monthStart = new Date().toISOString().slice(0, 7) + '-01';
      const [ridesRes, expensesRes] = await Promise.all([
        supabase.from('rides').select('id, amount, payment_method, ride_date, drivers(name), vehicles(plate_number)').gte('ride_date', monthStart).order('ride_date', { ascending: false }).limit(200),
        supabase.from('expenses').select('id, amount, category, expense_date, drivers(name), vehicles(plate_number)').gte('expense_date', monthStart).order('expense_date', { ascending: false }).limit(200),
      ]);
      const rides: Transaction[] = (ridesRes.data ?? []).map((r: any) => ({ id: 'RDE-' + r.id.slice(0,6).toUpperCase(), type: 'Ride', driverName: r.drivers?.name ?? 'Unknown', vehiclePlate: r.vehicles?.plate_number ?? '—', amount: r.amount, detail: r.payment_method, date: r.ride_date }));
      const expenses: Transaction[] = (expensesRes.data ?? []).map((e: any) => ({ id: 'EXP-' + e.id.slice(0,6).toUpperCase(), type: 'Expense', driverName: e.drivers?.name ?? 'Unknown', vehiclePlate: e.vehicles?.plate_number ?? '—', amount: e.amount, detail: e.category, date: e.expense_date }));
      setTransactions([...rides, ...expenses].sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    }
    load();
  }, []);

  const filtered = transactions.filter(t => {
    if (filter !== 'All' && t.type !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return t.driverName.toLowerCase().includes(q) || t.vehiclePlate.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Reports</h1>
          <p className="text-zinc-500 dark:text-zinc-400">All rides and expenses this month &middot; {transactions.length} records</p>
        </div>
        <div className="flex gap-2">
          {(['All','Ride','Expense'] as TrxType[]).map(f => (
            <Button key={f} variant={filter===f?'default':'outline'} onClick={() => setFilter(f)} className={filter===f?'bg-indigo-600 text-white':''}>{f}</Button>
          ))}
        </div>
      </header>
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="py-4 px-6 border-b dark:border-zinc-800 flex flex-row items-center gap-4">
          <div className="relative flex-1 sm:w-72 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input placeholder="Search driver, plate, or ID..." className="pl-9 bg-zinc-50 dark:bg-zinc-900/50" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-zinc-400 text-sm">Loading transactions...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 text-sm">No transactions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50">
                  <tr>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium">Details</th>
                    <th className="px-6 py-4 font-medium">Amount</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filtered.map(trx => (
                    <tr key={trx.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${trx.type==='Ride'?'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400':'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                            {trx.type==='Ride'?<Car className="h-4 w-4"/>:<Receipt className="h-4 w-4"/>}
                          </div>
                          <div><div className="font-bold">{trx.id}</div><div className="text-xs text-zinc-500">{trx.type}</div></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="font-medium">{trx.driverName}</div><div className="text-xs text-zinc-500">{trx.vehiclePlate} &middot; {trx.detail}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap font-bold">SAR {trx.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-zinc-500">{trx.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" disabled><Edit className="h-3.5 w-3.5 mr-1.5"/>Admin Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}