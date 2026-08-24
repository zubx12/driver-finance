'use client';

import { useEffect, useState } from 'react';
import { partnerService } from '@/services/partner-service';
import { Partner, Settlement } from '@/types/partner';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Circle, Clock } from 'lucide-react';

export default function PartnerSettlementsPage() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const p = await partnerService.getCurrentPartner();
      setPartner(p);

      const s = await partnerService.getSettlements(p.id);
      
      // Group settlements by period for cleaner display
      // In a real app, the API might already aggregate this or we display them individually.
      setSettlements(s);
      
      setIsLoading(false);
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3 mb-6"></div>
        <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl mb-4"></div>
        <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
      </div>
    );
  }

  // Calculate totals across all vehicles
  let totalFinalized = 0;
  let totalPaid = 0;
  let totalPending = 0;

  settlements.forEach(s => {
    totalFinalized += s.finalizedShare;
    totalPaid += s.paidAmount;
    totalPending += s.remainingAmount;
  });

  // Group by period
  const periods = Array.from(new Set(settlements.map(s => s.period)));

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settlements</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Track finalized payouts and pending balances.</p>
      </header>

      {/* OVERVIEW CARDS */}
      <Card className="border-indigo-200/50 bg-indigo-50/30 dark:bg-indigo-950/20 dark:border-indigo-900/50">
        <CardContent className="p-4 space-y-4">
          <div className="border-b border-indigo-100 dark:border-indigo-900/50 pb-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Total Finalized</div>
            <div className="text-xl font-bold">SAR {totalFinalized.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-medium mb-1">Total Paid</div>
              <div className="text-lg font-bold text-emerald-800 dark:text-emerald-300">SAR {totalPaid.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400 font-medium mb-1">Total Pending</div>
              <div className="text-lg font-bold text-rose-800 dark:text-rose-300">SAR {totalPending.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SETTLEMENT LIST */}
      <section className="space-y-4 pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Settlement History</h2>
        
        <div className="space-y-4">
          {periods.map(period => {
            const periodSettlements = settlements.filter(s => s.period === period);
            
            let pFinalized = 0;
            let pPaid = 0;
            let pRemaining = 0;
            let pStatus = 'Open';
            let pDate = null;

            periodSettlements.forEach(s => {
              pFinalized += s.finalizedShare;
              pPaid += s.paidAmount;
              pRemaining += s.remainingAmount;
              pStatus = s.status; // Assumes uniform status across a period for simplicity
              if (s.paymentDate) pDate = s.paymentDate;
            });

            const isPaid = pStatus === 'Paid';
            const isPartial = pStatus === 'Partially Paid';
            
            return (
              <Card key={period} className={`border-zinc-200 dark:border-zinc-800 ${isPaid ? 'opacity-80' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-base">{period}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        {isPaid ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        ) : isPartial ? (
                          <Clock className="h-3 w-3 text-amber-500" />
                        ) : (
                          <Circle className="h-3 w-3 text-rose-500" />
                        )}
                        <span className={`text-xs font-medium ${isPaid ? 'text-emerald-600' : isPartial ? 'text-amber-600' : 'text-rose-600'}`}>
                          {pStatus}
                        </span>
                        {pDate && <span className="text-xs text-zinc-500 ml-1">• On {new Date(pDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{pStatus === 'Open' ? 'Estimated' : 'Finalized'} Share</div>
                      <div className="font-bold">SAR {pFinalized.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Paid</div>
                      <div className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">SAR {pPaid.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Remaining</div>
                      <div className="font-semibold text-sm text-rose-600 dark:text-rose-400">SAR {pRemaining.toLocaleString()}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {settlements.length === 0 && (
            <div className="text-center py-12 px-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
              <p className="text-sm text-zinc-500">No settlements yet.</p>
              <p className="text-xs text-zinc-400 mt-1">Finalized settlements will appear here.</p>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
