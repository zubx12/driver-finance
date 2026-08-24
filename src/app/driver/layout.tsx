'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, History, Settings, WifiOff } from 'lucide-react';
import { registerOnlineListener, getPendingCount, syncAll } from '@/lib/data/syncQueue';
import { getMyDriverProfile } from '@/lib/data/drivers';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Track online/offline status
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Check pending count on mount
    getPendingCount().then(setPendingCount);

    // Register sync listener — triggers syncAll when connectivity returns
    // Uses a placeholder driverId/vehicleId until we have the real profile
    let cleanup: (() => void) | undefined;
    getMyDriverProfile().then((profile) => {
      if (profile) {
        // Update pending count after potential sync
        getPendingCount().then(setPendingCount);
        cleanup = registerOnlineListener(profile.id, '');
      }
    });

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      cleanup?.();
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
      <main className="flex-1 overflow-y-auto pb-16">
        {children}
      </main>
      
      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-xs font-semibold py-1.5">
          <WifiOff className="h-3 w-3" />
          Offline — entries saved locally, will sync when connected
          {pendingCount > 0 && <span className="bg-white/20 px-1.5 py-0.5 rounded-full">{pendingCount} pending</span>}
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t bg-white dark:bg-zinc-950 dark:border-zinc-800 pb-safe">
        <Link 
          href="/driver" 
          className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${
            pathname === '/driver' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <Home className="mb-1 h-5 w-5" />
          My Day
        </Link>
        <Link 
          href="/driver/history" 
          className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${
            pathname?.includes('/history') ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <History className="mb-1 h-5 w-5" />
          History
        </Link>
        <Link 
          href="/driver/summary" 
          className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${
            pathname?.includes('/summary') ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <svg className="mb-1 h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          Summary
        </Link>
        <Link 
          href="/driver/profile" 
          className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${
            pathname?.includes('/profile') || pathname?.includes('/vehicle') || pathname?.includes('/revenue-share') ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          <Settings className="mb-1 h-5 w-5" />
          Profile
        </Link>
      </nav>
    </div>
  );
}
