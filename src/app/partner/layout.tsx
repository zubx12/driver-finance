'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Car, PieChart, Wallet, Menu, Bell, LogOut, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PartnerProvider, usePartner } from '@/contexts/PartnerContext';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

function PartnerLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { partnerName, loading } = usePartner();
  const [scrolled, setScrolled] = useState(false);

  const initials = partnerName
    ? partnerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const handleLogout = async () => {
    await createClient().auth.signOut();
    router.push('/login');
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { name: 'Home', href: '/partner', icon: Home },
    { name: 'Vehicles', href: '/partner/vehicles', icon: Car },
    { name: 'Finance', href: '/partner/financials', icon: PieChart },
    { name: 'Wallet', href: '/partner/settlements', icon: Wallet },
    { name: 'Outstanding', href: '/partner/outstanding', icon: AlertTriangle },
    { name: 'Menu', href: '/partner/settings', icon: Menu },
  ];

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      
      {/* DESKTOP SIDEBAR (Hidden on mobile) */}
      <aside className="hidden lg:flex w-64 flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Al Kiswah Partner</h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/partner' && pathname.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href}>
                <span className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-medium' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/50'}`}>
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col relative w-full h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
        
        {/* MOBILE STICKY HEADER */}
        <header className={`lg:hidden sticky top-0 z-40 transition-all duration-300 px-4 py-3 flex items-center justify-between ${scrolled ? 'bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800' : 'bg-transparent'}`}>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400">{loading ? '…' : initials}</span>
            </div>
            {scrolled && <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 animate-in fade-in">{partnerName || 'Partner Portal'}</h1>}
          </div>
          <button onClick={handleLogout} className="h-8 w-8 rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center shadow-sm border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-rose-500 transition-colors" title="Logout">
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto pb-24 lg:pb-0 px-4 sm:px-6 lg:px-8">
          {children}
        </div>

        {/* MOBILE BOTTOM NAVIGATION */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
          <div className="absolute inset-0 bg-white/80 dark:bg-zinc-900/90 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]"></div>
          <div className="relative flex justify-around items-center px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/partner' && pathname.startsWith(item.href));
              return (
                <Link key={item.name} href={item.href} className="flex flex-col items-center justify-center w-full h-12 relative group">
                  {isActive && <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-500 rounded-b-full"></div>}
                  <div className={`p-1.5 rounded-full transition-all duration-200 ${isActive ? 'bg-indigo-50 dark:bg-indigo-500/10 scale-110' : 'group-active:scale-95'}`}>
                    <item.icon className={`h-[22px] w-[22px] ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`}>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </main>
    </div>
  );
}

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PartnerProvider>
      <PartnerLayoutInner>{children}</PartnerLayoutInner>
    </PartnerProvider>
  );
}
