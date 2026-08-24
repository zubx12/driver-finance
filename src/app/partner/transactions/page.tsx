'use client';

import { useEffect, useState } from 'react';
import { partnerService } from '@/services/partner-service';
import { Partner, PartnerVehicle } from '@/types/partner';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, ArrowDownLeft, ArrowUpRight, Filter } from 'lucide-react';
import { MOCK_RIDES, MOCK_EXPENSES } from '@/data/mock-partner-data';

interface UnifiedTransaction {
  id: string;
  date: string;
  vehicleId: string;
  type: 'Revenue' | 'Expense';
  category: string;
  amount: number;
  reference: string;
}

export default function PartnerTransactionsPage() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [vehicles, setVehicles] = useState<PartnerVehicle[]>([]);
  const [allTransactions, setAllTransactions] = useState<UnifiedTransaction[]>([]);
  const [filterType, setFilterType] = useState('All');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const p = await partnerService.getCurrentPartner();
      setPartner(p);

      const v = await partnerService.getPartnerVehicles(p.id);
      setVehicles(v);
      const vIds = v.map(vec => vec.id);

      // Create a unified list of transactions for this partner's vehicles
      const txns: UnifiedTransaction[] = [];
      
      MOCK_RIDES.forEach(r => {
        if (vIds.includes(r.vehicleId)) {
          txns.push({
            id: r.id,
            date: r.date,
            vehicleId: r.vehicleId,
            type: 'Revenue',
            category: r.paymentMethod + ' Ride',
            amount: r.amount,
            reference: r.reference || 'Ride'
          });
        }
      });

      MOCK_EXPENSES.forEach(e => {
        if (vIds.includes(e.vehicleId)) {
          txns.push({
            id: e.id,
            date: e.date,
            vehicleId: e.vehicleId,
            type: 'Expense',
            category: e.category,
            amount: e.amount,
            reference: 'Expense'
          });
        }
      });
      
      // Sort by date descending
      txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setAllTransactions(txns);
      setIsLoading(false);
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3 mb-6"></div>
        <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded mb-4"></div>
        <div className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
        <div className="h-20 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
      </div>
    );
  }

  // Filter transactions
  const filteredTransactions = allTransactions.filter(t => {
    if (filterType !== 'All' && t.type !== filterType) return false;
    if (search && !t.reference.toLowerCase().includes(search.toLowerCase()) && !t.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Read-only ledger for your vehicles.</p>
      </header>

      {/* FILTERS */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input 
            placeholder="Search reference or category..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl text-sm"
          />
        </div>
        <Select value={filterType} onValueChange={(val) => val && setFilterType(val as string)}>
          <SelectTrigger className="w-[120px] h-10 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Types</SelectItem>
            <SelectItem value="Revenue">Revenue</SelectItem>
            <SelectItem value="Expense">Expense</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* TRANSACTION LIST */}
      <div className="space-y-3">
        {filteredTransactions.map(t => {
          const isRevenue = t.type === 'Revenue';
          const isExpense = t.type === 'Expense';
          const vehicle = vehicles.find(v => v.id === t.vehicleId);
          const Icon = isRevenue ? ArrowUpRight : isExpense ? ArrowDownLeft : Filter;
          
          return (
            <Card key={t.id} className="border-zinc-200 dark:border-zinc-800 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${isRevenue ? 'bg-emerald-100 dark:bg-emerald-900/30' : isExpense ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                    <Icon className={`h-4 w-4 ${isRevenue ? 'text-emerald-600 dark:text-emerald-400' : isExpense ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-600 dark:text-zinc-400'}`} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{t.category}</div>
                    <div className="text-[10px] text-zinc-500 flex gap-2 mt-0.5">
                      <span>{new Date(t.date).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{vehicle?.plateNumber}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`font-bold text-sm ${isRevenue ? 'text-emerald-600 dark:text-emerald-400' : isExpense ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                    {isRevenue ? '+' : isExpense ? '-' : ''}SAR {t.amount.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{t.reference}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredTransactions.length === 0 && (
          <div className="text-center py-12 px-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
            <p className="text-sm text-zinc-500">No transactions found.</p>
          </div>
        )}
      </div>

    </div>
  );
}
