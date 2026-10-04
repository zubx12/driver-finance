'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hasAppRole } from '@/lib/auth/roles';

/**
 * Link to the other portal, shown only to people who are both a driver and a
 * partner (decision D6). Roles come from app_metadata; the proxy and database
 * enforce access independently, so this only controls what is shown.
 */
export function PortalSwitch({ to }: { to: 'driver' | 'partner' }) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let current = true;
    createClient().auth.getUser().then(({ data }) => {
      if (current) setAllowed(hasAppRole(data.user, to));
    });
    return () => { current = false; };
  }, [to]);

  if (!allowed) return null;

  return (
    <Link
      href={`/${to}`}
      className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-900/50 rounded-2xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors"
    >
      <span className="flex items-center gap-3">
        <ArrowLeftRight className="h-4 w-4" />
        <span className="font-medium">{to === 'partner' ? 'Switch to Partner portal' : 'Switch to Driver app'}</span>
      </span>
    </Link>
  );
}
