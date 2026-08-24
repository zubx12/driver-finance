'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { partnerService, CalculatedFinancials } from '@/services/partner-service';
import { Partner, PartnerVehicle, OwnershipArrangement } from '@/types/partner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, TrendingUp, TrendingDown, Car } from 'lucide-react';

export default function FinancialPeriodDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const period = decodeURIComponent(params.period as string);

  const [partner, setPartner] = useState<Partner | null>(null);
  const [vehicles, setVehicles] = useState<PartnerVehicle[]>([]);
  const [ownerships, setOwnerships] = useState<Record<string, OwnershipArrangement>>({});
  
  const [totalFinancials, setTotalFinancials] = useState<CalculatedFinancials | null>(null);
  const [vehicleFinancials, setVehicleFinancials] = useState<Record<string, CalculatedFinancials>>({});
  
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const p = await partnerService.getCurrentPartner();
      setPartner(p);

      const v = await partnerService.getPartnerVehicles(p.id);
      setVehicles(v);
      
      const ownRecord: Record<string, OwnershipArrangement> = {};
      for (const vehicle of v) {
        const o = await partnerService.getOwnership(p.id, vehicle.id);
        if (o) ownRecord[vehicle.id] = o;
      }
      setOwnerships(ownRecord);

      // Get portfolio totals
      const f = await partnerService.getCalculatedFinancials(period);
      setTotalFinancials(f);

      // Get per-vehicle financials
      const vFinRecord: Record<string, CalculatedFinancials> = {};
      for (const vehicle of v) {
        vFinRecord[vehicle.id] = await partnerService.getCalculatedFinancials(period, vehicle.id);
      }
      setVehicleFinancials(vFinRecord);

      setIsLoading(false);
    }
    loadData();
  }, [period]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/4 mb-6"></div>
        <div className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
        <div className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
      </div>
    );
  }

  const tFin = totalFinancials;
  if (!tFin) return null;

  // Calculate my share based on individual vehicles
  let myTotalShare = 0;
  vehicles.forEach(v => {
    const vFin = vehicleFinancials[v.id];
    const pct = ownerships[v.id]?.percentage || 0;
    if (vFin) {
      myTotalShare += vFin.netRevenue * (pct / 100);
    }
  });

  const status = period === 'July 2026' ? 'Finalized' : 'Open';

  // Mock revenue and expense breakdown
  const revBreakdown = [
    { label: 'Cash', amount: tFin.cashRevenue },
    { label: 'Voucher', amount: tFin.voucherRevenue },
  ];

  const expBreakdown = [
    { label: 'Cash Expenses', amount: tFin.cashExpenses },
    { label: 'Non-Cash Expenses', amount: tFin.totalExpenses - tFin.cashExpenses },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{period}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`h-2 w-2 rounded-full ${status === 'Open' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            <span className="text-xs text-zinc-500">{status}</span>
          </div>
        </div>
      </header>

      {/* TOTALS */}
      <Card className="border-indigo-200/50 bg-indigo-50/30 dark:bg-indigo-950/20 dark:border-indigo-900/50">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 pb-4 border-b border-indigo-100 dark:border-indigo-900/50">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Gross Revenue</div>
              <div className="text-lg font-bold">SAR {tFin.totalRevenue.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Total Expenses</div>
              <div className="text-lg font-bold">SAR {tFin.totalExpenses.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Net Revenue</div>
              <div className="text-xl font-bold">SAR {tFin.netRevenue.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-1">
                {status === 'Finalized' ? 'Final Share' : 'Estimated Share'}
              </div>
              <div className="text-xl font-bold text-indigo-700 dark:text-indigo-300">SAR {myTotalShare.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BREAKDOWNS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="p-4 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
            <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {revBreakdown.map(item => (
              <div key={item.label} className="p-3 flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{item.label}</span>
                <span className="text-sm font-medium">SAR {item.amount.toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="p-4 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
            <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {expBreakdown.map(item => (
              <div key={item.label} className="p-3 flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{item.label}</span>
                <span className="text-sm font-medium">SAR {item.amount.toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* VEHICLE PROFITABILITY */}
      <section className="space-y-3 pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Vehicle Profitability</h2>
        <div className="space-y-3">
          {vehicles.map(v => {
            const vFin = vehicleFinancials[v.id];
            if (!vFin) return null;
            
            const percentage = ownerships[v.id]?.percentage || 0;
            const vShare = vFin.netRevenue * (percentage / 100);

            return (
              <Card key={v.id} className="border-zinc-200 dark:border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-zinc-100 dark:bg-zinc-900 p-2 rounded-lg">
                      <Car className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    <div className="font-semibold text-sm">{v.make} {v.model} <span className="text-xs text-zinc-500 font-normal ml-2">{v.plateNumber}</span></div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 text-center text-sm">
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase">Rev</div>
                      <div className="font-medium mt-1">{vFin.totalRevenue.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase">Exp</div>
                      <div className="font-medium mt-1">{vFin.totalExpenses.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase">Net</div>
                      <div className="font-semibold mt-1">{vFin.netRevenue.toLocaleString()}</div>
                    </div>
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-md py-1">
                      <div className="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase">Share ({percentage}%)</div>
                      <div className="font-bold text-indigo-700 dark:text-indigo-300 mt-1">{vShare.toLocaleString()}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

    </div>
  );
}
