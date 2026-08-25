'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Home, History, Settings, BarChart2 } from 'lucide-react';
import { DriverProvider, useDriver } from '@/contexts/DriverContext';
import { SyncStatusBanner } from '@/components/sync/SyncStatusBanner';
import { startSyncEngine } from '@/lib/sync/sync-engine';

/**
 * SyncEngineStarter
 * Pure side-effect component that boots the sync engine once the driver's
 * identity is resolved from Supabase. Placed inside DriverProvider so it
 * has access to driverId and vehicleId.
 */
function SyncEngineStarter() {
  const { driverId, vehicleId, loading } = useDriver();

  useEffect(() => {
    if (loading || !driverId || !vehicleId) return;
    // startSyncEngine returns a cleanup function — React runs it on unmount
    return startSyncEngine(driverId, vehicleId);
  }, [driverId, vehicleId, loading]);

  return null;
}

function DriverNav() {
  const pathname = usePathname();
  const isActive = (path: string) => {
    if (path === '/driver') return pathname === '/driver';
    return pathname?.includes(path);
  };
  const cls = (path: string) =>
    `flex flex-col items-center p-2 text-xs font-medium transition-colors ${
      isActive(path) ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t bg-white dark:bg-zinc-950 dark:border-zinc-800 pb-safe">
      <Link href="/driver" className={cls('/driver')}><Home className="mb-1 h-5 w-5" />My Day</Link>
      <Link href="/driver/history" className={cls('/history')}><History className="mb-1 h-5 w-5" />History</Link>
      <Link href="/driver/summary" className={cls('/summary')}><BarChart2 className="mb-1 h-5 w-5" />Summary</Link>
      <Link href="/driver/profile" className={cls('/profile')}><Settings className="mb-1 h-5 w-5" />Profile</Link>
    </nav>
  );
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <DriverProvider>
      {/* Starts sync engine once driver identity is loaded */}
      <SyncEngineStarter />
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
        {/* Full-featured sync status banner (replaces the old offline-only banner) */}
        <SyncStatusBanner />
        <main className="flex-1 overflow-y-auto pb-16 pt-0">{children}</main>
        <DriverNav />
      </div>
    </DriverProvider>
  );
}