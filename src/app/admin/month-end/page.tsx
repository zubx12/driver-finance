'use client';

import { Suspense } from 'react';
import { TabHub } from '@/components/admin/TabHub';
import MonthCloseScreen from '@/components/admin/screens/MonthCloseScreen';
import SalaryRunsScreen from '@/components/admin/screens/SalaryRunsScreen';
import DriverSettlementsScreen from '@/components/admin/screens/DriverSettlementsScreen';
import PartnerSettlementsScreen from '@/components/admin/screens/PartnerSettlementsScreen';

// Month End: the month's work in the order the money moves.
function MonthEnd() {
  return (
    <TabHub label="Month end" tabs={[
      { key: 'checklist', label: 'Checklist', render: () => <MonthCloseScreen /> },
      { key: 'payouts', label: 'Payouts', render: () => <SalaryRunsScreen /> },
      { key: 'drivers', label: 'Driver settlements', render: () => <DriverSettlementsScreen /> },
      { key: 'partners', label: 'Partner settlements', render: () => <PartnerSettlementsScreen /> },
    ]} />
  );
}

export default function MonthEndPage() {
  return <Suspense fallback={null}><MonthEnd /></Suspense>;
}
