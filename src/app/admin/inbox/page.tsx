'use client';

import { Suspense } from 'react';
import { TabHub } from '@/components/admin/TabHub';
import { useAdminCounts } from '@/lib/data/adminCounts';
import HandoversScreen from '@/components/admin/screens/HandoversScreen';
import ExpenseReviewScreen from '@/components/admin/screens/ExpenseReviewScreen';
import CorrectionsScreen from '@/components/admin/screens/CorrectionsScreen';

// Inbox: everything waiting for an office decision, one tab per kind.
function Inbox() {
  const counts = useAdminCounts();
  return (
    <TabHub label="Inbox" tabs={[
      { key: 'handovers', label: 'Cash handovers', count: counts?.handovers, render: () => <HandoversScreen /> },
      { key: 'expenses', label: 'Expense review', count: counts?.expenses, render: () => <ExpenseReviewScreen /> },
      { key: 'corrections', label: 'Corrections', count: counts?.corrections, render: () => <CorrectionsScreen /> },
    ]} />
  );
}

export default function InboxPage() {
  return <Suspense fallback={null}><Inbox /></Suspense>;
}
