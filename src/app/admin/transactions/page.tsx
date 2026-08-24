'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Filter, Edit, FileText, Receipt, Car, Calendar as CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';

const MOCK_TRANSACTIONS = [
  { id: 'RDE-4412', type: 'Ride', driver: 'Ahmed Al-Farsi', vehicle: 'Toyota Camry', amount: 150, method: 'Cash', date: '2026-08-23', status: 'Logged' },
  { id: 'EXP-9012', type: 'Expense', driver: 'Ahmed Al-Farsi', vehicle: 'Toyota Camry', amount: 280, method: 'Card', category: 'Fuel', date: '2026-08-23', status: 'Receipt Attached' },
  { id: 'RDE-4413', type: 'Ride', driver: 'Omar Hassan', vehicle: 'Hyundai Sonata', amount: 80, method: 'Voucher', date: '2026-08-23', status: 'Logged' },
  { id: 'RDE-4414', type: 'Ride', driver: 'Fahad Mohammed', vehicle: 'Ford Taurus', amount: 120, method: 'Transfer', date: '2026-08-23', status: 'Logged' },
  { id: 'EXP-9013', type: 'Expense', driver: 'Omar Hassan', vehicle: 'Hyundai Sonata', amount: 150, method: 'Cash', category: 'Maintenance', date: '2026-08-22', status: 'Receipt Attached' },
];

export default function AdminTransactionsPage() {
  const [filter, setFilter] = useState('All');

  const filtered = MOCK_TRANSACTIONS.filter(t => filter === 'All' || t.type === filter);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Reports</h1>
          <p className="text-zinc-500 dark:text-zinc-400">View and edit all daily rides and expenses across the fleet.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={filter === 'All' ? 'default' : 'outline'} onClick={() => setFilter('All')} className={filter === 'All' ? 'bg-indigo-600 text-white' : ''}>All</Button>
          <Button variant={filter === 'Ride' ? 'default' : 'outline'} onClick={() => setFilter('Ride')} className={filter === 'Ride' ? 'bg-indigo-600 text-white' : ''}>Rides</Button>
          <Button variant={filter === 'Expense' ? 'default' : 'outline'} onClick={() => setFilter('Expense')} className={filter === 'Expense' ? 'bg-indigo-600 text-white' : ''}>Expenses</Button>
        </div>
      </header>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="py-4 px-6 border-b dark:border-zinc-800 flex flex-row items-center gap-4">
          <div className="relative flex-1 sm:w-72 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input placeholder="Search driver, vehicle, or ID..." className="pl-9 bg-zinc-50 dark:bg-zinc-900/50" />
          </div>
          <Button variant="outline" className="hidden sm:flex">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50 dark:text-zinc-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium">Details</th>
                  <th className="px-6 py-4 font-medium">Amount</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filtered.map((trx) => (
                  <tr key={trx.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${trx.type === 'Ride' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                          {trx.type === 'Ride' ? <Car className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                        </div>
                        <div>
                          <div className="font-bold">{trx.id}</div>
                          <div className="text-xs text-zinc-500">{trx.type}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-zinc-900 dark:text-white">{trx.driver}</div>
                      <div className="text-xs text-zinc-500">{trx.vehicle} • {trx.category || trx.method}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-bold text-zinc-900 dark:text-white">
                      SAR {trx.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-zinc-500">
                      {trx.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => alert('Admin Edit Modal: Allows Admin to override driver entry. This action will trigger a new record in the Audit Log.')}>
                        <Edit className="h-3.5 w-3.5 mr-1.5" />
                        Admin Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
