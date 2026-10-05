'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// What is waiting for the office (get_admin_nav_counts): one call, used by the
// sidebar and by the tabs of Inbox and Vouchers. Refreshed when a page opens.

export interface AdminCounts {
  inbox: number;
  handovers: number;
  expenses: number;
  corrections: number;
  vouchers_outstanding: number;
  vouchers_owed_to_partners: number;
}

export function useAdminCounts(refreshKey?: unknown): AdminCounts | null {
  const [counts, setCounts] = useState<AdminCounts | null>(null);

  useEffect(() => {
    let current = true;
    createClient().rpc('get_admin_nav_counts').then(({ data, error }) => {
      // Counts are a convenience: if they fail, the menu simply shows none.
      if (current && !error && data) setCounts(data as AdminCounts);
    });
    return () => { current = false; };
  }, [refreshKey]);

  return counts;
}
