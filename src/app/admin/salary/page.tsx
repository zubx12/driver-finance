'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Play, FileText, CheckCircle2, Eye, AlertCircle } from 'lucide-react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { createClient } from '@/lib/supabase/client';

interface Share { partner_id: string; partnerName: string; pct: number; amount: number; }
interface Calc { id: string; vehicleId: string; vehicleLabel: string; period: string; totalRevenue: number; totalExpenses: number; netRevenue: number; status: 'draft' | 'finalized'; shares: Share[]; }

export default function AdminSalaryPage() {
  const now = new Date();
  const periodLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const periodStart = now.toISOString().slice(0, 7) + '-01';
  const periodEnd = now.toISOString().slice(0, 10);

  const [isGenerating, setIsGenerating] = useState(false);
  const [calcs, setCalcs] = useState<Calc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCalcs = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('salary_calculations')
      .select(`id, vehicle_id, total_revenue, total_expenses, net_revenue, status, period_start, period_end,
               vehicles(make, model, plate_number),
               salary_calculation_shares(id, ownership_percentage, share_amount, vehicle_partners(partners(name)))`)
      .gte('period_start', periodStart.slice(0, 7) + '-01')
      .order('created_at', { ascending: false });

    if (err) { setError(err.message); setLoading(false); return; }

    const mapped: Calc[] = (data ?? []).map((c: any) => ({
      id: c.id,
      vehicleId: c.vehicle_id,
      vehicleLabel: c.vehicles ? `${c.vehicles.make} ${c.vehicles.model}` : 'Unknown',
      period: `${new Date(c.period_start).toLocaleString('en-US', { month: 'long', year: 'numeric' })}`,
      totalRevenue: c.total_revenue,
      totalExpenses: c.total_expenses,
      netRevenue: c.net_revenue,
      status: c.status,
      shares: (c.salary_calculation_shares ?? []).map((s: any) => ({
        partner_id: s.vehicle_partners?.partners?.name ?? 'Unknown',
        partnerName: s.vehicle_partners?.partners?.name ?? 'Unknown',
        pct: s.ownership_percentage,
        amount: s.share_amount,
      })),
    }));
    setCalcs(mapped);
    setLoading(false);
  }, [periodStart]);

  useEffect(() => { loadCalcs(); }, [loadCalcs]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/run-salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodStart, periodEnd }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to generate');
      await loadCalcs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFinalize = async (calcId: string) => {
    if (!confirm('Finalize this payout? This is immutable and cannot be undone.')) return;
    const supabase = createClient();
    const { error: err } = await supabase
      .from('salary_calculations')
      .update({ status: 'finalized', finalized_at: new Date().toISOString() })
      .eq('id', calcId);
    if (err) { alert(err.message); return; }
    setCalcs(prev => prev.map(c => c.id === calcId ? { ...c, status: 'finalized' } : c));
  };

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Salary & Payout Runs</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Generate and finalize partner payouts based on vehicle splits.</p>
        </div>
      </header>

      {/* Generate Card */}
      <Card className="border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-950/10 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 space-y-2">
            <h2 className="text-xl font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-500" />
              {periodLabel} Payout Run
            </h2>
            <p className="text-sm text-indigo-700/80 dark:text-indigo-300/80">
              Calculates net revenue for all active vehicles and generates draft splits per active partner percentages.
              The monthly cron also runs this automatically on the 1st of each month.
            </p>
          </div>
          <Button size="lg" onClick={handleGenerate} disabled={isGenerating}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow rounded-xl font-semibold">
            {isGenerating ? 'Running...' : <><Play className="h-4 w-4 mr-2 fill-current" />Generate Draft Payouts</>}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="text-center text-zinc-400 py-12 text-sm">Loading calculations...</div>
      ) : calcs.length === 0 ? (
        <div className="text-center text-zinc-400 py-12 text-sm">No salary calculations yet. Click Generate above to run the engine.</div>
      ) : (
        <div className="space-y-6">
          <h3 className="text-lg font-bold">Draft Calculations — {calcs.length} vehicle(s)</h3>
          <div className="grid gap-6 md:grid-cols-2">
            {calcs.map((calc) => (
              <Card key={calc.id} className="border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 p-5 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-zinc-500" />{calc.vehicleLabel}</CardTitle>
                    <CardDescription className="font-mono mt-1">{calc.period}</CardDescription>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${calc.status === 'finalized' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400'}`}>
                    {calc.status}
                  </span>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-3 divide-x divide-zinc-100 dark:divide-zinc-800 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="p-4 text-center"><div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Revenue</div><div className="font-medium text-sm">SAR {fmt(calc.totalRevenue)}</div></div>
                    <div className="p-4 text-center"><div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Expenses</div><div className="font-medium text-sm text-rose-600 dark:text-rose-400">SAR {fmt(calc.totalExpenses)}</div></div>
                    <div className="p-4 text-center bg-indigo-50/50 dark:bg-indigo-900/10"><div className="text-[10px] uppercase font-bold text-indigo-500 mb-1">Net</div><div className="font-bold text-sm text-indigo-700 dark:text-indigo-400">SAR {fmt(calc.netRevenue)}</div></div>
                  </div>
                  {calc.shares.length > 0 && (
                    <div className="p-5 space-y-3">
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Calculated Split</h4>
                      {calc.shares.map((s, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{s.partnerName}</div>
                            <div className="text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{s.pct}%</div>
                          </div>
                          <div className="font-bold text-sm">SAR {fmt(s.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {calc.status === 'draft' && (
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
                      <Drawer>
                        <DrawerTrigger className="inline-flex items-center justify-center text-sm h-10 px-4 py-2 border rounded-xl font-semibold text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                          <Eye className="h-4 w-4 mr-2" />View Breakdown
                        </DrawerTrigger>
                        <DrawerContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 h-[60vh]">
                          <DrawerHeader>
                            <DrawerTitle>Breakdown — {calc.vehicleLabel}</DrawerTitle>
                            <DrawerDescription>Revenue SAR {fmt(calc.totalRevenue)} · Expenses SAR {fmt(calc.totalExpenses)} · Net SAR {fmt(calc.netRevenue)}</DrawerDescription>
                          </DrawerHeader>
                          <div className="p-4 overflow-y-auto">
                            {calc.shares.map((s, i) => (
                              <div key={i} className="p-4 mb-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                                <div><div className="font-bold">{s.partnerName}</div><div className="text-sm text-zinc-500">{s.pct}% ownership</div></div>
                                <div className="font-bold text-emerald-600 dark:text-emerald-400">SAR {fmt(s.amount)}</div>
                              </div>
                            ))}
                          </div>
                          <DrawerFooter>
                            <DrawerClose className="inline-flex items-center justify-center text-sm h-10 px-4 py-2 border rounded-xl border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Close</DrawerClose>
                          </DrawerFooter>
                        </DrawerContent>
                      </Drawer>
                      <Button onClick={() => handleFinalize(calc.id)} className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl font-semibold shadow-sm">
                        <CheckCircle2 className="h-4 w-4 mr-2" />Finalize Payout
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}