'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, UserPlus, Car, CheckCircle2, History, AlertCircle, Percent } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function VehicleSetupPage() {
  const params = useParams();
  const vehicleId = params.id as string;
  const [vehicle, setVehicle] = useState<{ make: string; model: string; plate_number: string } | null>(null);

  useEffect(() => {
    createClient().from('vehicles').select('make,model,plate_number').eq('id', vehicleId).single()
      .then(({ data }) => { if (data) setVehicle(data); });
  }, [vehicleId]);

  const [driverPayType, setDriverPayType] = useState<'commission' | 'fixed_salary'>('commission');
  const [driverCommission, setDriverCommission] = useState('35.0');
  const [driverSalary, setDriverSalary] = useState('4000.00');
  const [driverBonus, setDriverBonus] = useState('0');
  const [splits, setSplits] = useState<{ id: string, name: string, pct: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTotal(splits.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0));
  }, [splits]);

  const handlePctChange = (id: string, val: string) => {
    setSplits(splits.map(s => s.id === id ? { ...s, pct: val } : s));
  };

  const handleRemove = (id: string) => {
    setSplits(splits.filter(s => s.id !== id));
  };

  const handleAddInline = () => {
    setSplits([...splits, { id: `new-${Date.now()}`, name: 'Partner Name', pct: '0.0' }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Math.abs(total - 100) > 0.01) return;
    setIsSubmitting(true); setError(null);
    const res = await fetch('/api/admin/vehicle-splits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId, splits: splits.map(s => ({ partnerId: s.id, percentage: s.pct })), driverPayType, driverCommission, driverSalary, driverBonus }),
    });
    const json = await res.json();
    setIsSubmitting(false);
    if (!res.ok) { setError(json.message); return; }
    setIsSuccess(true);
  };

  const difference = 100 - total;
  const isExact = Math.abs(total - 100) < 0.01;
  const isOver = total > 100;
  const vehicleLabel = vehicle ? `${vehicle.make} ${vehicle.model}` : 'Vehicle';
  const plateLabel = vehicle?.plate_number ?? '';

  if (isSuccess) {
    return (
      <div className="max-w-xl mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-paper-raised border border-line rounded-xl p-8 shadow-sm text-center">
          <div className="mx-auto w-12 h-12 bg-route/10 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="h-6 w-6 text-route" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-ink mb-2">Setup Complete</h2>
          <p className="text-ink-soft mb-8">
            Driver compensation and ownership split saved for {vehicleLabel}. They apply to all future salary runs.
          </p>
          <div className="mt-8 pt-6 border-t border-line">
            <Link href="/admin/vehicles">
              <button className="w-full h-11 bg-ink hover:bg-ink-soft text-paper-raised font-medium rounded-lg transition-colors">
                Return to Vehicles
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href={`/admin/vehicles/${vehicleId}`}>
          <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-line text-ink hover:bg-paper transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="font-heading text-3xl font-bold text-ink">Vehicle Setup</h1>
          <p className="text-ink-soft flex items-center gap-2">
            <Car className="h-4 w-4" /> {vehicleLabel} · <span className="font-mono">{plateLabel}</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* DRIVER PAY SETUP */}
        <div className="bg-paper-raised border border-line rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-line bg-paper/50">
            <h3 className="font-heading text-xl font-bold text-ink">Driver Pay Setup</h3>
            <p className="text-sm text-ink-soft">Configure compensation for the primary driver of this vehicle.</p>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setDriverPayType('commission')}
                className={`flex-1 p-4 border rounded-xl flex flex-col items-center text-center transition-all ${
                  driverPayType === 'commission'
                    ? 'border-ink bg-ink text-paper-raised ring-2 ring-ink/20 ring-offset-2'
                    : 'border-line bg-paper text-ink hover:border-ink/30'
                }`}
              >
                <Percent className="h-5 w-5 mb-2 opacity-80" />
                <span className="font-bold">Commission</span>
                <span className={`text-xs mt-1 ${driverPayType === 'commission' ? 'text-paper-raised/70' : 'text-ink-soft'}`}>Percentage of Net Revenue</span>
              </button>
              
              <button
                type="button"
                onClick={() => setDriverPayType('fixed_salary')}
                className={`flex-1 p-4 border rounded-xl flex flex-col items-center text-center transition-all ${
                  driverPayType === 'fixed_salary'
                    ? 'border-ink bg-ink text-paper-raised ring-2 ring-ink/20 ring-offset-2'
                    : 'border-line bg-paper text-ink hover:border-ink/30'
                }`}
              >
                <span className="font-bold text-xl mb-1 opacity-80">SAR</span>
                <span className="font-bold">Fixed Salary</span>
                <span className={`text-xs mt-1 ${driverPayType === 'fixed_salary' ? 'text-paper-raised/70' : 'text-ink-soft'}`}>Fixed amount per period</span>
              </button>
            </div>

            <div className="pt-4 border-t border-line">
              {driverPayType === 'commission' ? (
                <div className="space-y-2 max-w-xs">
                  <label className="text-sm font-medium text-ink">Commission Percentage</label>
                  <div className="relative flex items-center">
                    <input 
                      type="number" 
                      step="0.1"
                      value={driverCommission}
                      onChange={(e) => setDriverCommission(e.target.value)}
                      className="w-full h-11 pr-8 bg-paper border border-line rounded-lg font-mono font-bold text-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 px-3"
                    />
                    <Percent className="absolute right-3 h-4 w-4 text-ink-soft" />
                  </div>
                  <p className="text-xs text-ink-soft">Deducted as an expense before partner equity is split.</p>
                </div>
              ) : (
                <div className="space-y-4 max-w-xs">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-ink">Fixed Salary Amount (SAR)</label>
                    <input
                      type="number"
                      step="100"
                      value={driverSalary}
                      onChange={(e) => setDriverSalary(e.target.value)}
                      className="w-full h-11 bg-paper border border-line rounded-lg font-mono font-bold text-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 px-3"
                    />
                    <p className="text-xs text-ink-soft">Paid out regardless of vehicle revenue.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-ink">Performance Bonus % <span className="text-ink-soft font-normal">(optional)</span></label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="50"
                        value={driverBonus}
                        onChange={(e) => setDriverBonus(e.target.value)}
                        className="w-full h-11 pr-8 bg-paper border border-line rounded-lg font-mono font-bold text-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 px-3"
                      />
                      <Percent className="absolute right-3 h-4 w-4 text-ink-soft" />
                    </div>
                    <p className="text-xs text-ink-soft">Bonus on net revenue after expenses. 0 = no bonus.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* EQUITY SPLIT SETUP */}
        <div className="bg-paper-raised border border-line rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-line flex justify-between items-center bg-paper/50">
            <div>
              <h3 className="font-heading text-xl font-bold text-ink">Partner Equity Split</h3>
              <p className="text-sm text-ink-soft">Divide the remaining Net Revenue. Must sum to exactly 100%.</p>
            </div>
            
            {/* Live Total Indicator */}
            <div className={`px-4 py-2 rounded-lg border flex items-center gap-2 transition-colors duration-300 ${
              isExact ? 'bg-route/10 border-route text-route' :
              isOver ? 'bg-red/10 border-red text-red' :
              'bg-amber/10 border-amber text-amber'
            }`}>
              {isExact ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              <span className="font-mono font-bold text-lg">{total.toFixed(1)}%</span>
            </div>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="space-y-3">
              {splits.map((split) => (
                <div key={split.id} className="flex items-center gap-4 bg-paper rounded-lg p-3 border border-line focus-within:ring-2 focus-within:ring-ink/20 focus-within:border-ink transition-all">
                  <div className="flex-1">
                    <input 
                      type="text" 
                      value={split.name}
                      onChange={(e) => setSplits(splits.map(s => s.id === split.id ? { ...s, name: e.target.value } : s))}
                      className="w-full bg-transparent font-medium text-ink focus:outline-none"
                    />
                  </div>
                  <div className="w-32 relative flex items-center">
                    <input 
                      type="number" 
                      step="0.1"
                      value={split.pct}
                      onChange={(e) => handlePctChange(split.id, e.target.value)}
                      className="w-full text-right pr-6 bg-transparent font-mono font-bold text-lg text-ink focus:outline-none"
                    />
                    <Percent className="absolute right-1 h-4 w-4 text-ink-soft" />
                  </div>
                  <button type="button" onClick={() => handleRemove(split.id)} className="p-2 text-ink-soft hover:text-red hover:bg-red/10 rounded transition-colors">
                    <span className="sr-only">Remove</span>
                    &times;
                  </button>
                </div>
              ))}
            </div>

            <button 
              type="button" 
              onClick={handleAddInline}
              className="flex items-center gap-2 text-sm font-medium text-ink hover:text-route transition-colors px-2 py-2"
            >
              <UserPlus className="h-4 w-4" />
              Add another partner
            </button>
            
            {/* Status Message based on exactness */}
            <div className="mt-6">
              {!isExact && (
                <p className={`text-sm font-medium ${isOver ? 'text-red' : 'text-amber'}`}>
                  {isOver 
                    ? `Total: ${total.toFixed(1)}% — you are over by ${Math.abs(difference).toFixed(1)}%.`
                    : `Total: ${total.toFixed(1)}% — need ${difference.toFixed(1)}% more from another partner.`}
                </p>
              )}
              {isExact && (
                <p className="text-sm font-medium text-route flex items-center gap-1.5">
                  Total: 100.0% <CheckCircle2 className="h-4 w-4" /> Split is perfectly balanced.
                </p>
              )}
            </div>
          </div>
          
          {/* Review Summary before Submit */}
          <div className="bg-paper p-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <h4 className="text-sm font-bold text-ink mb-2 uppercase tracking-wider">Review Commit</h4>
              {isExact ? (
                <div className="space-y-1">
                  {splits.map(s => (
                    <div key={s.id} className="flex justify-between text-sm">
                      <span className="text-ink-soft">{s.name}</span>
                      <span className="font-mono font-bold text-ink">{parseFloat(s.pct).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-soft">Finish assigning 100% of the shares to review the commit.</p>
              )}
            </div>
            
            <button 
              type="submit" 
              disabled={!isExact || isSubmitting}
              className={`h-11 px-8 rounded-lg font-medium transition-colors shrink-0 ${
                isExact && !isSubmitting
                  ? 'bg-route text-white shadow-sm hover:bg-route/90'
                  : 'bg-line text-ink-soft cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Saving...' : 'Confirm & Save Split'}
            </button>
          </div>
        </div>

        {/* Collapsed Past Splits Context */}
        <div className="mt-8 border border-line rounded-xl overflow-hidden bg-paper/50">
          <details className="group">
            <summary className="flex items-center justify-between p-4 cursor-pointer font-medium text-ink-soft hover:text-ink transition-colors">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Past Splits History (Read-only)
              </div>
              <span className="text-xs border border-line px-2 py-0.5 rounded">1 Record</span>
            </summary>
            <div className="p-4 pt-0 border-t border-line/50 text-sm">
              <div className="py-3 flex justify-between items-center opacity-70">
                <div>
                  <div className="font-medium">Company (100.0%)</div>
                  <div className="text-xs text-ink-soft mt-1">Effective: Jan 1, 2026 - Present</div>
                </div>
                <div className="text-xs text-ink-soft font-mono">SYS-ORIGIN</div>
              </div>
            </div>
          </details>
        </div>
      </form>
    </div>
  );
}
