'use client';

import { Suspense } from 'react';
import { TabHub } from '@/components/admin/TabHub';
import { useAdminCounts } from '@/lib/data/adminCounts';
import OutstandingScreen from '@/components/admin/screens/OutstandingScreen';
import { PartnerVoucherList } from '@/components/PartnerVoucherList';

// Vouchers: those still to collect, and those handed to partners (7E).
function Vouchers() {
  const counts = useAdminCounts();
  return (
    <TabHub label="Vouchers" tabs={[
      { key: 'outstanding', label: 'Outstanding', count: counts?.vouchers_outstanding, render: () => <OutstandingScreen /> },
      {
        key: 'partners', label: 'Handed to partners', count: counts?.vouchers_owed_to_partners,
        render: () => (
          <div className="space-y-6 max-w-5xl mx-auto">
            <header>
              <h1 className="text-3xl font-bold tracking-tight">Vouchers Handed to Partners</h1>
              <p className="text-zinc-500 dark:text-zinc-400">
                Part of a partner&apos;s share paid in vouchers. When someone else collects one, the office owes the partner their part.
              </p>
            </header>
            <PartnerVoucherList mode="office" />
          </div>
        ),
      },
    ]} />
  );
}

export default function VouchersPage() {
  return <Suspense fallback={null}><Vouchers /></Suspense>;
}
