'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, Car, Percent, Users, Bell, Globe, HelpCircle, LogOut, Lock } from 'lucide-react';
import { MOCK_DRIVER, getActiveVehicleForDriver, getActiveArrangementForDriver, getActivePartnersForVehicle } from '@/lib/mock-data';

export default function DriverProfilePage() {
  const router = useRouter();
  
  const activeVehicle = getActiveVehicleForDriver(MOCK_DRIVER.id);
  const activeArrangement = activeVehicle ? getActiveArrangementForDriver(MOCK_DRIVER.id, activeVehicle.id) : null;
  const partners = activeVehicle ? getActivePartnersForVehicle(activeVehicle.id) : [];

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.back()} className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg tracking-tight">My Profile</h1>
      </header>

      <main className="flex-1 p-4 pb-24 space-y-6">
        
        {/* DRIVER IDENTITY CARD */}
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {MOCK_DRIVER.profilePhoto}
              </div>
              <div>
                <h2 className="text-xl font-bold">{MOCK_DRIVER.name}</h2>
                <p className="text-sm text-zinc-500">{MOCK_DRIVER.id}</p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  {MOCK_DRIVER.status}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CORE NAVIGATION */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-2">Operational Information</h3>
          
          <Link href="/driver/vehicle" className="block">
            <Card className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-lg">
                    <Car className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">My Vehicle</h3>
                    <p className="text-xs text-zinc-500">
                      {activeVehicle ? `${activeVehicle.make} ${activeVehicle.model} • ${activeVehicle.plateNumber}` : 'No Assigned Vehicle'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-zinc-400" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/driver/revenue-share" className="block">
            <Card className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-lg">
                    <Percent className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">My Revenue Share</h3>
                    <p className="text-xs text-zinc-500">
                      {activeArrangement ? `${activeArrangement.percentage}% of ${activeArrangement.calculationBasis}` : 'No active arrangement'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-zinc-400" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/driver/vehicle" className="block">
            <Card className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg">
                    <Users className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Vehicle Ownership</h3>
                    <p className="text-xs text-zinc-500">
                      {partners.length} Partners assigned
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-zinc-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* ACCOUNT NAVIGATION */}
        <div className="space-y-3 pt-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-2">Account settings</h3>
          
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm divide-y dark:divide-zinc-800">
            <button className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
              <div className="flex items-center gap-4">
                <Bell className="h-5 w-5 text-zinc-500" />
                <span className="text-sm font-medium">Notifications</span>
              </div>
            </button>
            <button className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
              <div className="flex items-center gap-4">
                <Globe className="h-5 w-5 text-zinc-500" />
                <span className="text-sm font-medium">Language</span>
              </div>
              <span className="text-xs text-zinc-500">English</span>
            </button>
            <button className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
              <div className="flex items-center gap-4">
                <HelpCircle className="h-5 w-5 text-zinc-500" />
                <span className="text-sm font-medium">Help & Support</span>
              </div>
            </button>
            <button className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors text-rose-600 dark:text-rose-400">
              <div className="flex items-center gap-4">
                <LogOut className="h-5 w-5" />
                <span className="text-sm font-medium">Logout</span>
              </div>
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
