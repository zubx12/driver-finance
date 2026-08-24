'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Receipt, Car, Users, Percent, Lock, Wallet, FileText, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { getActiveVehicleForDriver, getActiveArrangementForDriver, getActivePartnersForVehicle, MOCK_DRIVER } from '@/lib/mock-data';
import { 
  calculateCashInHand, 
  calculateTotalRevenue, 
  calculateCashRevenue, 
  calculateVoucherRevenue, 
  calculateTotalExpenses,
  calculateCashExpenses, 
  calculateOutstandingVouchers,
  calculateOutstandingAdvances
} from '@/lib/finance-service';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MOCK_FINANCE_RIDES, MOCK_FINANCE_EXPENSES, MOCK_HANDOVERS, MOCK_PAYERS, MOCK_ADVANCES } from '@/lib/mock-finance-data';

export default function DriverDashboard() {
  const [period, setPeriod] = useState<string>('Today');
  const [isSeeding, setIsSeeding] = useState(true);

  // Seed DB if empty
  useEffect(() => {
    async function seedData() {
      const rideCount = await db.rides.count();
      if (rideCount === 0) {
        await db.payers.bulkPut(MOCK_PAYERS);
        await db.rides.bulkPut(MOCK_FINANCE_RIDES);
        await db.expenses.bulkPut(MOCK_FINANCE_EXPENSES);
        await db.cashHandovers.bulkPut(MOCK_HANDOVERS);
        await db.advances.bulkPut(MOCK_ADVANCES);
      }
      setIsSeeding(false);
    }
    seedData();
  }, []);

  const allRides = useLiveQuery(() => db.rides.toArray(), [], []);
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), [], []);
  const allHandovers = useLiveQuery(() => db.cashHandovers.toArray(), [], []);
  const allAdvances = useLiveQuery(() => db.advances.toArray(), [], []);

  // Filter based on period
  const filterByPeriod = (itemDate: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const itemDateObj = new Date(itemDate);
    const todayObj = new Date();
    
    switch (period) {
      case 'Today':
        return itemDate === todayStr;
      case 'This Week':
        const weekAgo = new Date(todayObj.getTime() - 7 * 24 * 60 * 60 * 1000);
        return itemDateObj >= weekAgo;
      case 'This Month':
        const monthAgo = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);
        return itemDateObj >= monthAgo;
      case 'This Year':
        const yearAgo = new Date(todayObj.getFullYear(), 0, 1);
        return itemDateObj >= yearAgo;
      default:
        return true;
    }
  };

  const filteredRides = allRides.filter(r => filterByPeriod(r.date));
  const filteredExpenses = allExpenses.filter(e => filterByPeriod(e.date));

  // Calculations
  // Cash in Hand is NOT filtered by period (it's a current running balance)
  const cashInHand = calculateCashInHand(allRides, allExpenses, allHandovers);
  
  // Dashboard Metrics (Filtered by period except Voucher/Advance Outstanding which usually represents total outstanding)
  const totalRevenue = calculateTotalRevenue(filteredRides);
  const cashRevenue = calculateCashRevenue(filteredRides);
  const voucherRevenue = calculateVoucherRevenue(filteredRides);
  
  const totalExpenses = calculateTotalExpenses(filteredExpenses);
  const cashExpenses = calculateCashExpenses(filteredExpenses);
  
  const voucherOutstanding = calculateOutstandingVouchers(allRides);
  const advanceOutstanding = calculateOutstandingAdvances(allAdvances);
  
  const activeVehicle = getActiveVehicleForDriver(MOCK_DRIVER.id);
  const activeArrangement = activeVehicle ? getActiveArrangementForDriver(MOCK_DRIVER.id, activeVehicle.id) : null;
  const partners = activeVehicle ? getActivePartnersForVehicle(activeVehicle.id) : [];

  const netRevenue = totalRevenue - calculateCashExpenses(filteredExpenses); // simplify net for demo
  const estimatedShare = activeArrangement ? (netRevenue * (activeArrangement.percentage / 100)) : 0;

  if (isSeeding) return <div className="p-4">Loading Dashboard...</div>;

  return (
    <div className="p-4 space-y-6">
      <header className="pt-4 space-y-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight">Good Morning, {MOCK_DRIVER.name.split(' ')[0]}</h1>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="w-32">
            <Select value={period} onValueChange={(val) => val && setPeriod(val as string)}>
              <SelectTrigger size="sm" className="bg-white">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
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

      {/* ACTIVE VEHICLE INDICATOR */}
      {activeVehicle && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-3 flex items-center justify-between border border-indigo-100 dark:border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg">
              <Car className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-none text-indigo-950 dark:text-indigo-100">
                {activeVehicle.make} {activeVehicle.model}
              </p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">{activeVehicle.plateNumber}</p>
            </div>
          </div>
          <div className="text-zinc-400 flex flex-col items-center gap-1 px-2">
            <Lock className="h-4 w-4" />
          </div>
        </div>
      )}
      
      {/* QUICK ACTIONS */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/driver/add-ride">
          <Button className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm text-sm gap-2">
            <PlusCircle className="h-4 w-4" />
            Add Ride
          </Button>
        </Link>
        <Link href="/driver/expenses">
          <Button variant="outline" className="w-full h-14 rounded-xl shadow-sm text-sm gap-2 border-zinc-200 dark:border-zinc-800">
            <Receipt className="h-4 w-4" />
            Expenses
          </Button>
        </Link>
      </div>

      {/* FINANCIAL OVERVIEW */}
      <div className="space-y-3">
        <div className="flex justify-between items-end">
          <h2 className="text-lg font-semibold tracking-tight">Financial Overview</h2>
          <span className="text-xs text-zinc-500 uppercase font-medium">{period}</span>
        </div>

        {/* PRIMARY: Expected Cash In Hand */}
        <Link href="/driver/cash" className="block">
          <Card className="border-indigo-600 bg-indigo-600 text-white shadow-md relative overflow-hidden active:scale-[0.98] transition-transform">
            <div className="absolute right-0 top-0 opacity-10">
              <Wallet className="w-24 h-24 -mr-4 -mt-4" />
            </div>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-indigo-100 flex justify-between">
                Expected Cash in Hand
                <span className="bg-indigo-500/50 px-2 py-0.5 rounded text-xs">Wallet &rarr;</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-bold">
                SAR {cashInHand.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* METRICS GRID */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-zinc-200">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-zinc-500 flex gap-1 items-center">
                <ArrowDownToLine className="w-3 h-3 text-emerald-500" /> Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                SAR {totalRevenue.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-zinc-500 flex gap-1 items-center">
                <ArrowUpFromLine className="w-3 h-3 text-rose-500" /> Total Expenses
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                SAR {totalExpenses.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Cash Revenue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-500">
                SAR {cashRevenue.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card className="border-rose-100 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/50">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-rose-700 dark:text-rose-400">
                Cash Expenses
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold text-rose-700 dark:text-rose-500">
                SAR {cashExpenses.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Link href="/driver/vouchers" className="block h-full">
            <Card className="border-amber-100 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50 h-full active:scale-[0.98] transition-transform">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-medium text-amber-700 dark:text-amber-400 flex gap-1 items-center">
                  <FileText className="w-3 h-3" /> Voucher Revenue
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg font-bold text-amber-700 dark:text-amber-500">
                  SAR {voucherRevenue.toLocaleString()}
                </div>
                <div className="text-[10px] mt-1 text-amber-600 dark:text-amber-500 font-medium">
                  Outstanding: SAR {voucherOutstanding.toLocaleString()} &rarr;
                </div>
              </CardContent>
            </Card>
          </Link>

          <Card className="border-blue-100 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/50 h-full">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-blue-700 dark:text-blue-400 flex gap-1 items-center">
                <Users className="w-3 h-3" /> Advance Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold text-blue-700 dark:text-blue-500">
                SAR {advanceOutstanding.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

    </div>
  );
}

