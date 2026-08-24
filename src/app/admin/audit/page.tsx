import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheck, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminAuditLogPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('audit_log')
    .select('id, table_name, record_id, changed_by, field_name, old_value, new_value, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const audits = data ?? [];

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return { date: d.toLocaleDateString('en-SA'), time: d.toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' }) };
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Immutable record of all financial changes across the system.</p>
      </header>
      <Card className="border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 p-5 flex flex-row items-center gap-3">
          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-lg">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-base">System Traceability Active</CardTitle>
            <CardDescription>{audits.length} events recorded &mdash; last 100 shown.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {audits.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 text-sm">No audit events yet. They appear here when data is edited.</div>
          ) : (
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
                  {audits.map((a) => {
                    const { date, time } = fmt(a.created_at);
                    return (
                      <tr key={a.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap"><div className="font-medium">{time}</div><div className="text-xs text-zinc-500">{date}</div></td>
                        <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300">{a.changed_by}</span></td>
                        <td className="px-6 py-4 whitespace-nowrap"><div className="font-mono text-xs text-zinc-500">{a.table_name}</div><div className="font-medium">{a.record_id}</div></td>
                        <td className="px-6 py-4 whitespace-nowrap"><code className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{a.field_name}</code></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded line-through">{a.old_value ?? 'null'}</span>
                            <ArrowRight className="h-3 w-3 text-zinc-400" />
                            <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded font-bold">{a.new_value ?? 'null'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}