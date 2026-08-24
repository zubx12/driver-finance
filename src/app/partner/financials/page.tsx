'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { partnerService, CalculatedFinancials } from '@/services/partner-service';
import { Partner, OwnershipArrangement } from '@/types/partner';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, Calendar } from 'lucide-react';

interface PeriodSummary {
  period: string;
  financials: CalculatedFinancials;
  myShare: number;
}

export default function PartnerFinancialsPage() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [periodSummaries, setPeriodSummaries] = useState<PeriodSummary[]>([]);
  const [ytd, setYtd] = useState({ revenue: 0, expenses: 0, net: 0, share: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const p = await partnerService.getCurrentPartner();
      setPartner(p);

      const vehicles = await partnerService.getPartnerVehicles(p.id);
      
      const ownRecord: Record<string, OwnershipArrangement> = {};
      for (const vehicle of vehicles) {
        const o = await partnerService.getOwnership(p.id, vehicle.id);
        if (o) ownRecord[vehicle.id] = o;
      }

      const periodsToLoad = ['August 2026', 'July 2026'];
      const summaries: PeriodSummary[] = [];
      
      let yr = 0;
      let ye = 0;
      let yn = 0;
      let ys = 0;

      for (const period of periodsToLoad) {
        // Overall financials for the period
        const periodFin = await partnerService.getCalculatedFinancials(period);
        
        // Calculate my share by looking at each vehicle's financials
        let myTotalShare = 0;
        for (const vehicle of vehicles) {
          const vFin = await partnerService.getCalculatedFinancials(period, vehicle.id);
          const pct = ownRecord[vehicle.id]?.percentage || 0;
          myTotalShare += vFin.netRevenue * (pct / 100);
        }

        summaries.push({
          period,
          financials: periodFin,
          myShare: myTotalShare
        });

        yr += periodFin.totalRevenue;
        ye += periodFin.totalExpenses;
        yn += periodFin.netRevenue;
        ys += myTotalShare;
      }
      
      setPeriodSummaries(summaries);
      setYtd({ revenue: yr, expenses: ye, net: yn, share: ys });
      
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
        <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Financial Overview</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Track your portfolio's revenue and expenses.</p>
      </header>

      {/* YEAR TO DATE SUMMARY */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Year To Date (2026)</h2>
        
        <Card className="border-indigo-200/50 bg-indigo-50/30 dark:bg-indigo-950/20 dark:border-indigo-900/50">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-indigo-100 dark:border-indigo-900/50">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-medium mb-1">Gross Revenue</div>
                <div className="text-lg font-bold text-emerald-800 dark:text-emerald-300">SAR {ytd.revenue.toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400 font-medium mb-1">Total Expenses</div>
                <div className="text-lg font-bold text-rose-800 dark:text-rose-300">SAR {ytd.expenses.toLocaleString()}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Net Revenue</div>
                <div className="text-xl font-bold">SAR {ytd.net.toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-1">My Est. Share</div>
                <div className="text-xl font-bold text-indigo-700 dark:text-indigo-300">SAR {ytd.share.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* MONTHLY BREAKDOWN */}
      <section className="space-y-3 pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Monthly Periods</h2>
        
        <div className="space-y-3">
          {periodSummaries.map(summary => {
            // Very simple mock status
            const status = summary.period === 'July 2026' ? 'Finalized' : 'Open';

            return (
              <Link key={summary.period} href={`/partner/financials/${encodeURIComponent(summary.period)}`} className="block">
                <Card className="border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-zinc-100 dark:bg-zinc-900 p-3 rounded-xl">
                        <Calendar className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
                      </div>
                      <div>
                        <div className="font-bold text-base">{summary.period}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`h-2 w-2 rounded-full ${status === 'Open' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                          <span className="text-xs text-zinc-500">{status}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right flex items-center gap-4">
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">My Share</div>
                        <div className="font-bold text-indigo-600 dark:text-indigo-400">SAR {summary.myShare.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-zinc-400" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

    </div>
  );
}
