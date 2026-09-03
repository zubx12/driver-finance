'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Car, Lock, ShieldAlert } from 'lucide-react';
import { useDriver } from '@/contexts/DriverContext';
import { createClient } from '@/lib/supabase/client';

export default function VehicleDetailsPage() {
  const router = useRouter();
  const { vehicleId, vehicleMake, vehicleModel, vehiclePlate, loading } = useDriver();

  if (loading) return <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>;
  if (!vehicleId) return (
    <div className="p-8 text-center text-zinc-500">
      <Car className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No vehicle assigned yet.</p>
      <p className="text-sm mt-1">Contact your admin to get assigned to a vehicle.</p>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10">
        <button onClick={() => router.back()} className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg">Vehicle Details</h1>
      </header>

      <main className="flex-1 p-4 pb-24 space-y-6">
        <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-10"><Car className="h-48 w-48 -mr-10" /></div>
          <div className="relative z-10">
            <h2 className="text-2xl font-bold">{vehicleMake} {vehicleModel}</h2>
            <p className="text-indigo-200 text-lg">{vehiclePlate}</p>
            <div className="mt-4">
              <span className="px-2.5 py-1 rounded-md bg-white/20 text-xs font-semibold">★ Primary Vehicle</span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-zinc-100 dark:bg-zinc-900 p-3 rounded-lg border dark:border-zinc-800">
          <Lock className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Vehicle assignments are managed by the company. If incorrect, please report below.
          </p>
        </div>



        <button className="w-full flex items-center justify-center gap-2 p-4 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors border border-transparent hover:border-rose-200">
          <ShieldAlert className="h-4 w-4" />Report Incorrect Information
        </button>
      </main>
    </div>
  );
}