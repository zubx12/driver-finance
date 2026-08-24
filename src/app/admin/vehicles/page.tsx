'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Car, Plus, ArrowRight, Settings, UserPlus } from 'lucide-react';
import Link from 'next/link';

// Use same mock data for consistency
import { MOCK_PARTNER_VEHICLES } from '@/data/mock-partner-data';

export default function AdminVehiclesPage() {
  const [vehicles, setVehicles] = useState(MOCK_PARTNER_VEHICLES);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vehicles & Partners</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Manage company vehicles and ownership splits.
          </p>
        </div>
        
        <div className="flex gap-3">
          <Link href="/admin/partners/add">
            <Button variant="outline" className="h-9 px-4 py-2 rounded-xl border-zinc-200 shadow-sm font-medium">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Partner
            </Button>
          </Link>
          
          <Drawer>
            <DrawerTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 bg-indigo-600 text-white shadow hover:bg-indigo-700 h-9 px-4 py-2 rounded-xl">
              <Plus className="h-4 w-4" />
              Add Vehicle
            </DrawerTrigger>
          <DrawerContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
            <DrawerHeader>
              <DrawerTitle>Add New Vehicle</DrawerTitle>
              <DrawerDescription>Create a new vehicle. You can assign partners and splits later.</DrawerDescription>
            </DrawerHeader>
            <div className="p-4 space-y-4 px-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Make</label>
                  <input type="text" className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" placeholder="e.g. Toyota" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model</label>
                  <input type="text" className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" placeholder="e.g. Camry" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Year</label>
                  <input type="number" className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" placeholder="e.g. 2024" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Plate Number</label>
                  <input type="text" className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" placeholder="e.g. ABC 1234" />
                </div>
              </div>
            </div>
            <DrawerFooter className="flex-row gap-2 px-6 pb-6">
              <DrawerClose className="flex-1 inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors bg-indigo-600 text-white shadow hover:bg-indigo-700 h-10 px-4 py-2 rounded-xl" onClick={() => alert('Mock: Vehicle created successfully!')}>
                Save Vehicle
              </DrawerClose>
              <DrawerClose className="flex-1 inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 h-10 px-4 py-2 rounded-xl">
                Cancel
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {vehicles.map((v) => (
          <Card key={v.id} className="border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
            <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="bg-zinc-100 dark:bg-zinc-800 p-2.5 rounded-xl">
                    <Car className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">{v.make} {v.model}</CardTitle>
                    <CardDescription className="font-mono text-xs mt-0.5">{v.plateNumber}</CardDescription>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${
                  v.status === 'Active' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-900/30 dark:text-zinc-400 dark:border-zinc-800/50'
                }`}>
                  {v.status}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-4 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/20 rounded-b-2xl">
              <div className="flex -space-x-2">
                <div className="h-8 w-8 rounded-full border-2 border-white dark:border-zinc-950 bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-[10px] font-bold text-indigo-700 dark:text-indigo-300">P1</div>
                <div className="h-8 w-8 rounded-full border-2 border-white dark:border-zinc-950 bg-rose-100 dark:bg-rose-900 flex items-center justify-center text-[10px] font-bold text-rose-700 dark:text-rose-300">P2</div>
                <div className="h-8 w-8 rounded-full border-2 border-white dark:border-zinc-950 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-700 dark:text-zinc-300">+1</div>
              </div>
              <Link href={`/admin/vehicles/${v.id}/setup`}>
                <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs">
                  <Settings className="h-3.5 w-3.5 mr-1.5" />
                  Manage Split
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
