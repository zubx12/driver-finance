'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Building, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import Link from 'next/link';

export default function VouchersPage() {
  const allRides = useLiveQuery(() => db.rides.toArray(), [], []);
  const payers = useLiveQuery(() => db.payers.toArray(), [], []);

  const [expandedPayerId, setExpandedPayerId] = useState<string | null>(null);

  const voucherRides = allRides.filter(r => r.revenueType === 'VOUCHER');
  const totalVoucherRevenue = voucherRides.reduce((sum, r) => sum + r.amount, 0);
  const collectedVoucherRevenue = voucherRides.filter(r => r.paymentStatus === 'Collected').reduce((sum, r) => sum + r.amount, 0);
  const outstandingVoucherRevenue = totalVoucherRevenue - collectedVoucherRevenue;

  // Group by payer
  const ridesByPayer = voucherRides.reduce((acc, ride) => {
    if (!ride.payerId) return acc;
    if (!acc[ride.payerId]) {
      acc[ride.payerId] = [];
    }
    acc[ride.payerId].push(ride);
    return acc;
  }, {} as Record<string, typeof voucherRides>);

  const togglePayer = (payerId: string) => {
    setExpandedPayerId(prev => prev === payerId ? null : payerId);
  };

  const getPayerName = (id: string) => {
    return payers.find(p => p.id === id)?.name || 'Unknown Payer';
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <Link href="/driver" className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-bold text-lg tracking-tight">Voucher Receivables</h1>
      </header>

      <main className="flex-1 p-4 pb-32 space-y-6">
        
        {/* BIG SUMMARY CARD */}
        <Card className="border-amber-500 bg-amber-500 text-white shadow-lg overflow-hidden">
          <CardHeader className="p-5 pb-2 text-center">
            <CardTitle className="text-sm font-medium text-amber-100 uppercase tracking-wider">
              Total Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 text-center space-y-4">
            <div className="text-5xl font-bold tracking-tight">
              SAR {outstandingVoucherRevenue.toLocaleString()}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm pt-4 border-t border-amber-400/50">
              <div>
                <p className="text-amber-200">Total Vouchers</p>
                <p className="font-semibold">SAR {totalVoucherRevenue.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-amber-200">Collected</p>
                <p className="font-semibold">SAR {collectedVoucherRevenue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PAYER GROUPS */}
        <div className="space-y-4">
          <h2 className="font-bold text-lg px-1">Outstanding by Payer</h2>
          
          {Object.keys(ridesByPayer).length === 0 ? (
            <div className="text-center p-8 text-zinc-500">No voucher rides recorded.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(ridesByPayer).map(([payerId, rides]) => {
                const outstandingRides = rides.filter(r => r.paymentStatus !== 'Collected');
                const outstandingAmount = outstandingRides.reduce((sum, r) => sum + r.amount, 0);
                
                if (outstandingAmount === 0) return null; // Don't show fully paid payers here

                const isExpanded = expandedPayerId === payerId;

                return (
                  <Card key={payerId} className="border-zinc-200 shadow-sm overflow-hidden">
                    {/* PAYER HEADER (Clickable) */}
                    <div 
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                      onClick={() => togglePayer(payerId)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                          <Building className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{getPayerName(payerId)}</p>
                          <p className="text-xs text-zinc-500">{outstandingRides.length} outstanding rides</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-bold text-amber-600 dark:text-amber-500">
                            SAR {outstandingAmount.toFixed(2)}
                          </p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-5 w-5 text-zinc-400" /> : <ChevronDown className="h-5 w-5 text-zinc-400" />}
                      </div>
                    </div>

                    {/* EXPANDED RIDES LIST */}
                    {isExpanded && (
                      <div className="bg-zinc-50 dark:bg-zinc-900/30 border-t dark:border-zinc-800 divide-y dark:divide-zinc-800">
                        {outstandingRides.map(ride => (
                          <div key={ride.id} className="p-3 pl-16 flex justify-between items-center text-sm">
                            <div>
                              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                                {ride.date}
                                {ride.voucherReference && <span className="text-zinc-400 ml-2">({ride.voucherReference})</span>}
                              </p>
                              {ride.notes && <p className="text-xs text-zinc-500">{ride.notes}</p>}
                            </div>
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              SAR {ride.amount.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
