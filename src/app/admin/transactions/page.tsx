'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Edit, Receipt, Car, ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';

type TrxType = 'All' | 'Ride' | 'Expense';
interface Transaction { id: string; type: 'Ride' | 'Expense'; driverName: string; vehiclePlate: string; amount: number; detail: string; date: string; receipt_image_url?: string; }

const PAGE_SIZE = 50;

export default function AdminTransactionsPage() {
  const [filter, setFilter] = useState<TrxType>('All');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const monthStart = new Date().toISOString().slice(0, 7) + '-01';
    const offset = (page - 1) * PAGE_SIZE;

    const results: Transaction[] = [];
    let total = 0;

    if (filter === 'All' || filter === 'Ride') {
      let rideQuery = supabase.from('rides')
        .select('id, amount, payment_method, ride_date, drivers(name), vehicles(plate_number)', { count: 'exact' })
        .gte('ride_date', monthStart)
        .order('ride_date', { ascending: false });

      if (debouncedSearch) {
        rideQuery = rideQuery.ilike('drivers.name', `%${debouncedSearch}%`);
      }

      if (filter === 'Ride') {
        rideQuery = rideQuery.range(offset, offset + PAGE_SIZE - 1);
      } else {
        rideQuery = rideQuery.limit(PAGE_SIZE);
      }

      const ridesRes = await rideQuery;
      const rides: Transaction[] = (ridesRes.data ?? []).map((r: any) => ({
        id: 'RDE-' + r.id.slice(0,6).toUpperCase(), type: 'Ride' as const,
        driverName: r.drivers?.name ?? 'Unknown', vehiclePlate: r.vehicles?.plate_number ?? '—',
        amount: r.amount, detail: r.payment_method, date: r.ride_date,
      }));
      results.push(...rides);
      total += ridesRes.count ?? 0;
    }

    if (filter === 'All' || filter === 'Expense') {
      let expQuery = supabase.from('expenses')
        .select('id, amount, category, expense_date, receipt_image_url, drivers(name), vehicles(plate_number)', { count: 'exact' })
        .gte('expense_date', monthStart)
        .order('expense_date', { ascending: false });

      if (debouncedSearch) {
        expQuery = expQuery.ilike('drivers.name', `%${debouncedSearch}%`);
      }

      if (filter === 'Expense') {
        expQuery = expQuery.range(offset, offset + PAGE_SIZE - 1);
      } else {
        expQuery = expQuery.limit(PAGE_SIZE);
      }

      const expensesRes = await expQuery;
      const expenses: Transaction[] = (expensesRes.data ?? []).map((e: any) => ({
        id: 'EXP-' + e.id.slice(0,6).toUpperCase(), type: 'Expense' as const,
        driverName: e.drivers?.name ?? 'Unknown', vehiclePlate: e.vehicles?.plate_number ?? '—',
        amount: e.amount, detail: e.category, date: e.expense_date, receipt_image_url: e.receipt_image_url,
      }));
      results.push(...expenses);
      total += expensesRes.count ?? 0;
    }

    setTransactions(results.sort((a, b) => b.date.localeCompare(a.date)).slice(0, PAGE_SIZE));
    setTotalCount(total);
    setLoading(false);
  }, [filter, debouncedSearch, page]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [filter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Reports</h1>
          <p className="text-zinc-500 dark:text-zinc-400">All rides and expenses this month &middot; {totalCount.toLocaleString()} records</p>
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
            <Input placeholder="Search driver name..." className="pl-9 bg-zinc-50 dark:bg-zinc-900/50" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-zinc-400 text-sm">Loading transactions...</div>
          ) : transactions.length === 0 ? (
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
                  {transactions.map(trx => (
                    <tr key={trx.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${trx.type==='Ride'?'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400':'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                            {trx.type==='Ride'?<Car className="h-4 w-4"/>:<Receipt className="h-4 w-4"/>}
                          </div>
                          <div><div className="font-bold">{trx.id}</div><div className="text-xs text-zinc-500">{trx.type}</div></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium">{trx.driverName}</div>
                        <div className="text-xs text-zinc-500 flex items-center gap-2">
                          {trx.vehiclePlate} &middot; {trx.detail}
                          {trx.receipt_image_url && (
                            <Drawer>
                              <DrawerTrigger>
                                <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"><ImageIcon className="h-3 w-3" />Receipt</Button>
                              </DrawerTrigger>
                              <DrawerContent className="max-h-[90vh]">
                                <DrawerHeader>
                                  <DrawerTitle>Receipt Image</DrawerTitle>
                                </DrawerHeader>
                                <div className="p-4 overflow-auto flex justify-center">
                                  <img src={trx.receipt_image_url} alt="Receipt" className="max-w-full h-auto object-contain rounded-md border" style={{ maxHeight: '60vh' }} />
                                </div>
                                <DrawerFooter>
                                  <DrawerClose>
                                    <Button variant="outline">Close</Button>
                                  </DrawerClose>
                                </DrawerFooter>
                              </DrawerContent>
                            </Drawer>
                          )}
                        </div>
                      </td>
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

          {/* Pagination Controls */}
          {!loading && totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-sm text-zinc-500">
                Page {page} of {totalPages} &middot; {totalCount.toLocaleString()} total
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="gap-1">
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="gap-1">
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}