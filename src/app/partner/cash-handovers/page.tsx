'use client';

import { useEffect, useState } from 'react';
import { partnerService, CalculatedFinancials } from '@/services/partner-service';
import { PartnerVehicle } from '@/types/partner';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, Info } from 'lucide-react';
import { riyadhToday, monthLabel, previousMonth } from '@/lib/dates';

// Cash handovers are recorded on drivers' phones and are not on the server
// yet, so how much cash a driver still holds cannot be calculated. This page
// shows the real cash taken in and spent per vehicle (for the dates the
// partner held a share) and says plainly that handovers are not available.

interface VehicleCashRow {
  vehicle: PartnerVehicle;
  financials: CalculatedFinancials;
}

/** This month and the five before it (Riyadh calendar). */
function recentPeriods(): string[] {
  const periods: string[] = [];
  for (let day = riyadhToday(); periods.length < 6; day = previousMonth(day).start) {
    periods.push(monthLabel(day));
  }
  return periods;
}

async function loadRows(period: string): Promise<VehicleCashRow[]> {
  const partner = await partnerService.getCurrentPartner();
  const vehicles = await partnerService.getPartnerVehicles(partner.id);
  const rows = await Promise.all(vehicles.map(async (vehicle) => ({
    vehicle,
    financials: await partnerService.getCalculatedFinancials(period, vehicle.id),
  })));
  return rows.filter(r => r.financials.cashRevenue > 0 || r.financials.cashExpenses > 0);
}

export default function PartnerDriverCashPage() {
  const periods = recentPeriods();
  const [period, setPeriod] = useState(periods[0]);
  const [rows, setRows] = useState<VehicleCashRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    loadRows(period)
      .then(r => { if (current) { setRows(r); setError(null); } })
      .catch(e => { if (current) setError(e instanceof Error ? e.message : 'Could not load cash figures'); })
      .finally(() => { if (current) setIsLoading(false); });
    return () => { current = false; };
  }, [period]);

  const changePeriod = (value: string) => {
    if (value === period) return;
    setIsLoading(true);
    setPeriod(value);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24">
      <header className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver Cash</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Cash taken in and spent on your vehicles.</p>
        </div>
        <Select value={period} onValueChange={(val) => val && changePeriod(val as string)}>
          <SelectTrigger className="w-[150px] h-9 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl text-xs font-medium">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </header>

      <div className="flex gap-3 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/20 p-4 text-sm text-indigo-900 dark:text-indigo-200">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Cash handed over by drivers is not recorded on the server yet, so the cash a driver still holds can&apos;t be shown here.
          The office can confirm handovers in the meantime.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-28 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
          <div className="h-28 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 px-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
          <p className="text-sm text-zinc-500">No cash activity on your vehicles in {period}.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(({ vehicle, financials }) => (
            <Card key={vehicle.id} className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <Wallet className="h-5 w-5 text-zinc-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">{vehicle.make} {vehicle.model}</h3>
                    <div className="text-xs text-zinc-500">{vehicle.plateNumber}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/50 text-center">
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Cash taken</div>
                    <div className="font-medium text-sm mt-1">SAR {financials.cashRevenue.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Cash spent</div>
                    <div className="font-medium text-sm mt-1">SAR {financials.cashExpenses.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Handed over</div>
                    <div className="text-xs mt-1 text-zinc-400">Not available yet</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
