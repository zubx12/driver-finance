'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { partnerService } from '@/services/partner-service';
import { Partner, PartnerVehicle, OwnershipArrangement } from '@/types/partner';
import { Card, CardContent } from '@/components/ui/card';
import { Car, ChevronRight } from 'lucide-react';

export default function PartnerVehiclesPage() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [vehicles, setVehicles] = useState<PartnerVehicle[]>([]);
  const [ownerships, setOwnerships] = useState<Record<string, OwnershipArrangement>>({});
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
      setIsLoading(false);
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3 mb-6"></div>
        <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
        <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Vehicle Portfolio</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          You currently hold an ownership stake in {vehicles.length} vehicles.
        </p>
      </header>

      <div className="space-y-3">
        {vehicles.map(v => {
          const vOwn = ownerships[v.id];
          return (
            <Link key={v.id} href={`/partner/vehicles/${v.id}`} className="block">
              <Card className="border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-zinc-100 dark:bg-zinc-900 p-3 rounded-xl">
                      <Car className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    <div>
                      <div className="font-bold text-base">{v.make} {v.model}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{v.plateNumber} • {v.year}</div>
                      
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500">My Stake:</span>
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded">
                          {vOwn?.percentage || 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <ChevronRight className="h-5 w-5 text-zinc-400" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
