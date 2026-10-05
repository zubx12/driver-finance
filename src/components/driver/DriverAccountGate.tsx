'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DoorClosed, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useDriver } from '@/contexts/DriverContext';

// Driver leaving (docs/driver-profile-plan.md §5, L2):
// - Left (or not linked): the database gives no driver record, so the app
//   says the account is closed instead of showing empty screens.
// - Leaving: a banner with the last working day; the app keeps working so
//   the driver can upload entries waiting on the phone and hand over cash.

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function LeavingBanner({ driverId }: { driverId: string }) {
  const [lastDay, setLastDay] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    createClient().rpc('get_driver_employment', { p_driver_id: driverId })
      .then(({ data }) => {
        const d = (data as { current?: { last_working_day?: string | null } } | null)?.current?.last_working_day ?? null;
        if (current) setLastDay(d);
      });
    return () => { current = false; };
  }, [driverId]);

  return (
    <div role="status" className="m-4 mb-0 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <p>
        {lastDay ? <>Your last working day was <b>{fmtDate(lastDay)}</b>. </> : 'You are leaving the company. '}
        Keep the app open until all your entries are uploaded, and hand over the cash you hold. The office will then settle your final payment.
      </p>
    </div>
  );
}

export function DriverAccountGate({ children }: { children: ReactNode }) {
  const { loading, accountClosed, status, driverId } = useDriver();

  if (!loading && accountClosed) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 px-6 py-24">
        <DoorClosed className="h-10 w-10 text-zinc-400" />
        <h1 className="text-lg font-bold">Your driver account is closed</h1>
        <p className="text-sm text-zinc-500 max-w-xs">
          This account is no longer active. If you think this is a mistake, contact the office.
        </p>
        <Button variant="outline" onClick={async () => { await createClient().auth.signOut(); window.location.href = '/login'; }}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <>
      {!loading && status === 'Leaving' && driverId && <LeavingBanner driverId={driverId} />}
      {children}
    </>
  );
}
