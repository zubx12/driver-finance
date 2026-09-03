'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Play, FileText, CheckCircle2, Eye, AlertCircle, PencilLine, Save, X, Download } from 'lucide-react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

interface Share { partnerName: string; pct: number; amount: number; }
interface Calc {
  id: string; vehicleId: string; vehicleLabel: string; period: string;
  totalRevenue: number; totalExpenses: number; companyExpenses: number;
  netRevenue: number; status: 'draft' | 'finalized';
  adminNotes: string; shares: Share[];
}

function recalcShares(calc: Calc): Share[] {
  // Note: This is a client-side preview only. It does not include driver pay deductions.
  // The actual share amounts are computed by the backend run-salary API.
  const net = calc.totalRevenue - calc.totalExpenses - calc.companyExpenses;
  return calc.shares.map(s => ({ ...s, amount: parseFloat(((net * s.pct) / 100).toFixed(2)) }));
}

export default function AdminSalaryPage() {
  const now = new Date();
  const periodLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const periodStart = now.toISOString().slice(0, 7) + '-01';
  const periodEnd   = now.toISOString().slice(0, 10);

  const [isGenerating, setIsGenerating] = useState(false);
  const [calcs, setCalcs] = useState<Calc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-card edit state: calcId -> { companyExpenses, adminNotes }
  const [editing, setEditing] = useState<Record<string, { companyExpenses: string; adminNotes: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const loadCalcs = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from('salary_calculations')
        .select(`id, vehicle_id, total_revenue, total_expenses, company_expenses, net_revenue, status, period_start, admin_notes,
                 vehicles(make, model, plate_number),
                 salary_calculation_shares(ownership_percentage, share_amount, vehicle_partners(partners(name)))`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (err) { setError(err.message); setLoading(false); return; }

      const mapped: Calc[] = (data ?? []).map((c: any) => ({
        id: c.id,
        vehicleId: c.vehicle_id,
        vehicleLabel: c.vehicles ? `${c.vehicles.make} ${c.vehicles.model} (${c.vehicles.plate_number})` : 'Unknown',
        period: new Date(c.period_start).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        totalRevenue: c.total_revenue,
        totalExpenses: c.total_expenses,
        companyExpenses: c.company_expenses ?? 0,
        netRevenue: c.net_revenue,
        status: c.status,
        adminNotes: c.admin_notes ?? '',
        shares: (c.salary_calculation_shares ?? []).map((s: any) => ({
          partnerName: s.vehicle_partners?.partners?.name ?? 'Unknown',
          pct: s.ownership_percentage,
          amount: s.share_amount,
        })),
      }));
      setCalcs(mapped);
    } catch (e: any) {
      setError(e.message || 'Failed to load calculations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCalcs(); }, [loadCalcs]);

  const handleGenerate = async () => {
    setIsGenerating(true); setError(null);
    try {
      const res = await fetch('/api/admin/run-salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodStart, periodEnd }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to generate');
      await loadCalcs();
    } catch (e: any) { setError(e.message); }
    finally { setIsGenerating(false); }
  };

  const startEdit = (calc: Calc) => {
    setEditing(prev => ({ ...prev, [calc.id]: { companyExpenses: String(calc.companyExpenses), adminNotes: calc.adminNotes } }));
  };

  const cancelEdit = (calcId: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[calcId]; return n; });
  };

  const saveEdit = async (calc: Calc) => {
    const e = editing[calc.id];
    if (!e) return;
    setSaving(calc.id);
    const companyExp = parseFloat(e.companyExpenses) || 0;
    const newNet = calc.totalRevenue - calc.totalExpenses - companyExp;

    const supabase = createClient();
    const { error: err } = await supabase
      .from('salary_calculations')
      .update({ company_expenses: companyExp, net_revenue: newNet, admin_notes: e.adminNotes })
      .eq('id', calc.id);

    if (err) { alert(err.message); setSaving(null); return; }

    // Recalc shares in DB
    const updatedCalc = { ...calc, companyExpenses: companyExp, netRevenue: newNet };
    const newShares = recalcShares(updatedCalc);
    // Delete and re-insert shares with updated amounts
    await supabase.from('salary_calculation_shares').delete().eq('calculation_id', calc.id);
    // Re-fetch partner splits to get partner_id
    const { data: splits } = await supabase.from('vehicle_partners').select('id, partner_id, percentage, partners(name)').eq('vehicle_id', calc.vehicleId).is('effective_to', null);
    if (splits && splits.length > 0) {
      await supabase.from('salary_calculation_shares').insert(
        splits.map((s: any) => ({
          calculation_id: calc.id,
          partner_id: s.partner_id,
          ownership_percentage: s.percentage,
          share_amount: parseFloat(((newNet * s.percentage) / 100).toFixed(2)),
        }))
      );
    }

    cancelEdit(calc.id);
    setSaving(null);
    await loadCalcs();
  };

  const handleFinalize = async (calcId: string) => {
    if (!confirm('Finalize this payout? Once finalized it cannot be edited, and official partner settlements will be generated.')) return;
    
    try {
      const res = await fetch('/api/admin/finalize-salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calcId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to finalize');
      
      setCalcs(prev => prev.map(c => c.id === calcId ? { ...c, status: 'finalized' } : c));
      alert('Success! Settlements have been generated for the partners.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Salary & Payout Runs</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Generate drafts, add adjustments, then finalize partner payouts.</p>
        </div>
        <Button variant="outline" onClick={() => window.open('/api/admin/export-salary', '_blank')} className="gap-2 self-start sm:self-auto">
          <Download className="h-4 w-4" />Export CSV
        </Button>
      </header>

      {/* Generate trigger */}
      <Card className="border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-950/10 rounded-2xl">
        <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 space-y-1">
            <h2 className="text-xl font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-500" />{periodLabel} Payout Run
            </h2>
            <p className="text-sm text-indigo-700/80 dark:text-indigo-300/80">
              Pulls all rides and driver expenses, computes net revenue per vehicle, and generates draft partner splits.
              You can add company expenses and edit any draft before finalizing.
            </p>
          </div>
          <Button size="lg" onClick={handleGenerate} disabled={isGenerating}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold">
            {isGenerating ? 'Running engine...' : <><Play className="h-4 w-4 mr-2 fill-current" />Generate Draft</>}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-400 py-12 text-sm">Loading calculations...</div>
      ) : calcs.length === 0 ? (
        <div className="text-center text-zinc-400 py-12 text-sm">No salary calculations yet. Click Generate above to run the engine.</div>
      ) : (
        <div className="space-y-6">
          <h3 className="text-lg font-bold">{calcs.length} Calculation(s)</h3>
          <div className="grid gap-6 md:grid-cols-2">
            {calcs.map((calc) => {
              const isEditing = !!editing[calc.id];
              const editState = editing[calc.id];
              const previewNet = isEditing
                ? calc.totalRevenue - calc.totalExpenses - (parseFloat(editState.companyExpenses) || 0)
                : calc.netRevenue;

              return (
                <Card key={calc.id} className="border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                  <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 p-5 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-zinc-500" />{calc.vehicleLabel}</CardTitle>
                      <CardDescription className="mt-1">{calc.period}</CardDescription>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${calc.status === 'finalized' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400'}`}>
                      {calc.status}
                    </span>
                  </CardHeader>

                  <CardContent className="p-0">
                    {/* Financials summary */}
                    <div className="grid grid-cols-3 divide-x divide-zinc-100 dark:divide-zinc-800 border-b border-zinc-100 dark:border-zinc-800">
                      <div className="p-4 text-center"><div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Revenue</div><div className="font-medium text-sm">SAR {fmt(calc.totalRevenue)}</div></div>
                      <div className="p-4 text-center"><div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Driver Exp</div><div className="font-medium text-sm text-rose-600 dark:text-rose-400">-SAR {fmt(calc.totalExpenses)}</div></div>
                      <div className="p-4 text-center bg-indigo-50/50 dark:bg-indigo-900/10"><div className="text-[10px] uppercase font-bold text-indigo-500 mb-1">Net</div><div className="font-bold text-sm text-indigo-700 dark:text-indigo-400">SAR {fmt(previewNet)}</div></div>
                    </div>

                    {/* Company expenses + admin notes edit section */}
                    {calc.status === 'draft' && (
                      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                        {!isEditing ? (
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-zinc-600 dark:text-zinc-400">
                              Company expenses: <span className="font-semibold text-zinc-900 dark:text-white">SAR {fmt(calc.companyExpenses)}</span>
                              {calc.adminNotes && <span className="ml-2 text-xs text-zinc-400 italic">{calc.adminNotes}</span>}
                            </div>
                            <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg gap-1" onClick={() => startEdit(calc)}>
                              <PencilLine className="h-3 w-3" />Edit
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-semibold text-zinc-500 block mb-1">Company Expenses (SAR) — deducted before partner split</label>
                              <Input
                                type="number" min="0" step="0.01"
                                value={editState.companyExpenses}
                                onChange={e => setEditing(prev => ({ ...prev, [calc.id]: { ...prev[calc.id], companyExpenses: e.target.value } }))}
                                placeholder="0.00"
                                className="h-9 text-sm font-mono"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-zinc-500 block mb-1">Admin Notes (optional)</label>
                              <Input
                                type="text"
                                value={editState.adminNotes}
                                onChange={e => setEditing(prev => ({ ...prev, [calc.id]: { ...prev[calc.id], adminNotes: e.target.value } }))}
                                placeholder="e.g. Insurance SAR 800, parking fine SAR 200"
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="text-xs text-zinc-500">
                              Adjusted net: <strong className="text-indigo-600">SAR {fmt(previewNet)}</strong>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg" onClick={() => cancelEdit(calc.id)}>
                                <X className="h-3 w-3 mr-1" />Cancel
                              </Button>
                              <Button size="sm" className="h-8 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => saveEdit(calc)} disabled={saving === calc.id}>
                                <Save className="h-3 w-3 mr-1" />{saving === calc.id ? 'Saving...' : 'Save & Recalculate'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Partner splits */}
                    {calc.shares.length > 0 && (
                      <div className="p-5 space-y-3">
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Partner Split</h4>
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

                    {/* Actions */}
                    {calc.status === 'draft' && (
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
                        <Drawer>
                          <DrawerTrigger className="inline-flex items-center justify-center text-sm h-10 px-4 py-2 border rounded-xl font-semibold text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                            <Eye className="h-4 w-4 mr-2" />Full Breakdown
                          </DrawerTrigger>
                          <DrawerContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 h-[60vh]">
                            <DrawerHeader>
                              <DrawerTitle>Breakdown — {calc.vehicleLabel}</DrawerTitle>
                              <DrawerDescription>
                                Revenue SAR {fmt(calc.totalRevenue)} &minus; Driver Expenses SAR {fmt(calc.totalExpenses)} &minus; Company Expenses SAR {fmt(calc.companyExpenses)} = Net SAR {fmt(calc.netRevenue)}
                              </DrawerDescription>
                            </DrawerHeader>
                            <div className="p-4 overflow-y-auto space-y-3">
                              {calc.adminNotes && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
                                  <strong>Admin Note:</strong> {calc.adminNotes}
                                </div>
                              )}
                              {calc.shares.map((s, i) => (
                                <div key={i} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                                  <div><div className="font-bold">{s.partnerName}</div><div className="text-sm text-zinc-500">{s.pct}% of SAR {fmt(calc.netRevenue)} net</div></div>
                                  <div className="font-bold text-emerald-600 dark:text-emerald-400">SAR {fmt(s.amount)}</div>
                                </div>
                              ))}
                            </div>
                            <DrawerFooter>
                              <DrawerClose className="inline-flex items-center justify-center text-sm h-10 px-4 py-2 border rounded-xl border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Close</DrawerClose>
                            </DrawerFooter>
                          </DrawerContent>
                        </Drawer>
                        <Button onClick={() => handleFinalize(calc.id)} disabled={isEditing}
                          className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl font-semibold shadow-sm">
                          <CheckCircle2 className="h-4 w-4 mr-2" />Finalize Payout
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}