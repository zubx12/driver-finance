import { redirectToTab } from '@/lib/admin-nav';

// Moved into a tab (docs/admin-navigation-plan.md); the old address still works.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirectToTab('vouchers', 'outstanding', await searchParams);
}
