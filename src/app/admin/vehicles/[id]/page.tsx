'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, AlertCircle, Save, Plus, Trash2, Users, Settings } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Partner { id: string; name: string; }
interface Split { id: string; partnerId: string; name: string; percentage: string; }
interface Vehicle { id: string; make: string; model: string; plate_number: string; }

export default function VehicleSplitPage() {
  const { id: vehicleId } = useParams() as { id: string };
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [splits, setSplits] = useState<Split[]>([]);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [total, setTotal] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [vRes, pRes, spRes] = await Promise.all([
      supabase.from('vehicles').select('id,make,model,plate_number').eq('id', vehicleId).single(),
      supabase.from('partners').select('id,name').eq('status','Active').order('name'),
      supabase.from('vehicle_partners').select('id,partner_id,percentage,partners(name)').eq('vehicle_id', vehicleId).is('effective_to', null),
    ]);
    if (vRes.data) setVehicle(vRes.data);
    if (pRes.data) setAllPartners(pRes.data);
    if (spRes.data) {
      setSplits(spRes.data.map((s: any) => ({
        id: s.id,
        partnerId: s.partner_id,
        name: (s.partners as any)?.name ?? 'Unknown',
        percentage: String(s.percentage),
      })));
    }
  }, [vehicleId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setTotal(splits.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0));
  }, [splits]);

  const availablePartners = allPartners.filter(p => !splits.some(s => s.partnerId === p.id));

  const handleSave = async () => {
    if (Math.abs(total - 100) > 0.01) return;
    setIsSaving(true); setError(null);
    const res = await fetch('/api/admin/vehicle-splits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId, splits: splits.map(s => ({ partnerId: s.partnerId, percentage: s.percentage })) }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.message); setIsSaving(false); return; }
    setSaved(true); setIsSaving(false);
  };

  const isExact = Math.abs(total - 100) < 0.01;
  const isOver = total > 100;

  if (!vehicle) return <div className="p-8 text-zinc-400 text-sm">Loading vehicle...</div>;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/vehicles">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-zinc-200 dark:border-zinc-800">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Partner Split</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">{vehicle.make} {vehicle.model} · {vehicle.plate_number}</p>
        </div>
        <Link href={`/admin/vehicles/${vehicleId}/setup`}>
          <Button variant="outline" className="gap-2 rounded-xl border-zinc-200 dark:border-zinc-800">
            <Settings className="h-4 w-4" />Driver Pay Setup
          </Button>
        </Link>
      </div>

      {saved && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-400 font-medium">
          ✓ Partner split saved successfully.
        </div>
      )}

      <Card className="border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 p-6">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-indigo-500" />Ownership Distribution</CardTitle>
          <CardDescription>Assign exact percentage shares for revenue calculations. Total must equal exactly 100%.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {splits.map((split) => (
            <div key={split.id} className="flex items-center gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <div className="flex-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Partner</label>
                <select
                  value={split.partnerId}
                  onChange={(e) => {
                    const p = allPartners.find(p => p.id === e.target.value);
                    setSplits(splits.map(s => s.id === split.id ? { ...s, partnerId: e.target.value, name: p?.name ?? '' } : s));
                    setSaved(false);
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-sm font-medium"
                >
                  <option value={split.partnerId}>{split.name}</option>
                  {availablePartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="w-32">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Share %</label>
                <div className="relative">
                  <input
                    type="number" step="0.1" min="0" max="100"
                    value={split.percentage}
                    onChange={(e) => { setSplits(splits.map(s => s.id === split.id ? { ...s, percentage: e.target.value } : s)); setSaved(false); }}
                    className="w-full h-9 pl-3 pr-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-bold text-indigo-700 dark:text-indigo-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-bold">%</span>
                </div>
              </div>
              <div className="pt-5">
                <Button variant="ghost" size="icon" onClick={() => { setSplits(splits.filter(s => s.id !== split.id)); setSaved(false); }} className="h-9 w-9 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {availablePartners.length > 0 && (
            <Button variant="outline" onClick={() => { const p = availablePartners[0]; setSplits([...splits, { id: `new-${Date.now()}`, partnerId: p.id, name: p.name, percentage: '0' }]); setSaved(false); }}
              className="w-full border-dashed border-2 rounded-xl h-12 text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-700">
              <Plus className="h-4 w-4 mr-2" />Add Partner
            </Button>
          )}

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><AlertCircle className="inline h-4 w-4 mr-1" />{error}</div>}

          <div className={`p-4 rounded-xl flex items-center justify-between border ${isExact ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-300' : isOver ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800/50 dark:text-rose-300' : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800/50 dark:text-amber-300'}`}>
            <div>
              <div className="font-bold text-lg">Total: {total.toFixed(1)}%</div>
              <div className="text-xs opacity-80">
                {isExact ? 'Perfectly balanced — ready to save.' : isOver ? `Over by ${(total - 100).toFixed(1)}%` : `Need ${(100 - total).toFixed(1)}% more.`}
              </div>
            </div>
            <Button onClick={handleSave} disabled={!isExact || isSaving}
              className={`rounded-xl h-10 px-6 font-semibold shadow-sm ${isExact ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'}`}>
              {isSaving ? 'Saving...' : <><Save className="h-4 w-4 mr-2" />Save Split</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}