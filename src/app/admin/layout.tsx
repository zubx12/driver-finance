'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Car, DollarSign, Menu, ClipboardList, FileText, Wallet, LogOut, Briefcase, Flag } from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await createClient().auth.signOut();
    window.location.href = '/login';
  };

  const navItems = [
    { name: 'Overview', href: '/admin', icon: LayoutDashboard },
    { name: 'Daily Reports', href: '/admin/transactions', icon: FileText },
    { name: 'Drivers', href: '/admin/drivers', icon: Users },
    { name: 'Partners', href: '/admin/partners', icon: Briefcase },
    { name: 'Vehicles', href: '/admin/vehicles', icon: Car },
    { name: 'Salary Runs', href: '/admin/salary', icon: DollarSign },
    { name: 'Settlements', href: '/admin/settlements', icon: Wallet },
    { name: 'Corrections', href: '/admin/corrections', icon: Flag },
    { name: 'Audit Log', href: '/admin/audit', icon: ClipboardList },
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex w-64 flex-col border-r bg-white dark:bg-zinc-950 dark:border-zinc-800 shrink-0">
        <div className="flex h-16 items-center border-b px-6 dark:border-zinc-800">
          <span className="font-bold text-lg tracking-tight">Admin Panel</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50' 
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800">
          <button 
            onClick={handleLogout} 
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>
      
      {/* Mobile header */}
      <header className="flex h-14 items-center justify-between border-b bg-white px-4 lg:hidden dark:bg-zinc-950 dark:border-zinc-800">
        <span className="font-bold">Admin Panel</span>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 -mr-2">
          <Menu className="h-5 w-5" />
        </button>
      </header>
      
      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <nav className="lg:hidden bg-white dark:bg-zinc-950 border-b dark:border-zinc-800 p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium"
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          ))}
          <button 
            onClick={handleLogout} 
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </nav>
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
