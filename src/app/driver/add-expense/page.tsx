'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/dexie';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Camera, CheckCircle2, Image as ImageIcon, Wallet, CreditCard, Clock, FileText } from 'lucide-react';
import Link from 'next/link';

const VEHICLE_CATEGORIES = ['Fuel', 'Parking', 'Toll', 'Car Wash', 'Maintenance', 'Oil Change', 'Tires', 'Repair', 'Spare Parts', 'Cleaning', 'Other Vehicle Expense'];
const DRIVER_CATEGORIES = ['Driver Meal', 'Driver Travel', 'Driver Accommodation', 'Driver Allowance', 'Other Driver Expense'];
const GENERAL_CATEGORIES = ['Other'];

const RECEIPT_REQUIRED_CATEGORIES = ['Fuel', 'Maintenance', 'Repair', 'Spare Parts', 'Driver Accommodation'];
const RECEIPT_REQUIRED_THRESHOLD = 100;

export default function AddExpensePage() {
  const router = useRouter();
  
  const [step, setStep] = useState<1 | 2>(1); // 1: Form, 2: Review

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(new Date().toTimeString().substring(0, 5));
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Fuel');
  const [allocation, setAllocation] = useState<'Current Vehicle' | 'Driver' | 'Other / Company'>('Current Vehicle');
  const [description, setDescription] = useState('');
  const [paymentSource, setPaymentSource] = useState<'Cash' | 'Company Card' | 'Bank Transfer' | 'Other'>('Cash');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived State
  const amountNum = Number(amount) || 0;
  const isReceiptRequired = amountNum >= RECEIPT_REQUIRED_THRESHOLD || RECEIPT_REQUIRED_CATEGORIES.includes(category);
  const isDescriptionRequired = category.startsWith('Other');
  
  const isValid = () => {
    if (amountNum <= 0) return false;
    if (!category) return false;
    if (!paymentSource) return false;
    if (isDescriptionRequired && !description.trim()) return false;
    if (isReceiptRequired && !imagePreview) return false;
    return true;
  };

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

  const handleNext = () => {
    if (isValid()) setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid()) return;
    
    setIsSubmitting(true);
    
    const expense = {
      id: crypto.randomUUID(),
      date,
      time,
      amount: amountNum,
      category,
      allocation,
      vehicleId: allocation === 'Current Vehicle' ? 'VEH-001' : undefined, // Hardcoded active vehicle for demo
      paymentSource,
      description: description.trim() || undefined,
      receiptImageBase64: imagePreview || undefined,
      syncStatus: 'pending' as const,
      createdAt: Date.now(),
    };

    await db.expenses.add(expense);
    setIsSubmitting(false);
    router.push('/driver/expenses');
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center h-14 px-4 border-b bg-white dark:bg-zinc-950 dark:border-zinc-800 sticky top-0 z-10 shadow-sm">
        {step === 1 ? (
          <Link href="/driver/expenses" className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <button onClick={() => setStep(1)} className="mr-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h1 className="font-bold text-lg tracking-tight">
          {step === 1 ? 'Log Expense' : 'Review Expense'}
        </h1>
      </header>

      <main className="flex-1 p-4 pb-32">
        {step === 1 ? (
          <div className="space-y-6">
            
            {/* AMOUNT & DATE */}
            <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <h2 className="font-semibold text-lg">Expense Details</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-xs">Date</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl border-zinc-300 dark:border-zinc-700" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-xs">Time</Label>
                  <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="rounded-xl border-zinc-300 dark:border-zinc-700" />
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                <Label className="text-zinc-500 text-xs">Amount (SAR) *</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="text-3xl h-16 pl-4 font-bold rounded-xl border-zinc-300 dark:border-zinc-700 focus-visible:ring-indigo-500"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium">SAR</div>
                </div>
              </div>
            </section>

            {/* CATEGORY & ALLOCATION */}
            <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-500 text-xs">Category *</Label>
                <select
                  value={category}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCategory(val);
                    if (DRIVER_CATEGORIES.includes(val)) setAllocation('Driver');
                    else if (VEHICLE_CATEGORIES.includes(val)) setAllocation('Current Vehicle');
                  }}
                  className="flex h-12 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <optgroup label="Vehicle">
                    {VEHICLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                  <optgroup label="Driver">
                    {DRIVER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                  <optgroup label="General">
                    {GENERAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-500 text-xs flex justify-between">
                  Description / Notes
                  {isDescriptionRequired && <span className="text-rose-500 font-medium">Required</span>}
                </Label>
                <Input
                  type="text"
                  placeholder={isDescriptionRequired ? "What is this expense for?" : "Optional details"}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`h-12 rounded-xl ${isDescriptionRequired && !description.trim() ? 'border-rose-300 dark:border-rose-800' : 'border-zinc-300 dark:border-zinc-700'}`}
                />
              </div>

              <div className="space-y-2 pt-2 border-t dark:border-zinc-800">
                <Label className="text-zinc-500 text-xs">Expense Belongs To</Label>
                <div className="grid grid-cols-3 gap-2">
                  {['Current Vehicle', 'Driver', 'Other / Company'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAllocation(opt as any)}
                      className={`text-xs p-2 rounded-lg border text-center font-medium transition-all ${
                        allocation === opt 
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' 
                        : 'border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {opt.split(' / ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* PAYMENT SOURCE */}
            <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-500 text-xs">Payment Source *</Label>
                <select
                  value={paymentSource}
                  onChange={(e) => setPaymentSource(e.target.value as any)}
                  className="flex h-12 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="Cash">Cash</option>
                  <option value="Company Card">Company Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              {paymentSource === 'Cash' ? (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-100 dark:border-rose-900 flex items-center gap-3">
                  <Wallet className="text-rose-500 w-5 h-5 shrink-0" />
                  <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">
                    This will reduce your Expected Cash in Hand balance by SAR {amountNum.toFixed(2)}.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                  <CreditCard className="text-zinc-500 w-5 h-5 shrink-0" />
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                    Non-cash expense. Your Cash in Hand balance will remain unchanged.
                  </p>
                </div>
              )}
            </section>

            {/* RECEIPT */}
            <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-500 text-xs flex justify-between items-center">
                  Receipt Photo
                  {isReceiptRequired ? (
                    <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider bg-rose-50 dark:bg-rose-500/10 px-2 py-1 rounded">Required *</span>
                  ) : (
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Optional</span>
                  )}
                </Label>
                
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
                    className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl h-32 cursor-pointer transition-colors ${
                      isReceiptRequired && !imagePreview ? 'border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/20 text-rose-500' : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-indigo-600 dark:text-indigo-400'
                    }`}
                  >
                    <Camera className="h-8 w-8 mb-2 opacity-80" />
                    <span className="text-sm font-medium">Tap to upload receipt</span>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border dark:border-zinc-800">
                    <img src={imagePreview} alt="Receipt preview" className="w-full h-48 object-cover" />
                    <Button 
                      type="button" 
                      variant="secondary" 
                      size="sm"
                      className="absolute bottom-2 right-2 shadow-md bg-white/90 text-zinc-900 hover:bg-white"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="h-4 w-4 mr-2" /> Replace
                    </Button>
                  </div>
                )}
                {isReceiptRequired && !imagePreview && (
                  <p className="text-xs text-rose-500 font-medium">Receipt is required for this expense amount or category.</p>
                )}
              </div>
            </section>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t dark:border-zinc-800 pb-safe">
              <Button 
                onClick={handleNext}
                disabled={!isValid()}
                className="w-full h-14 text-lg rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 text-white shadow-lg transition-all disabled:opacity-50 disabled:shadow-none"
              >
                Review Expense
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* STEP 2: SUMMARY */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 border-b dark:border-zinc-800 text-center">
                <p className="text-sm text-zinc-500 font-medium mb-1">EXPENSE SUMMARY</p>
                <div className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  SAR {amountNum.toFixed(2)}
                </div>
              </div>
              
              <div className="p-5 space-y-4 text-sm divide-y dark:divide-zinc-800">
                <div className="flex justify-between pb-4">
                  <span className="text-zinc-500">Date & Time</span>
                  <span className="font-semibold text-right">{date}<br/><span className="text-zinc-400 font-normal">{time}</span></span>
                </div>
                
                <div className="flex justify-between py-4">
                  <span className="text-zinc-500">Category</span>
                  <span className="font-semibold">{category}</span>
                </div>

                {description && (
                  <div className="flex justify-between py-4">
                    <span className="text-zinc-500">Description</span>
                    <span className="font-medium text-right max-w-[60%]">{description}</span>
                  </div>
                )}
                
                <div className="flex justify-between py-4">
                  <span className="text-zinc-500">Belongs To</span>
                  <span className="font-semibold">{allocation}</span>
                </div>
                
                <div className="flex justify-between py-4">
                  <span className="text-zinc-500">Payment Source</span>
                  <span className="font-semibold">{paymentSource}</span>
                </div>

                <div className="flex justify-between pt-4 pb-2">
                  <span className="text-zinc-500 font-semibold">Cash Impact</span>
                  <span className={`font-bold ${paymentSource === 'Cash' ? 'text-rose-600' : 'text-zinc-500'}`}>
                    {paymentSource === 'Cash' ? `-SAR ${amountNum.toFixed(2)}` : 'SAR 0.00'}
                  </span>
                </div>
              </div>
            </div>

            {imagePreview && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden p-4">
                <Label className="text-zinc-500 text-xs mb-2 block">Attached Receipt</Label>
                <img src={imagePreview} className="w-full h-32 object-cover rounded-lg border dark:border-zinc-800" />
              </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t dark:border-zinc-800 pb-safe space-y-3">
              <Button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full h-14 text-lg rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg gap-2 transition-all disabled:opacity-50 disabled:shadow-none"
              >
                <CheckCircle2 className="h-5 w-5" />
                Confirm Expense
              </Button>
              <Button 
                onClick={() => setStep(1)}
                variant="ghost"
                className="w-full h-12 text-zinc-500"
              >
                Go Back
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
