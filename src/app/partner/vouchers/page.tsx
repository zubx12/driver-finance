'use client';

import { useEffect, useState } from 'react';
import { partnerService } from '@/services/partner-service';
import { Payer, MockRide, VoucherCollection } from '@/types/partner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Receipt } from 'lucide-react';
import { MOCK_RIDES, MOCK_COLLECTIONS, MOCK_PAYERS } from '@/data/mock-partner-data';

interface PayerSummary {
  payer: Payer;
  totalVoucherRevenue: number;
  collected: number;
  outstanding: number;
}

export default function PartnerVouchersPage() {
  const [payerSummaries, setPayerSummaries] = useState<PayerSummary[]>([]);
  const [totals, setTotals] = useState({ revenue: 0, collected: 0, outstanding: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // In a real app, this logic would live in partnerService.
    // For this mock, we calculate it here based on the raw data.
    async function loadData() {
      setIsLoading(true);
      
      const p = await partnerService.getCurrentPartner();
      const myVehicles = await partnerService.getPartnerVehicles(p.id);
      const myVehicleIds = myVehicles.map(v => v.id);

      // Filter rides to only my vehicles
      const myVoucherRides = MOCK_RIDES.filter(r => 
        r.paymentMethod === 'Voucher' && myVehicleIds.includes(r.vehicleId)
      );

      let grandRevenue = 0;
      let grandCollected = 0;

      const summaries = MOCK_PAYERS.map(payer => {
        const payerRides = myVoucherRides.filter(r => r.payerId === payer.id);
        const payerCollections = MOCK_COLLECTIONS.filter(c => c.payerId === payer.id);

        const totalVoucherRevenue = payerRides.reduce((sum, r) => sum + r.amount, 0);
        const collected = payerCollections.reduce((sum, c) => sum + c.amount, 0);
        const outstanding = totalVoucherRevenue - collected;

        grandRevenue += totalVoucherRevenue;
        grandCollected += collected;

        return {
          payer,
          totalVoucherRevenue,
          collected,
          outstanding
        };
      }).filter(s => s.totalVoucherRevenue > 0); // Only show payers with activity

      setTotals({
        revenue: grandRevenue,
        collected: grandCollected,
        outstanding: grandRevenue - grandCollected
      });
      setPayerSummaries(summaries);
      setIsLoading(false);
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3 mb-6"></div>
        <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl mb-4"></div>
        <div className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
      </div>
    );
  }

  // Mock aging calculation
  const aging = {
    '0-7 Days': totals.outstanding * 0.4,
    '8-30 Days': totals.outstanding * 0.35,
    '31-60 Days': totals.outstanding * 0.15,
    '60+ Days': totals.outstanding * 0.1,
  };

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Voucher Receivables</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Track payments owed by agencies.</p>
      </header>

      {/* TOTALS */}
      <Card className="border-indigo-200/50 bg-indigo-50/30 dark:bg-indigo-950/20 dark:border-indigo-900/50">
        <CardContent className="p-4 space-y-4">
          <div className="pb-4 border-b border-indigo-100 dark:border-indigo-900/50">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Total Voucher Revenue</div>
            <div className="text-xl font-bold">SAR {totals.revenue.toLocaleString()}</div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-medium mb-1">Collected</div>
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">SAR {totals.collected.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400 font-medium mb-1">Outstanding</div>
              <div className="text-xl font-bold text-rose-700 dark:text-rose-300">SAR {totals.outstanding.toLocaleString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AGING */}
      <section className="space-y-3 pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Voucher Aging (Outstanding)</h2>
        <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="flex h-2 w-full">
            <div className="bg-emerald-500 w-[40%]"></div>
            <div className="bg-amber-400 w-[35%]"></div>
            <div className="bg-orange-500 w-[15%]"></div>
            <div className="bg-rose-600 w-[10%]"></div>
          </div>
          <CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {Object.entries(aging).map(([label, amount]) => (
              <div key={label} className="p-3 flex justify-between items-center text-sm">
                <span className="text-zinc-600 dark:text-zinc-400 font-medium">{label}</span>
                <span className="font-bold">SAR {Math.round(amount).toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* BY PAYER */}
      <section className="space-y-3 pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">By Payer (Agency)</h2>
        
        <div className="space-y-3">
          {payerSummaries.map((s, i) => (
            <Card key={i} className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-zinc-100 dark:border-zinc-800/50">
                  <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <Building2 className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">{s.payer.name}</h3>
                    <div className="text-xs text-zinc-500">{s.payer.contact}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Total</div>
                    <div className="font-medium text-sm mt-1">{s.totalVoucherRevenue.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Collected</div>
                    <div className="font-semibold text-sm text-emerald-600 dark:text-emerald-400 mt-1">{s.collected.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Outstanding</div>
                    <div className="font-bold text-sm text-rose-600 dark:text-rose-400 mt-1">{s.outstanding.toLocaleString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

    </div>
  );
}
