'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, History, Settings } from 'lucide-react';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
      <main className="flex-1 overflow-y-auto pb-16">
        {children}
      </main>
      
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
