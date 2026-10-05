import { redirect } from 'next/navigation';

// Admin navigation (docs/admin-navigation-plan.md): company-wide work lives in
// a few tabbed pages; each tab has its own address. Old page addresses
// redirect to their tab so bookmarks and links keep working.

export const ADMIN_TABS = {
  inbox: ['handovers', 'expenses', 'corrections'],
  'month-end': ['checklist', 'payouts', 'drivers', 'partners'],
  vouchers: ['outstanding', 'partners'],
  reports: ['monthly', 'daily'],
} as const;

export type AdminHub = keyof typeof ADMIN_TABS;
export type AdminTab<H extends AdminHub> = (typeof ADMIN_TABS)[H][number];

/** Address of a tab, with optional extra query values (e.g. month). */
export function adminTabHref<H extends AdminHub>(hub: H, tab: AdminTab<H>, extra?: Record<string, string>): string {
  const q = new URLSearchParams({ tab, ...(extra ?? {}) });
  return `/admin/${hub}?${q.toString()}`;
}

/** Server-side redirect from an old page address, keeping its query values. */
export function redirectToTab<H extends AdminHub>(
  hub: H,
  tab: AdminTab<H>,
  searchParams: Record<string, string | string[] | undefined>,
): never {
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === 'tab' || v === undefined) continue;
    extra[k] = Array.isArray(v) ? v[0] ?? '' : v;
  }
  redirect(adminTabHref(hub, tab, extra));
}
