import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((url: string) => { throw new Error(`redirect:${url}`); });
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

const { adminTabHref, redirectToTab } = await import('./admin-nav');

describe('admin navigation', () => {
  it('builds a tab address with extra values', () => {
    expect(adminTabHref('month-end', 'payouts')).toBe('/admin/month-end?tab=payouts');
    expect(adminTabHref('reports', 'monthly', { kind: 'driver', month: '2026-08' }))
      .toBe('/admin/reports?tab=monthly&kind=driver&month=2026-08');
  });

  it('redirects an old address to its tab and keeps its query values', () => {
    expect(() => redirectToTab('month-end', 'drivers', { month: '2026-09', tab: 'ignored', empty: undefined }))
      .toThrow('redirect:/admin/month-end?tab=drivers&month=2026-09');
    expect(() => redirectToTab('inbox', 'handovers', { status: ['submitted', 'x'] }))
      .toThrow('redirect:/admin/inbox?tab=handovers&status=submitted');
  });
});
