'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

// Tab bar for the admin's tabbed pages (Inbox, Month End, Vouchers, Reports).
// The active tab is in the address (?tab=...), so links, Back and bookmarks
// work. Each tab shows an existing screen unchanged.

export interface HubTab {
  key: string;
  label: string;
  count?: number;
  render: () => ReactNode;
}

export function TabHub({ tabs, label }: { tabs: HubTab[]; label: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get('tab');
  const active = tabs.find(t => t.key === requested) ?? tabs[0];

  const select = (key: string) => {
    if (key === active.key) return;
    // A different tab starts clean (month and filters belong to the screen).
    router.replace(`${pathname}?tab=${key}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <nav aria-label={label} className="max-w-7xl mx-auto print:hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
          {tabs.map(t => (
            <button key={t.key} onClick={() => select(t.key)} aria-current={t.key === active.key ? 'page' : undefined}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                t.key === active.key
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}>
              {t.label}
              {t.count ? (
                <span className="ml-2 inline-flex min-w-5 justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>
      <div key={active.key}>{active.render()}</div>
    </div>
  );
}
