'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Car, Info, Lock, ShieldAlert } from 'lucide-react';
import { MOCK_DRIVER, getActiveVehicleForDriver, getActivePartnersForVehicle } from '@/lib/mock-data';

export default function VehicleDetailsPage() {
  const router = useRouter();
  
  const activeVehicle = getActiveVehicleForDriver(MOCK_DRIVER.id);
  const partners = activeVehicle ? getActivePartnersForVehicle(activeVehicle.id) : [];

  if (!activeVehicle) {
    return <div className="p-8 text-center">No assigned vehicle found.</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.back()} className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg tracking-tight">Vehicle Details</h1>
      </header>

      <main className="flex-1 p-4 pb-24 space-y-6">
        
        <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-10">
            <Car className="h-48 w-48 -mr-10" />
          </div>
          <div className="relative z-10">
            <h2 className="text-2xl font-bold">{activeVehicle.make} {activeVehicle.model}</h2>
            <p className="text-indigo-200 text-lg">{activeVehicle.plateNumber}</p>
            <div className="mt-4 flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-white/20 text-xs font-semibold backdrop-blur-sm">
                ★ Primary Vehicle
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white/20 text-xs font-semibold backdrop-blur-sm">
                {activeVehicle.year}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-zinc-100 dark:bg-zinc-900 p-3 rounded-lg border dark:border-zinc-800">
          <Lock className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Vehicle assignments and ownership configurations are managed by the company. If this information is incorrect, please report it below.
          </p>
        </div>

        {/* OWNERSHIP SECTION */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-2 flex items-center justify-between">
            Vehicle Ownership
            <span className="lowercase font-normal">{partners.length} Partners</span>
          </h3>
          
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardContent className="p-0 divide-y dark:divide-zinc-800">
              {partners.map(partner => (
                <div key={partner.partnerId} className="p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{partner.partnerName}</h4>
                    <p className="text-xs text-zinc-500">Ownership Stake</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{partner.ownershipPercentage}%</span>
                  </div>
                </div>
              ))}
              
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Total Ownership</h4>
                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">100%</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* REPORT ISSUE */}
        <button className="w-full flex items-center justify-center gap-2 p-4 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors border border-transparent hover:border-rose-200 dark:hover:border-rose-900">
          <ShieldAlert className="h-4 w-4" />
          Report Incorrect Information
        </button>

      </main>
    </div>
  );
}
