'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/dexie';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, CheckCircle2, Camera, Image as ImageIcon, Car, Lock, Building } from 'lucide-react';
import Link from 'next/link';

export default function AddRidePage() {
  const router = useRouter();
  
  const [revenueType, setRevenueType] = useState<'CASH' | 'VOUCHER'>('CASH');
  const [revenue, setRevenue] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Voucher fields
  const [payerId, setPayerId] = useState('');
  const [voucherReference, setVoucherReference] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const payers = useLiveQuery(() => db.payers.toArray(), [], []);

  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const isFormValid = () => {
    if (!revenue || isNaN(Number(revenue))) return false;
    
    if (revenueType === 'VOUCHER') {
      if (!payerId) return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;
    
    setIsSubmitting(true);
    
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    
    const rideId = crypto.randomUUID();
    const ride = {
      id: rideId,
      date: today,
      time: time,
      amount: Number(revenue),
      revenueType: revenueType,
      paymentStatus: revenueType === 'CASH' ? 'Received' as const : 'Outstanding' as const,
      payerId: revenueType === 'VOUCHER' ? payerId : undefined,
      voucherReference: revenueType === 'VOUCHER' ? voucherReference : undefined,
      notes: notes,
      evidenceImageBase64: imagePreview || undefined,
      syncStatus: 'pending' as const,
      createdAt: now,
    };

    await db.rides.add(ride);
    
    setIsSubmitting(false);
    router.push('/driver');
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        <Link href="/driver" className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-bold text-lg tracking-tight">Log a Trip</h1>
      </header>

      <main className="flex-1 p-4 pb-32">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* VEHICLE INFO */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="bg-white dark:bg-zinc-800 p-2 rounded-lg shadow-sm">
              <Car className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Active Vehicle</p>
              <p className="font-medium text-sm leading-none mt-1">Toyota Camry • ABC 1234</p>
            </div>
            <div className="px-2">
              <Lock className="h-4 w-4 text-zinc-400" />
            </div>
          </div>

          {/* REVENUE TYPE SEGMENTED CONTROL */}
          <section className="bg-white dark:bg-zinc-900 rounded-2xl p-2 border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setRevenueType('CASH')}
                className={`flex-1 py-3 text-sm font-semibold rounded-lg transition-all ${
                  revenueType === 'CASH' 
                    ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' 
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                CASH RIDE
              </button>
              <button
                type="button"
                onClick={() => setRevenueType('VOUCHER')}
                className={`flex-1 py-3 text-sm font-semibold rounded-lg transition-all ${
                  revenueType === 'VOUCHER' 
                    ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' 
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                VOUCHER RIDE
              </button>
            </div>
          </section>

          {/* REVENUE AMOUNT */}
          <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              Revenue Amount
            </h2>
            <div className="space-y-2">
              <div className="relative">
                <Input
                  id="revenue"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  className="text-3xl h-16 pl-4 font-bold rounded-xl border-zinc-300 dark:border-zinc-700 focus-visible:ring-indigo-500"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium">
                  SAR
                </div>
              </div>
            </div>

            {revenueType === 'CASH' && (
              <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Payment Status</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">This will increase your Cash in Hand.</p>
                </div>
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-900/50 px-2 py-1 rounded">
                  <CheckCircle2 className="w-4 h-4" /> Received
                </div>
              </div>
            )}
          </section>

          {/* VOUCHER SPECIFIC FIELDS */}
          {revenueType === 'VOUCHER' && (
            <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <Building className="w-5 h-5" /> Voucher Details
                </h2>
                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider bg-rose-50 dark:bg-rose-500/10 px-2 py-1 rounded">Required</span>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="payerId" className="text-zinc-500">Paying Organization *</Label>
                <select
                  id="payerId"
                  value={payerId}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') {
                      // Simulating adding new payer
                      const name = prompt('Enter new payer name:');
                      if (name) {
                        const newPayer = { id: crypto.randomUUID(), name, type: 'Organization' as const, createdAt: Date.now() };
                        db.payers.add(newPayer);
                        setPayerId(newPayer.id);
                      }
                    } else {
                      setPayerId(e.target.value);
                    }
                  }}
                  required={revenueType === 'VOUCHER'}
                  className="flex h-12 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="" disabled>Select Payer</option>
                  {payers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value="ADD_NEW">+ Add New Payer</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="voucherRef" className="text-zinc-500">Voucher Reference</Label>
                <Input
                  id="voucherRef"
                  type="text"
                  placeholder="e.g. VOUCH-12345"
                  value={voucherReference}
                  onChange={(e) => setVoucherReference(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Payment Status</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">Does not increase Cash in Hand.</p>
                </div>
                <div className="text-amber-600 dark:text-amber-400 font-bold bg-amber-100 dark:bg-amber-900/50 px-2 py-1 rounded">
                  Outstanding
                </div>
              </div>
            </section>
          )}

          {/* NOTES & EVIDENCE */}
          <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              Additional Info
            </h2>
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-zinc-500">Notes (Optional)</Label>
              <Input
                id="notes"
                type="text"
                placeholder="Route, passenger count, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>

            <div className="pt-2">
              <Label className="text-zinc-500 mb-2 block">Receipt / Evidence (Optional)</Label>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleImageCapture}
              />
              
              {!imagePreview ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl h-32 bg-zinc-50 dark:bg-zinc-950 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <Camera className="h-6 w-6 text-zinc-400 mb-2" />
                  <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Tap to attach</span>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden border dark:border-zinc-800 shadow-sm">
                  <img src={imagePreview} alt="Receipt preview" className="w-full h-48 object-cover" />
                  <Button 
                    type="button" 
                    variant="secondary" 
                    size="sm"
                    className="absolute bottom-2 right-2 shadow-md bg-white/90 text-zinc-900 hover:bg-white"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" /> Retake
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* FIXED SUBMIT BUTTON */}
          <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t dark:border-zinc-800 z-40">
            <Button 
              type="submit" 
              disabled={isSubmitting || !isFormValid()}
              className="w-full h-14 text-lg rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg gap-2 transition-all disabled:opacity-50 disabled:shadow-none"
            >
              <CheckCircle2 className="h-5 w-5" />
              Save Trip
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

