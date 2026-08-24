'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Car, Plus, Settings, UserPlus, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function AdminVehiclesPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plateNumber, setPlateNumber] = useState('');

  const loadVehicles = () => {
    setLoading(true);
    fetch('/api/admin/vehicles-list-full')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setVehicles(d); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const handleSubmit = async () => {
    if (!make || !model || !year || !plateNumber) {
      alert('Please fill in all fields');
      return;
    }
    
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/create-vehicle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ make, model, year, plate_number: plateNumber })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setMake('');
      setModel('');
      setYear('');
      setPlateNumber('');
      setDrawerOpen(false);
      loadVehicles();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

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
          
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
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
                  <input type="text" value={make} onChange={(e) => setMake(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" placeholder="e.g. Toyota" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model</label>
                  <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" placeholder="e.g. Camry" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Year</label>
                  <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" placeholder="e.g. 2024" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Plate Number</label>
                  <input type="text" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" placeholder="e.g. ABC 1234" />
                </div>
              </div>
            </div>
            <DrawerFooter className="flex-row gap-2 px-6 pb-6">
              <button 
                disabled={isSaving}
                onClick={handleSubmit}
                className="flex-1 inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors bg-indigo-600 text-white shadow hover:bg-indigo-700 h-10 px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Vehicle'}
              </button>
              <DrawerClose className="flex-1 inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 h-10 px-4 py-2 rounded-xl">
                Cancel
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading && (
          <div className="col-span-3 flex items-center justify-center py-16 text-zinc-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading vehicles...
          </div>
        )}
        {!loading && vehicles.length === 0 && (
          <div className="col-span-3 text-center py-16 text-zinc-400 text-sm">
            No vehicles yet. Add your first vehicle to get started.
          </div>
        )}
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
                    <CardDescription className="font-mono text-xs mt-0.5">{v.plate_number}</CardDescription>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${
                  v.status?.toLowerCase() === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-900/30 dark:text-zinc-400 dark:border-zinc-800/50'
                }`}>
                  {v.status?.toLowerCase() === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </CardHeader>
              <CardContent className="p-4 pt-4 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/20 rounded-b-2xl">
                <div className="flex items-center gap-2">
                  {v.vehicle_partners && v.vehicle_partners.length > 0 ? (
                    <div className="flex -space-x-2">
                      {v.vehicle_partners.map((vp: any, idx: number) => {
                        const colors = ['bg-indigo-100 text-indigo-700', 'bg-rose-100 text-rose-700', 'bg-amber-100 text-amber-700'];
                        const color = colors[idx % colors.length];
                        const initial = vp.partners?.name ? vp.partners.name.substring(0, 2).toUpperCase() : 'P';
                        return (
                          <div key={vp.id} title={`${vp.partners?.name} (${vp.percentage}%)`} className={`h-8 w-8 rounded-full border-2 border-white dark:border-zinc-950 flex items-center justify-center text-[10px] font-bold ${color} dark:bg-opacity-20`}>
                            {initial}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400 font-medium bg-white dark:bg-zinc-950 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800">Unassigned</span>
                  )}
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
