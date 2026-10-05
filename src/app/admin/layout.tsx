'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Car, Menu, ClipboardList, LogOut, Briefcase, Inbox, CalendarCheck, Ticket, BarChart3, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAdminCounts, type AdminCounts } from '@/lib/data/adminCounts';

// Admin menu (docs/admin-navigation-plan.md): company-wide work in a few
// grouped pages; everything about one driver lives on the driver's page.
// New features become tabs or sections, not new menu items.

interface NavItem { name: string; href: string; icon: LucideIcon; count?: (c: AdminCounts) => number; }
interface NavGroup { label?: string; items: NavItem[]; }

const NAV: NavGroup[] = [
  { items: [
    { name: 'Overview', href: '/admin', icon: LayoutDashboard },
    { name: 'Inbox', href: '/admin/inbox', icon: Inbox, count: c => c.inbox },
  ] },
  { label: 'Manage', items: [
    { name: 'Drivers', href: '/admin/drivers', icon: Users },
    { name: 'Vehicles', href: '/admin/vehicles', icon: Car },
    { name: 'Partners', href: '/admin/partners', icon: Briefcase },
  ] },
  { label: 'Finance', items: [
    { name: 'Month End', href: '/admin/month-end', icon: CalendarCheck },
    { name: 'Vouchers', href: '/admin/vouchers', icon: Ticket, count: c => c.vouchers_outstanding + c.vouchers_owed_to_partners },
  ] },
  { label: 'Reports', items: [
    { name: 'Reports', href: '/admin/reports', icon: BarChart3 },
  ] },
  { label: 'System', items: [
    { name: 'Audit Log', href: '/admin/audit', icon: ClipboardList },
  ] },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, counts, onNavigate }: { pathname: string | null; counts: AdminCounts | null; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((group, gi) => (
        <div key={group.label ?? gi} className="space-y-1">
          {group.label && (
            <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{group.label}</p>
          )}
          {group.items.map(item => {
            const active = isActive(pathname, item.href);
            const n = counts && item.count ? item.count(counts) : 0;
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50'
                }`}>
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.name}</span>
                {n > 0 && (
                  <span className="min-w-5 rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 text-center text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Refreshed on every page change, so counts follow the office's work.
  const counts = useAdminCounts(pathname);

  const handleLogout = async () => {
    await createClient().auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 print:block print:bg-white print:text-black">
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex print:!hidden w-64 flex-col border-r bg-white dark:bg-zinc-950 dark:border-zinc-800 shrink-0">
        <div className="flex h-16 items-center border-b px-6 dark:border-zinc-800">
          <span className="font-bold text-lg tracking-tight">Admin Panel</span>
        </div>
        <nav className="flex-1 p-4 overflow-y-auto" aria-label="Admin">
          <NavLinks pathname={pathname} counts={counts} />
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
      <header className="flex h-14 items-center justify-between border-b bg-white px-4 lg:hidden print:!hidden dark:bg-zinc-950 dark:border-zinc-800">
        <span className="font-bold">Admin Panel</span>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 -mr-2" aria-label="Menu" aria-expanded={mobileMenuOpen}>
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile menu: the same groups as the sidebar */}
      {mobileMenuOpen && (
        <nav className="lg:hidden print:!hidden bg-white dark:bg-zinc-950 border-b dark:border-zinc-800 p-4" aria-label="Admin">
          <NavLinks pathname={pathname} counts={counts} onNavigate={() => setMobileMenuOpen(false)} />
          <button
            onClick={handleLogout}
            className="mt-3 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </nav>
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 print:p-0 print:overflow-visible">
        {children}
      </main>
    </div>
  );
}
