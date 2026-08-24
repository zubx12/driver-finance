'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Search, Filter, ShieldCheck, History, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminAuditLogPage() {
  const MOCK_AUDITS = [
    { id: '1', table: 'expenses', record: 'EXP-9012', by: 'Driver (Ahmed)', field: 'amount', old: '250', new: '280', time: '10 mins ago', date: '2026-08-23' },
    { id: '2', table: 'rides', record: 'RDE-4412', by: 'Driver (Omar)', field: 'payment_method', old: 'Cash', new: 'Voucher', time: '1 hour ago', date: '2026-08-23' },
    { id: '3', table: 'salary_calculations', record: 'CALC-101', by: 'Admin (You)', field: 'status', old: 'draft', new: 'finalized', time: '2 hours ago', date: '2026-08-23' },
    { id: '4', table: 'vehicle_partners', record: 'VP-88', by: 'Admin (You)', field: 'percentage', old: '30.00', new: '32.50', time: '1 day ago', date: '2026-08-22' },
    { id: '5', table: 'rides', record: 'RDE-4309', by: 'Driver (Ahmed)', field: 'amount', old: '100', new: '150', time: '2 days ago', date: '2026-08-21' },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Immutable record of all financial changes across the system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search record ID or driver..." 
              className="h-10 pl-9 pr-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64"
            />
          </div>
          <Button variant="outline" className="h-10 rounded-xl border-zinc-200 dark:border-zinc-800 shadow-sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>
      </header>

      <Card className="border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 p-5 flex flex-row items-center gap-3">
          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-lg">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-base">System Traceability Active</CardTitle>
            <CardDescription>Every edit is securely logged.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 dark:bg-zinc-900/20 border-b border-zinc-100 dark:border-zinc-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Time</th>
                  <th className="px-6 py-4 font-semibold">Changed By</th>
                  <th className="px-6 py-4 font-semibold">Table / Record</th>
                  <th className="px-6 py-4 font-semibold">Field</th>
                  <th className="px-6 py-4 font-semibold">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {MOCK_AUDITS.map((audit) => (
                  <tr key={audit.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-zinc-900 dark:text-white">{audit.time}</div>
                      <div className="text-xs text-zinc-500">{audit.date}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {audit.by}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-mono text-xs text-zinc-500">{audit.table}</div>
                      <div className="font-medium">{audit.record}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                        {audit.field}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded line-through decoration-rose-300">{audit.old}</span>
                        <ArrowRight className="h-3 w-3 text-zinc-400" />
                        <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded font-bold">{audit.new}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
