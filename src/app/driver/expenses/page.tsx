'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle, Receipt, Filter, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';

export default function ExpensesHubPage() {
  const allExpenses = useLiveQuery(() => db.expenses.orderBy('createdAt').reverse().toArray(), [], []);
  
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);

  // Quick Filters
  const todayStr = new Date().toISOString().split('T')[0];
  const todayExpenses = allExpenses.filter(e => e.date === todayStr);
  
  const todayObj = new Date();
  const weekAgo = new Date(todayObj.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);

  const weekExpenses = allExpenses.filter(e => new Date(e.date) >= weekAgo);
  const monthExpenses = allExpenses.filter(e => new Date(e.date) >= monthAgo);
  
  const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
  const weekTotal = weekExpenses.reduce((sum, e) => sum + e.amount, 0);
  const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  const cashExpensesTotal = allExpenses.filter(e => e.paymentSource === 'Cash').reduce((sum, e) => sum + e.amount, 0);

  const selectedExpense = allExpenses.find(e => e.id === selectedExpenseId);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950 relative">
      <header className="flex items-center justify-between h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center">
          <Link href="/driver" className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="font-bold text-lg tracking-tight">MY EXPENSES</h1>
        </div>
      </header>

      <main className="flex-1 p-4 pb-32 space-y-6">
        
        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-indigo-600 bg-indigo-600 text-white shadow-md">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-indigo-200 uppercase tracking-wider">Today's Expenses</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-2xl font-bold">SAR {todayTotal.toLocaleString()}</div>
            </CardContent>
          </Card>
          
          <Card className="border-zinc-200">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">This Week</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">SAR {weekTotal.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">This Month</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">SAR {monthTotal.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card className="border-rose-100 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/50">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-rose-700 dark:text-rose-400 uppercase tracking-wider">Total Cash Impact</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-lg font-bold text-rose-700 dark:text-rose-500">SAR {cashExpensesTotal.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* ADD EXPENSE BUTTON */}
        <Link href="/driver/add-expense" className="block">
          <Button className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 text-white rounded-xl shadow-md gap-2">
            <PlusCircle className="h-5 w-5" />
            Add Expense
          </Button>
        </Link>

        {/* EXPENSE HISTORY */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-lg">Expense History</h2>
            <Button variant="ghost" size="sm" className="h-8 text-zinc-500">
              <Filter className="h-4 w-4 mr-2" /> Filter
            </Button>
          </div>

          <div className="space-y-3">
            {allExpenses.length === 0 ? (
              <div className="text-center p-8 text-zinc-500">No expenses recorded yet.</div>
            ) : (
              allExpenses.map(exp => {
                const isCash = exp.paymentSource === 'Cash';
                return (
                  <Card 
                    key={exp.id} 
                    className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
                    onClick={() => setSelectedExpenseId(exp.id)}
                  >
                    <CardContent className="p-0">
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isCash ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800'}`}>
                            <Receipt className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{exp.category}</p>
                            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                              {new Date(exp.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric'})} • {exp.allocation === 'Current Vehicle' && exp.vehicleId ? exp.vehicleId : exp.allocation}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-zinc-900 dark:text-zinc-100">
                            SAR {exp.amount.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                            {exp.paymentSource}
                          </p>
                        </div>
                      </div>
                      <div className={`px-4 py-2 text-xs flex justify-between items-center border-t dark:border-zinc-800 ${isCash ? 'bg-rose-50 dark:bg-rose-950/20' : 'bg-zinc-50 dark:bg-zinc-900/50'}`}>
                        <span className="font-medium text-zinc-500">Cash Impact:</span>
                        <span className={`font-bold ${isCash ? 'text-rose-600' : 'text-zinc-500'}`}>
                          {isCash ? `-SAR ${exp.amount.toFixed(2)}` : 'SAR 0'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </div>
      </main>

      {/* EXPENSE DETAIL MODAL OVERLAY */}
      {selectedExpense && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-zinc-950 animate-in slide-in-from-bottom-full">
          <header className="flex items-center justify-between h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 shadow-sm">
            <h1 className="font-bold text-lg tracking-tight">Expense Detail</h1>
            <button onClick={() => setSelectedExpenseId(null)} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500">
              <X className="h-6 w-6" />
            </button>
          </header>
          
          <main className="flex-1 overflow-y-auto p-4 space-y-6 pb-safe">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="p-5 flex justify-between items-end border-b dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <div>
                  <p className="text-xs text-zinc-500 font-medium mb-1">AMOUNT</p>
                  <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                    SAR {selectedExpense.amount.toFixed(2)}
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${selectedExpense.paymentSource === 'Cash' ? 'bg-rose-100 text-rose-700' : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}`}>
                  {selectedExpense.paymentSource}
                </div>
              </div>
              
              <div className="p-5 space-y-4 text-sm divide-y dark:divide-zinc-800">
                <div className="flex justify-between pb-4">
                  <span className="text-zinc-500">ID</span>
                  <span className="font-mono text-xs text-zinc-400">{selectedExpense.id}</span>
                </div>
                <div className="flex justify-between py-4">
                  <span className="text-zinc-500">Date & Time</span>
                  <span className="font-semibold text-right">{selectedExpense.date}<br/><span className="text-zinc-400 font-normal">{selectedExpense.time || 'N/A'}</span></span>
                </div>
                <div className="flex justify-between py-4">
                  <span className="text-zinc-500">Category</span>
                  <span className="font-semibold">{selectedExpense.category}</span>
                </div>
                {selectedExpense.description && (
                  <div className="flex justify-between py-4">
                    <span className="text-zinc-500">Description</span>
                    <span className="font-medium text-right max-w-[60%]">{selectedExpense.description}</span>
                  </div>
                )}
                <div className="flex justify-between py-4">
                  <span className="text-zinc-500">Allocation</span>
                  <span className="font-semibold text-right">
                    {selectedExpense.allocation}
                    {selectedExpense.vehicleId && <><br/><span className="text-zinc-400 font-normal">{selectedExpense.vehicleId}</span></>}
                  </span>
                </div>
                <div className="flex justify-between pt-4 pb-2">
                  <span className="text-zinc-500 font-semibold">Cash Impact</span>
                  <span className={`font-bold ${selectedExpense.paymentSource === 'Cash' ? 'text-rose-600' : 'text-zinc-500'}`}>
                    {selectedExpense.paymentSource === 'Cash' ? `-SAR ${selectedExpense.amount.toFixed(2)}` : 'SAR 0.00'}
                  </span>
                </div>
                <div className="flex justify-between pt-4 pb-2">
                  <span className="text-zinc-500">Status</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    ✓ {selectedExpense.syncStatus === 'synced' ? 'Recorded' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            {selectedExpense.receiptImageBase64 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden p-4 space-y-3">
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">Receipt</h3>
                <img src={selectedExpense.receiptImageBase64} alt="Receipt" className="w-full rounded-lg border dark:border-zinc-800" />
              </div>
            ) : (
              <div className="text-center p-4 text-sm text-zinc-500 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
                No receipt uploaded.
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
