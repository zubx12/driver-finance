'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Play, FileText, CheckCircle2, Eye, AlertCircle, PencilLine, Save, X, Download, Trash2 } from 'lucide-react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

// All payout maths happens in the database (docs/payout-rules.md). This page
// only displays results and calls the admin functions.

interface Share { partnerName: string; pct: number; amount: number; }
interface DriverPay {
  driverName: string; type: string; days: number; baseNet: number;
  commission: number; salary: number; bonus: number; total: number;
}
interface Calc {
  id: string; vehicleLabel: string; period: string;
  totalRevenue: number; totalExpenses: number; companyExpenses: number; chargedExpenses: number;
  netRevenue: number; driverPayTotal: number; companyRetained: number;
  lossIn: number; lossOut: number;
  status: 'draft' | 'finalized'; adminNotes: string; warnings: string[];
  shares: Share[]; driverPay: DriverPay[];
}
interface RunResult { vehicle: string; status: 'calculated' | 'skipped_finalized' | 'error'; error?: string; }

interface CalcRow {
  id: string; period_start: string; status: 'draft' | 'finalized'; admin_notes: string | null;
  total_revenue: number; total_expenses: number; company_expenses: number | null; charged_expenses: number | null; net_revenue: number;
  driver_pay_total: number; company_retained: number; loss_brought_forward: number; loss_carried_forward: number;
  warnings: { message?: string }[] | null;
  vehicles: { make: string; model: string; plate_number: string } | null;
  salary_calculation_shares: { ownership_percentage: number; share_amount: number; partners: { name: string } | null }[];
  driver_pay_calculations: {
    compensation_type: string; days_applied: number | null; base_net: number | null;
    commission_amount: number; salary_amount: number; bonus_amount: number; driver_pay_amount: number;
    drivers: { name: string } | null;
  }[];
}

const riyadhMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }).slice(0, 7);
const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toCalc(c: CalcRow): Calc {
  return {
    id: c.id,
    vehicleLabel: c.vehicles ? `${c.vehicles.make} ${c.vehicles.model} (${c.vehicles.plate_number})` : 'Unknown vehicle',
    period: new Date(`${c.period_start}T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    totalRevenue: Number(c.total_revenue),
    totalExpenses: Number(c.total_expenses),
    companyExpenses: Number(c.company_expenses ?? 0),
    chargedExpenses: Number(c.charged_expenses ?? 0),
    netRevenue: Number(c.net_revenue),
    driverPayTotal: Number(c.driver_pay_total),
    companyRetained: Number(c.company_retained),
    lossIn: Number(c.loss_brought_forward),
    lossOut: Number(c.loss_carried_forward),
    status: c.status,
    adminNotes: c.admin_notes ?? '',
    warnings: (c.warnings ?? []).map((w) => w.message ?? 'Check this calculation'),
    shares: (c.salary_calculation_shares ?? []).map((s) => ({
      partnerName: s.partners?.name ?? 'Unknown partner',
      pct: Number(s.ownership_percentage),
      amount: Number(s.share_amount),
    })),
    driverPay: (c.driver_pay_calculations ?? []).map((d) => ({
      driverName: d.drivers?.name ?? 'Unknown driver',
      type: d.compensation_type,
      days: d.days_applied ?? 0,
      baseNet: Number(d.base_net ?? 0),
      commission: Number(d.commission_amount),
      salary: Number(d.salary_amount),
      bonus: Number(d.bonus_amount),
      total: Number(d.driver_pay_amount),
    })),
  };
}

async function fetchCalcs(month: string): Promise<{ calcs?: Calc[]; error?: string }> {
  const { data, error } = await createClient()
    .from('salary_calculations')
    .select(`id, period_start, status, admin_notes, total_revenue, total_expenses, company_expenses, charged_expenses, net_revenue,
             driver_pay_total, company_retained, loss_brought_forward, loss_carried_forward, warnings,
             vehicles(make, model, plate_number),
             salary_calculation_shares(ownership_percentage, share_amount, partners(name)),
             driver_pay_calculations(compensation_type, days_applied, base_net, commission_amount, salary_amount,
                                     bonus_amount, driver_pay_amount, drivers(name))`)
    .eq('period_start', `${month}-01`)
    .order('created_at', { ascending: true });
  if (error) return { error: error.message };
  return { calcs: ((data ?? []) as unknown as CalcRow[]).map(toCalc) };
}

export default function AdminSalaryPage() {
  const [month, setMonth] = useState(riyadhMonth);
  const [isGenerating, setIsGenerating] = useState(false);
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const [calcs, setCalcs] = useState<Calc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Per-card edit state: calcId -> { companyExpenses, adminNotes }
  const [editing, setEditing] = useState<Record<string, { companyExpenses: string; adminNotes: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const periodLabel = new Date(`${month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const applyResult = useCallback((result: { calcs?: Calc[]; error?: string }) => {
    if (result.error) setError(result.error);
    else setCalcs(result.calcs ?? []);
    setLoading(false);
  }, []);

  const loadCalcs = useCallback(async () => {
    applyResult(await fetchCalcs(month));
  }, [month, applyResult]);

  // `loading` is switched on by changeMonth; the guard drops a slow response
  // for a month the admin has already moved away from.
  useEffect(() => {
    let current = true;
    fetchCalcs(month).then((result) => { if (current) applyResult(result); });
    return () => { current = false; };
  }, [month, applyResult]);

  const changeMonth = (value: string) => {
    if (!value || value === month) return;
    setLoading(true);
    setRunResults(null);
    setMonth(value);
  };

  const handleGenerate = async () => {
    setIsGenerating(true); setError(null); setNotice(null); setRunResults(null);
    try {
      const res = await fetch('/api/admin/run-salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to generate');
      setRunResults(json.results ?? []);
      await loadCalcs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setIsGenerating(false);
    }
  };

  const startEdit = (calc: Calc) => {
    setEditing(prev => ({ ...prev, [calc.id]: { companyExpenses: String(calc.companyExpenses), adminNotes: calc.adminNotes } }));
  };

  const cancelEdit = (calcId: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[calcId]; return n; });
  };

  // The database saves the amount and recalculates driver pay and every share.
  const saveEdit = async (calc: Calc) => {
    const e = editing[calc.id];
    if (!e) return;
    const amount = Number(e.companyExpenses);
    if (!Number.isFinite(amount) || amount < 0) { setError('Company expenses must be zero or more.'); return; }
    setBusy(calc.id); setError(null); setNotice(null);
    const { error: err } = await createClient().rpc('set_company_expenses', {
      p_calc_id: calc.id, p_amount: amount, p_notes: e.adminNotes || null,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    cancelEdit(calc.id);
    await loadCalcs();
  };

  const handleFinalize = async (calc: Calc) => {
    if (!confirm(`Finalize the ${calc.period} payout for ${calc.vehicleLabel}? It cannot be edited afterwards, and partner settlements will be created.`)) return;
    setBusy(calc.id); setError(null); setNotice(null);
    try {
      const res = await fetch('/api/admin/finalize-salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calcId: calc.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Failed to finalize');
      setNotice(`${calc.vehicleLabel}: payout finalized and partner settlements created.`);
      await loadCalcs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finalize');
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteDraft = async (calc: Calc) => {
    if (!confirm(`Delete the ${calc.period} draft for ${calc.vehicleLabel}? You can generate it again later.`)) return;
    setBusy(calc.id); setError(null); setNotice(null);
    const { error: err } = await createClient().rpc('delete_salary_draft', { p_calc_id: calc.id });
    setBusy(null);
    if (err) { setError(err.message); return; }
    await loadCalcs();
  };

  const failedRuns = runResults?.filter(r => r.status === 'error') ?? [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Salary & Payout Runs</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Generate monthly drafts, add company expenses, then finalize partner payouts.</p>
        </div>
        <Button variant="outline" onClick={() => window.open('/api/admin/export-salary', '_blank')} className="gap-2 self-start sm:self-auto">
          <Download className="h-4 w-4" />Export CSV
        </Button>
      </header>

      {/* Generate trigger */}
      <Card className="border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-950/10 rounded-2xl">
        <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 space-y-2">
            <h2 className="text-xl font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-500" />{periodLabel} Payout Run
            </h2>
            <p className="text-sm text-indigo-700/80 dark:text-indigo-300/80">
              Calculates every vehicle for the whole month: driver pay first, then partner shares by ownership.
              Finalized months are never changed. Drafts are also created automatically on the 1st for the previous month.
            </p>
            <Input type="month" value={month} max={riyadhMonth()} onChange={e => changeMonth(e.target.value)}
              className="h-9 w-48 bg-white dark:bg-zinc-950" aria-label="Payout month" />
          </div>
          <Button size="lg" onClick={handleGenerate} disabled={isGenerating}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold">
            {isGenerating ? 'Running engine...' : <><Play className="h-4 w-4 mr-2 fill-current" />Generate Drafts</>}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-xl flex items-center gap-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{notice}
        </div>
      )}

      {runResults && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-sm space-y-1">
          <div className="font-semibold">
            Run finished: {runResults.filter(r => r.status === 'calculated').length} calculated,{' '}
            {runResults.filter(r => r.status === 'skipped_finalized').length} already finalized, {failedRuns.length} failed.
          </div>
          {failedRuns.map((r, i) => (
            <div key={i} className="text-red-600 dark:text-red-400">{r.vehicle}: {r.error}</div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-400 py-12 text-sm">Loading calculations...</div>
      ) : calcs.length === 0 ? (
        <div className="text-center text-zinc-400 py-12 text-sm">No payouts for {periodLabel} yet. Click Generate Drafts to run the engine.</div>
      ) : (
        <div className="space-y-6">
          <h3 className="text-lg font-bold">{calcs.length} vehicle payout(s) for {periodLabel}</h3>
          <div className="grid gap-6 md:grid-cols-2">
            {calcs.map((calc) => {
              const isEditing = !!editing[calc.id];
              const editState = editing[calc.id];
              const partnerPool = calc.netRevenue - calc.driverPayTotal - calc.lossIn + calc.lossOut;

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
                    <div className="grid grid-cols-3 divide-x divide-zinc-100 dark:divide-zinc-800 border-b border-zinc-100 dark:border-zinc-800">
                      <div className="p-4 text-center"><div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Revenue</div><div className="font-medium text-sm">SAR {fmt(calc.totalRevenue)}</div></div>
                      <div className="p-4 text-center"><div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Expenses</div><div className="font-medium text-sm text-rose-600 dark:text-rose-400">-SAR {fmt(calc.totalExpenses + calc.companyExpenses + calc.chargedExpenses)}</div></div>
                      <div className="p-4 text-center bg-indigo-50/50 dark:bg-indigo-900/10"><div className="text-[10px] uppercase font-bold text-indigo-500 mb-1">Net</div><div className="font-bold text-sm text-indigo-700 dark:text-indigo-400">SAR {fmt(calc.netRevenue)}</div></div>
                    </div>

                    {calc.warnings.length > 0 && (
                      <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                        {calc.warnings.map((w, i) => <div key={i} className="flex gap-2"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{w}</div>)}
                      </div>
                    )}

                    {calc.status === 'draft' && (
                      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                        {!isEditing ? (
                          <div className="flex items-center justify-between gap-3">
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
                              <label className="text-xs font-semibold text-zinc-500 block mb-1">Company Expenses (SAR) — deducted before driver pay and partner shares</label>
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
                            <div className="flex gap-2 justify-end">
                              <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg" onClick={() => cancelEdit(calc.id)}>
                                <X className="h-3 w-3 mr-1" />Cancel
                              </Button>
                              <Button size="sm" className="h-8 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => saveEdit(calc)} disabled={busy === calc.id}>
                                <Save className="h-3 w-3 mr-1" />{busy === calc.id ? 'Saving...' : 'Save & Recalculate'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-5 space-y-3">
                      {calc.driverPay.length > 0 && (
                        <>
                          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Driver Pay</h4>
                          {calc.driverPay.map((d, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                {d.driverName}
                                <span className="ml-2 text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
                                  {d.type === 'commission' ? 'commission' : 'salary'} · {d.days} days
                                </span>
                              </div>
                              <div className="font-bold text-sm">SAR {fmt(d.total)}</div>
                            </div>
                          ))}
                        </>
                      )}

                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider pt-1">Partner Split</h4>
                      {calc.shares.length === 0 && <div className="text-sm text-zinc-400">No partners for this month.</div>}
                      {calc.shares.map((s, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{s.partnerName}</div>
                            <div className="text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{s.pct}%</div>
                          </div>
                          <div className="font-bold text-sm">SAR {fmt(s.amount)}</div>
                        </div>
                      ))}
                      {calc.lossOut > 0 && (
                        <div className="text-xs text-rose-600 dark:text-rose-400">
                          Loss of SAR {fmt(calc.lossOut)} carried forward to next month (partners receive nothing this month).
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap justify-end gap-2">
                      <Drawer>
                        <DrawerTrigger className="inline-flex items-center justify-center text-sm h-10 px-4 py-2 border rounded-xl font-semibold text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                          <Eye className="h-4 w-4 mr-2" />Full Breakdown
                        </DrawerTrigger>
                        <DrawerContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 h-[70vh]">
                          <DrawerHeader>
                            <DrawerTitle>Breakdown — {calc.vehicleLabel}, {calc.period}</DrawerTitle>
                            <DrawerDescription>Every line below adds up exactly; the database checks this on every run.</DrawerDescription>
                          </DrawerHeader>
                          <div className="px-4 pb-4 overflow-y-auto space-y-4 text-sm">
                            {calc.adminNotes && (
                              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                                <strong>Admin note:</strong> {calc.adminNotes}
                              </div>
                            )}
                            <dl className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800">
                              {[
                                ['Revenue', calc.totalRevenue],
                                ['Vehicle expenses', -calc.totalExpenses],
                                ['Company expenses', -calc.companyExpenses],
                                ['Driver/company expenses charged here', -calc.chargedExpenses],
                                ['Net', calc.netRevenue],
                                ['Driver pay', -calc.driverPayTotal],
                                ['Loss brought forward', -calc.lossIn],
                                ['Loss carried forward', calc.lossOut],
                                ['Partner pool', partnerPool],
                                ['Company retained (days without partners)', -calc.companyRetained],
                              ].filter(([label, v]) => v !== 0 || label === 'Net' || label === 'Partner pool').map(([label, v]) => (
                                <div key={label as string} className="flex justify-between px-4 py-2">
                                  <dt className="text-zinc-500">{label}</dt>
                                  <dd className="font-mono">SAR {fmt(v as number)}</dd>
                                </div>
                              ))}
                            </dl>
                            {calc.driverPay.map((d, i) => (
                              <div key={i} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                <div className="font-bold">{d.driverName}: SAR {fmt(d.total)}</div>
                                <div className="text-zinc-500 mt-1">
                                  {d.days} days · own net SAR {fmt(d.baseNet)}
                                  {d.commission > 0 && <> · commission SAR {fmt(d.commission)}</>}
                                  {d.salary > 0 && <> · salary SAR {fmt(d.salary)}</>}
                                  {d.bonus > 0 && <> · bonus SAR {fmt(d.bonus)}</>}
                                </div>
                              </div>
                            ))}
                            {calc.shares.map((s, i) => (
                              <div key={i} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                                <div><div className="font-bold">{s.partnerName}</div><div className="text-zinc-500">{s.pct}% of the SAR {fmt(Math.max(partnerPool, 0))} partner pool</div></div>
                                <div className="font-bold text-emerald-600 dark:text-emerald-400">SAR {fmt(s.amount)}</div>
                              </div>
                            ))}
                          </div>
                          <DrawerFooter>
                            <DrawerClose className="inline-flex items-center justify-center text-sm h-10 px-4 py-2 border rounded-xl border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Close</DrawerClose>
                          </DrawerFooter>
                        </DrawerContent>
                      </Drawer>
                      {calc.status === 'draft' && (
                        <>
                          <Button variant="outline" onClick={() => handleDeleteDraft(calc)} disabled={busy === calc.id || isEditing}
                            className="rounded-xl text-zinc-600 dark:text-zinc-400">
                            <Trash2 className="h-4 w-4 mr-2" />Delete Draft
                          </Button>
                          <Button onClick={() => handleFinalize(calc)} disabled={busy === calc.id || isEditing}
                            className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl font-semibold shadow-sm">
                            <CheckCircle2 className="h-4 w-4 mr-2" />{busy === calc.id ? 'Working...' : 'Finalize Payout'}
                          </Button>
                        </>
                      )}
                    </div>
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
