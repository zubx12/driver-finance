'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Receipt, Car, Wallet, FileText, ArrowDownToLine, ArrowUpFromLine, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDriver } from '@/contexts/DriverContext';
import {
  calculateCashInHand,
  calculateTotalRevenue,
  calculateCashRevenue,
  calculateVoucherRevenue,
  calculateTotalExpenses,
  calculateCashExpenses,
  calculateOutstandingVouchers,
  calculateOutstandingAdvances,
} from '@/lib/finance-service';

export default function DriverDashboard() {
  const { driverName, vehicleMake, vehicleModel, vehiclePlate, vehicleId, loading } = useDriver();
  const [period, setPeriod] = useState('Today');

  const allRides     = useLiveQuery(() => db.rides.toArray(), [], []);
  const allExpenses  = useLiveQuery(() => db.expenses.toArray(), [], []);
  const allHandovers = useLiveQuery(() => db.cashHandovers.toArray(), [], []);
  const allAdvances  = useLiveQuery(() => db.advances.toArray(), [], []);

  const filterByPeriod = (itemDate: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const d = new Date(itemDate);
    const now = new Date();
    switch (period) {
      case 'Today':      return itemDate === todayStr;
      case 'This Week':  return d >= new Date(now.getTime() - 7 * 86400000);
      case 'This Month': return d >= new Date(now.getFullYear(), now.getMonth(), 1);
      case 'This Year':  return d >= new Date(now.getFullYear(), 0, 1);
      default:           return true;
    }
  };

  const filteredRides    = allRides.filter(r => filterByPeriod(r.date));
  const filteredExpenses = allExpenses.filter(e => filterByPeriod(e.date));

  const cashInHand        = calculateCashInHand(allRides, allExpenses, allHandovers);
  const totalRevenue      = calculateTotalRevenue(filteredRides);
  const cashRevenue       = calculateCashRevenue(filteredRides);
  const voucherRevenue    = calculateVoucherRevenue(filteredRides);
  const totalExpenses     = calculateTotalExpenses(filteredExpenses);
  const cashExpenses      = calculateCashExpenses(filteredExpenses);
  const voucherOutstanding = calculateOutstandingVouchers(allRides);
  const advanceOutstanding = calculateOutstandingAdvances(allAdvances);

  const firstName = driverName ? driverName.split(' ')[0] : 'Driver';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  if (loading) return <div className="p-4 text-zinc-400 text-sm">Loading...</div>;

  return (
    <div className="p-4 space-y-6">
      <header className="pt-4 space-y-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight">{greeting}, {firstName}</h1>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="w-32">
            <Select value={period} onValueChange={val => val && setPeriod(val)}>
              <SelectTrigger size="sm" className="bg-white dark:bg-zinc-900"><SelectValue placeholder="Period" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Today">Today</SelectItem>
                <SelectItem value="This Week">This Week</SelectItem>
                <SelectItem value="This Month">This Month</SelectItem>
                <SelectItem value="This Year">This Year</SelectItem>
                <SelectItem value="All Time">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* Active Vehicle */}
      {vehicleId ? (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-3 flex items-center gap-3 border border-indigo-100 dark:border-indigo-900/50">
          <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg">
            <Car className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="font-semibold text-sm text-indigo-950 dark:text-indigo-100">{vehicleMake} {vehicleModel}</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{vehiclePlate}</p>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 flex items-center gap-3 border border-amber-100 dark:border-amber-900/50">
          <Car className="h-5 w-5 text-amber-500" />
          <p className="text-sm text-amber-700 dark:text-amber-400">No vehicle assigned yet — contact your admin.</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/driver/add-ride">
          <Button className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm text-sm gap-2">
            <PlusCircle className="h-4 w-4" />Add Ride
          </Button>
        </Link>
        <Link href="/driver/expenses">
          <Button variant="outline" className="w-full h-14 rounded-xl shadow-sm text-sm gap-2 border-zinc-200 dark:border-zinc-800">
            <Receipt className="h-4 w-4" />Expenses
          </Button>
        </Link>
      </div>

      {/* Financial Overview */}
      <div className="space-y-3">
        <div className="flex justify-between items-end">
          <h2 className="text-lg font-semibold tracking-tight">Financial Overview</h2>
          <span className="text-xs text-zinc-500 uppercase font-medium">{period}</span>
        </div>

        <Link href="/driver/cash" className="block">
          <Card className="border-indigo-600 bg-indigo-600 text-white shadow-md relative overflow-hidden active:scale-[0.98] transition-transform">
            <div className="absolute right-0 top-0 opacity-10"><Wallet className="w-24 h-24 -mr-4 -mt-4" /></div>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-indigo-100 flex justify-between">
                Expected Cash in Hand<span className="bg-indigo-500/50 px-2 py-0.5 rounded text-xs">Wallet &rarr;</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-bold">SAR {cashInHand.toLocaleString()}</div>
            </CardContent>
          </Card>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-zinc-500 flex gap-1 items-center"><ArrowDownToLine className="w-3 h-3 text-emerald-500" />Total Revenue</CardTitle></CardHeader>
            <CardContent className="p-3 pt-0"><div className="text-lg font-bold">SAR {totalRevenue.toLocaleString()}</div></CardContent>
          </Card>
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-zinc-500 flex gap-1 items-center"><ArrowUpFromLine className="w-3 h-3 text-rose-500" />Total Expenses</CardTitle></CardHeader>
            <CardContent className="p-3 pt-0"><div className="text-lg font-bold">SAR {totalExpenses.toLocaleString()}</div></CardContent>
          </Card>
          <Card className="border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50">
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Cash Revenue</CardTitle></CardHeader>
            <CardContent className="p-3 pt-0"><div className="text-lg font-bold text-emerald-700 dark:text-emerald-500">SAR {cashRevenue.toLocaleString()}</div></CardContent>
          </Card>
          <Card className="border-rose-100 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/50">
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-rose-700 dark:text-rose-400">Cash Expenses</CardTitle></CardHeader>
            <CardContent className="p-3 pt-0"><div className="text-lg font-bold text-rose-700 dark:text-rose-500">SAR {cashExpenses.toLocaleString()}</div></CardContent>
          </Card>
          <Link href="/driver/vouchers" className="block h-full">
            <Card className="border-amber-100 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50 h-full active:scale-[0.98] transition-transform">
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-amber-700 dark:text-amber-400 flex gap-1 items-center"><FileText className="w-3 h-3" />Voucher Revenue</CardTitle></CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg font-bold text-amber-700 dark:text-amber-500">SAR {voucherRevenue.toLocaleString()}</div>
                <div className="text-[10px] mt-1 text-amber-600 dark:text-amber-500 font-medium">Outstanding: SAR {voucherOutstanding.toLocaleString()} &rarr;</div>
              </CardContent>
            </Card>
          </Link>
          <Card className="border-blue-100 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/50">
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs font-medium text-blue-700 dark:text-blue-400 flex gap-1 items-center"><Users className="w-3 h-3" />Advance Outstanding</CardTitle></CardHeader>
            <CardContent className="p-3 pt-0"><div className="text-lg font-bold text-blue-700 dark:text-blue-500">SAR {advanceOutstanding.toLocaleString()}</div></CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}