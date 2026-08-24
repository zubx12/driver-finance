'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, History, Settings, WifiOff, BarChart2 } from 'lucide-react';
import { getPendingCount } from '@/lib/data/syncQueue';
import { DriverProvider, useDriver } from '@/contexts/DriverContext';

function SyncBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const { driverId, vehicleId } = useDriver();

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => { setIsOnline(true); getPendingCount().then(setPendingCount); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    getPendingCount().then(setPendingCount);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [driverId, vehicleId]);

  if (isOnline) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-xs font-semibold py-1.5">
      <WifiOff className="h-3 w-3" />
      Offline — entries saved locally, will sync when connected
      {pendingCount > 0 && <span className="bg-white/20 px-1.5 py-0.5 rounded-full">{pendingCount} pending</span>}
    </div>
  );
}

function DriverNav() {
  const pathname = usePathname();
  const isActive = (path: string) => {
    if (path === '/driver') return pathname === '/driver';
    return pathname?.includes(path);
  };
  const cls = (path: string) =>
    `flex flex-col items-center p-2 text-xs font-medium transition-colors ${isActive(path) ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'}`;

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
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
        <SyncBanner />
        <main className="flex-1 overflow-y-auto pb-16">{children}</main>
        <DriverNav />
      </div>
    </DriverProvider>
  );
}