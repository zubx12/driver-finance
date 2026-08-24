'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Car, Receipt, Clock, CheckCircle2, Wallet, Building, Circle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function DriverHistoryPage() {
  const [rideFilter, setRideFilter] = useState<'ALL' | 'CASH' | 'VOUCHER'>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('All Time');
  
  const allRides = useLiveQuery(() => db.rides.orderBy('createdAt').reverse().toArray(), []);
  const allExpenses = useLiveQuery(() => db.expenses.orderBy('createdAt').reverse().toArray(), []);
  const payers = useLiveQuery(() => db.payers.toArray(), []);

  const filterByDate = (date: string) => {
    if (dateFilter === 'All Time') return true;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const itemDateObj = new Date(date);
    const todayObj = new Date();
    
    switch (dateFilter) {
      case 'Today': return date === todayStr;
      case 'This Week':
        const weekAgo = new Date(todayObj.getTime() - 7 * 24 * 60 * 60 * 1000);
        return itemDateObj >= weekAgo;
      case 'This Month':
        const monthAgo = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);
        return itemDateObj >= monthAgo;
      default: return true;
    }
  };

  const filteredRides = allRides
    ?.filter(r => rideFilter === 'ALL' || r.revenueType === rideFilter)
    ?.filter(r => filterByDate(r.date));

  const filteredExpenses = allExpenses?.filter(e => filterByDate(e.date));

  const getPayerName = (id?: string) => {
    if (!id || !payers) return null;
    return payers.find(p => p.id === id)?.name;
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="pt-4 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        
        <div className="flex gap-2">
          <Select value={dateFilter} onValueChange={(val) => val && setDateFilter(val as string)}>
            <SelectTrigger className="w-full bg-white dark:bg-zinc-900">
              <SelectValue placeholder="Date Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Today">Today</SelectItem>
              <SelectItem value="This Week">This Week</SelectItem>
              <SelectItem value="This Month">This Month</SelectItem>
              <SelectItem value="All Time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <Tabs defaultValue="rides" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rides">Rides</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        
        <TabsContent value="rides" className="space-y-4 mt-4">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            <button
              onClick={() => setRideFilter('ALL')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${rideFilter === 'ALL' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
            >
              All
            </button>
            <button
              onClick={() => setRideFilter('CASH')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${rideFilter === 'CASH' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
            >
              Cash
            </button>
            <button
              onClick={() => setRideFilter('VOUCHER')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${rideFilter === 'VOUCHER' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
            >
              Voucher
            </button>
          </div>

          {filteredRides?.length === 0 ? (
            <div className="text-center p-8 text-zinc-500">No rides found.</div>
          ) : (
            filteredRides?.map(ride => (
              <Card key={ride.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {ride.revenueType === 'CASH' ? (
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                          <Wallet className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                          <Building className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold">{ride.amount.toFixed(2)} SAR</p>
                        <p className="text-[10px] text-zinc-500 font-medium tracking-wider uppercase">
                          {ride.date} • {ride.time || new Date(ride.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={`text-xs font-bold px-2 py-1 rounded-md ${
                        ride.revenueType === 'CASH' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {ride.revenueType}
                      </div>
                    </div>
                  </div>
                  
                  {ride.revenueType === 'VOUCHER' && ride.payerId && (
                    <div className="text-xs text-zinc-600 bg-zinc-50 p-2 rounded-md">
                      Payer: <span className="font-semibold">{getPayerName(ride.payerId)}</span>
                      {ride.voucherReference && <span className="ml-2 text-zinc-400">({ride.voucherReference})</span>}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-2 border-t">
                    <div className="flex items-center gap-1 font-medium">
                      {ride.paymentStatus === 'Received' || ride.paymentStatus === 'Collected' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-amber-500" />
                      )}
                      {ride.paymentStatus}
                    </div>
                    <div className="text-zinc-400">
                      Sync: {ride.syncStatus}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
        
        <TabsContent value="expenses" className="space-y-4 mt-4">
          {filteredExpenses?.length === 0 ? (
            <div className="text-center p-8 text-zinc-500">No expenses found.</div>
          ) : (
            filteredExpenses?.map(exp => (
              <Card key={exp.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-lg">{exp.amount.toFixed(2)} SAR</p>
                        <p className="text-xs text-zinc-500 capitalize">{exp.category}</p>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-xs font-medium bg-zinc-100 px-2 py-1 rounded">
                        {exp.paymentSource}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t">
                     <span>{exp.date} • {new Date(exp.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                     <span className="inline-flex items-center gap-1 font-medium">
                      {exp.syncStatus === 'pending' ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                      {exp.syncStatus}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
