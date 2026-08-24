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
  const [partners, setPartners] = useState<{ id: string, name: string, username: string }[]>([]);

  useEffect(() => {
    // Load Vehicle
    createClient().from('vehicles').select('make,model,plate_number').eq('id', vehicleId).single()
      .then(({ data }) => { if (data) setVehicle(data); });
      
    // Load Partners
    fetch('/api/admin/partners-list')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPartners(d); });
  }, [vehicleId]);

  const [driverPayType, setDriverPayType] = useState<'commission' | 'fixed_salary'>('commission');
  const [driverCommission, setDriverCommission] = useState('35.0');
  const [driverSalary, setDriverSalary] = useState('4000.00');
  const [driverBonus, setDriverBonus] = useState('0');
  
  // Real splits mapped to actual partner IDs
  const [splits, setSplits] = useState<{ id: string, partnerId: string, pct: string }[]>([]);
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
  
  const handlePartnerChange = (id: string, partnerId: string) => {
    setSplits(splits.map(s => s.id === id ? { ...s, partnerId } : s));
  }

  const handleRemove = (id: string) => {
    setSplits(splits.filter(s => s.id !== id));
  };

  const handleAddInline = () => {
    setSplits([...splits, { id: `new-${Date.now()}`, partnerId: '', pct: '0.0' }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Math.abs(total - 100) > 0.01) return;
    
    // Ensure all splits have a valid partner selected
    const missingPartner = splits.find(s => !s.partnerId);
    if (missingPartner) {
        setError("Please select a partner for all splits before saving.");
        return;
    }
    
    setIsSubmitting(true); setError(null);
    const res = await fetch('/api/admin/vehicle-splits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        vehicleId, 
        splits: splits.map(s => ({ partnerId: s.partnerId, percentage: s.pct })), 
        driverPayType, 
        driverCommission, 
        driverSalary, 
        driverBonus 
      }),
    });
    const json = await res.json();
    setIsSubmitting(false);
    if (!res.ok) { setError(json.message || "Failed to save setup."); return; }
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
              <button className="w-full h-11 bg-ink hover:bg-ink-soft text-white font-medium rounded-lg transition-colors">
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
        <Link href={`/admin/vehicles`}>
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
        <div className="bg-paper-raised border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden bg-white dark:bg-zinc-950">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <h3 className="text-xl font-bold">Driver Pay Setup</h3>
            <p className="text-sm text-zinc-500">Configure compensation for the primary driver of this vehicle.</p>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setDriverPayType('commission')}
                className={`flex-1 p-4 border rounded-xl flex flex-col items-center text-center transition-all ${
                  driverPayType === 'commission'
                    ? 'border-indigo-600 bg-indigo-600 text-white ring-2 ring-indigo-600/20 ring-offset-2'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 hover:border-zinc-300'
                }`}
              >
                <Percent className="h-5 w-5 mb-2 opacity-80" />
                <span className="font-bold">Commission</span>
                <span className={`text-xs mt-1 ${driverPayType === 'commission' ? 'text-white/70' : 'text-zinc-500'}`}>Percentage of Net Revenue</span>
              </button>
              
              <button
                type="button"
                onClick={() => setDriverPayType('fixed_salary')}
                className={`flex-1 p-4 border rounded-xl flex flex-col items-center text-center transition-all ${
                  driverPayType === 'fixed_salary'
                    ? 'border-indigo-600 bg-indigo-600 text-white ring-2 ring-indigo-600/20 ring-offset-2'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 hover:border-zinc-300'
                }`}
              >
                <span className="font-bold text-xl mb-1 opacity-80">SAR</span>
                <span className="font-bold">Fixed Salary</span>
                <span className={`text-xs mt-1 ${driverPayType === 'fixed_salary' ? 'text-white/70' : 'text-zinc-500'}`}>Fixed amount per period</span>
              </button>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
              {driverPayType === 'commission' ? (
                <div className="space-y-2 max-w-xs">
                  <label className="text-sm font-medium">Commission Percentage</label>
                  <div className="relative flex items-center">
                    <input 
                      type="number" 
                      step="0.1"
                      value={driverCommission}
                      onChange={(e) => setDriverCommission(e.target.value)}
                      className="w-full h-11 pr-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 px-3"
                    />
                    <Percent className="absolute right-3 h-4 w-4 text-zinc-500" />
                  </div>
                  <p className="text-xs text-zinc-500">Deducted as an expense before partner equity is split.</p>
                </div>
              ) : (
                <div className="space-y-4 max-w-xs">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fixed Salary Amount (SAR)</label>
                    <input
                      type="number"
                      step="100"
                      value={driverSalary}
                      onChange={(e) => setDriverSalary(e.target.value)}
                      className="w-full h-11 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 px-3"
                    />
                    <p className="text-xs text-zinc-500">Paid out regardless of vehicle revenue.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Performance Bonus % <span className="text-zinc-500 font-normal">(optional)</span></label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="50"
                        value={driverBonus}
                        onChange={(e) => setDriverBonus(e.target.value)}
                        className="w-full h-11 pr-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-indigo-600/20 px-3"
                      />
                      <Percent className="absolute right-3 h-4 w-4 text-zinc-500" />
                    </div>
                    <p className="text-xs text-zinc-500">Bonus on net revenue after expenses. 0 = no bonus.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* EQUITY SPLIT SETUP */}
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden bg-white dark:bg-zinc-950">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
            <div>
              <h3 className="text-xl font-bold">Partner Equity Split</h3>
              <p className="text-sm text-zinc-500">Divide the remaining Net Revenue. Must sum to exactly 100%.</p>
            </div>
            
            {/* Live Total Indicator */}
            <div className={`px-4 py-2 rounded-lg border flex items-center gap-2 transition-colors duration-300 ${
              isExact ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800/50 dark:text-emerald-400' :
              isOver ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/30 dark:border-rose-800/50 dark:text-rose-400' :
              'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800/50 dark:text-amber-400'
            }`}>
              {isExact ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              <span className="font-mono font-bold text-lg">{total.toFixed(1)}%</span>
            </div>
          </div>
          
          <div className="p-6 space-y-4">
            {error && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium">
                    {error}
                </div>
            )}
            
            <div className="space-y-3">
              {splits.length === 0 && (
                <p className="text-sm text-zinc-500 py-4 text-center">No partners assigned yet. Add your first partner below.</p>
              )}
              {splits.map((split) => (
                <div key={split.id} className="flex items-center gap-4 bg-white dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800 focus-within:ring-2 focus-within:ring-indigo-600/20 focus-within:border-indigo-600 transition-all">
                  <div className="flex-1">
                    <select
                        value={split.partnerId}
                        onChange={(e) => handlePartnerChange(split.id, e.target.value)}
                        className="w-full bg-transparent font-medium focus:outline-none appearance-none"
                    >
                        <option value="" disabled>Select a partner...</option>
                        {partners.map(p => (
                            <option key={p.id} value={p.id}>{p.name} (@{p.username})</option>
                        ))}
                    </select>
                  </div>
                  <div className="w-32 relative flex items-center border-l border-zinc-200 dark:border-zinc-800 pl-4">
                    <input 
                      type="number" 
                      step="0.1"
                      value={split.pct}
                      onChange={(e) => handlePctChange(split.id, e.target.value)}
                      className="w-full text-right pr-6 bg-transparent font-mono font-bold text-lg focus:outline-none"
                      placeholder="0.0"
                    />
                    <Percent className="absolute right-1 h-4 w-4 text-zinc-400" />
                  </div>
                  <button type="button" onClick={() => handleRemove(split.id)} className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition-colors">
                    <span className="sr-only">Remove</span>
                    &times;
                  </button>
                </div>
              ))}
            </div>

            <button 
              type="button" 
              onClick={handleAddInline}
              className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors px-2 py-2"
            >
              <UserPlus className="h-4 w-4" />
              Add another partner
            </button>
            
            {/* Status Message based on exactness */}
            <div className="mt-6">
              {!isExact && splits.length > 0 && (
                <p className={`text-sm font-medium ${isOver ? 'text-rose-600' : 'text-amber-600'}`}>
                  {isOver 
                    ? `Total: ${total.toFixed(1)}% — you are over by ${Math.abs(difference).toFixed(1)}%.`
                    : `Total: ${total.toFixed(1)}% — need ${difference.toFixed(1)}% more to reach 100%.`}
                </p>
              )}
              {isExact && splits.length > 0 && (
                <p className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
                  Total: 100.0% <CheckCircle2 className="h-4 w-4" /> Split is perfectly balanced.
                </p>
              )}
            </div>
          </div>
          
          {/* Review Summary before Submit */}
          <div className="bg-zinc-50 dark:bg-zinc-900 p-6 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <h4 className="text-sm font-bold mb-2 uppercase tracking-wider">Review Commit</h4>
              {isExact && splits.length > 0 ? (
                <div className="space-y-1">
                  {splits.map(s => {
                    const matchedPartner = partners.find(p => p.id === s.partnerId);
                    return (
                        <div key={s.id} className="flex justify-between text-sm">
                            <span className="text-zinc-500">{matchedPartner ? matchedPartner.name : 'Unknown Partner'}</span>
                            <span className="font-mono font-bold">{parseFloat(s.pct).toFixed(1)}%</span>
                        </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Finish assigning 100% of the shares to review the commit.</p>
              )}
            </div>
            
            <button 
              type="submit" 
              disabled={!isExact || isSubmitting || splits.length === 0}
              className={`h-11 px-8 rounded-lg font-medium transition-colors shrink-0 ${
                isExact && !isSubmitting && splits.length > 0
                  ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Saving...' : 'Confirm & Save Split'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}