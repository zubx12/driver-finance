'use client';

import { Suspense } from 'react';
import { TabHub } from '@/components/admin/TabHub';
import MonthlyReportsScreen from '@/components/admin/screens/MonthlyReportsScreen';
import DailyEntriesScreen from '@/components/admin/screens/DailyEntriesScreen';

// Reports: the monthly vehicle report / driver statement (print, PDF, CSV)
// and the day-by-day entries.
function Reports() {
  return (
    <TabHub label="Reports" tabs={[
      { key: 'monthly', label: 'Monthly reports', render: () => <MonthlyReportsScreen /> },
      { key: 'daily', label: 'Daily entries', render: () => <DailyEntriesScreen /> },
    ]} />
  );
}

export default function ReportsPage() {
  return <Suspense fallback={null}><Reports /></Suspense>;
}
