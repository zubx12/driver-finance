'use client';

import { useEffect, useState } from 'react';
import { partnerService, CalculatedFinancials } from '@/services/partner-service';
import { Driver, PartnerVehicle } from '@/types/partner';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DriverRow {
  driver: Driver;
  vehicle: PartnerVehicle;
  financials: CalculatedFinancials;
}

export default function PartnerDriverCashPage() {
  const [period, setPeriod] = useState('August 2026');
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      
      const p = await partnerService.getCurrentPartner();
      const vehicles = await partnerService.getPartnerVehicles(p.id);
      const allDrivers = await partnerService.getAllDrivers();
      
      const newRows: DriverRow[] = [];

      // For this mock, we map each vehicle to a driver (assuming 1-to-1 active assignment for the UI)
      // We will calculate financials for that driver+vehicle combination
      for (const v of vehicles) {
        // Just arbitrarily assigning a driver to a vehicle from our mock list
        const d = allDrivers.find(dr => dr.id === 'DRV-01' || dr.id === 'DRV-02' || dr.id === 'DRV-03');
        if (d) {
          const fin = await partnerService.getCalculatedFinancials(period, v.id, d.id);
          // Only show if they actually drove in this period
          if (fin.totalRevenue > 0 || fin.cashHandedOver > 0) {
            newRows.push({ driver: d, vehicle: v, financials: fin });
          }
        }
      }

      setRows(newRows);
      setIsLoading(false);
    }
    loadData();
  }, [period]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3 mb-6"></div>
        <div className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Cash</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Track cash held by drivers.</p>
        </div>
        <Select value={period} onValueChange={(val) => val && setPeriod(val as string)}>
          <SelectTrigger className="w-[140px] h-9 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl text-xs font-medium">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="August 2026">August 2026</SelectItem>
            <SelectItem value="July 2026">July 2026</SelectItem>
            <SelectItem value="Year 2026">Year 2026</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="space-y-4">
        {rows.map((r, i) => {
          const { cashRevenue, cashExpenses, cashHandedOver, driverCashOutstanding } = r.financials;
          // Because of floating point weirdness in JS, round it
          const outstanding = Math.round(driverCashOutstanding);
          const isBalanced = outstanding <= 0;

          return (
            <Card key={i} className={`border-zinc-200 dark:border-zinc-800 ${isBalanced ? 'bg-zinc-50/50 dark:bg-zinc-900/20' : 'border-amber-200/50 dark:border-amber-900/50 shadow-sm'}`}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isBalanced ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                      <Wallet className={`h-5 w-5 ${isBalanced ? 'text-zinc-500' : 'text-amber-600'}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">{r.driver.name}</h3>
                      <div className="text-xs text-zinc-500">{r.vehicle.make} {r.vehicle.model} • {r.vehicle.plateNumber}</div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Expected Cash</div>
                    <div className={`font-bold text-lg ${isBalanced ? 'text-zinc-800 dark:text-zinc-200' : 'text-amber-700 dark:text-amber-400'}`}>
                      SAR {outstanding.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 border-y border-zinc-100 dark:border-zinc-800/50 text-center">
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Cash Rev</div>
                    <div className="font-medium text-sm mt-1">{cashRevenue.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Cash Exp</div>
                    <div className="font-medium text-sm mt-1">{cashExpenses.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Handed Over</div>
                    <div className="font-semibold text-sm mt-1 text-emerald-600 dark:text-emerald-400">{cashHandedOver.toLocaleString()}</div>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isBalanced ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className={`text-xs font-medium ${isBalanced ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {isBalanced ? 'Balanced' : 'Cash Pending Handover'}
                    </span>
                  </div>
                  {!isBalanced && (
                    <span className="text-xs text-zinc-500">Follow up required</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {rows.length === 0 && (
          <div className="text-center py-12 px-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
            <p className="text-sm text-zinc-500">No driver activity in this period.</p>
          </div>
        )}
      </div>
    </div>
  );
}
