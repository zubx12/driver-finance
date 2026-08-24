'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Car, AlertCircle, Save, Plus, Trash2, Users } from 'lucide-react';
import Link from 'next/link';

import { MOCK_PARTNER_VEHICLES, MOCK_PAYERS } from '@/data/mock-partner-data';
import { OwnershipArrangement } from '@/types/partner';

export default function VehicleSplitPage() {
  const params = useParams();
  const vehicleId = params.id as string;
  const router = useRouter();

  const vehicle = MOCK_PARTNER_VEHICLES.find(v => v.id === vehicleId);

  // Mock initial state for partners on this vehicle
  const [splits, setSplits] = useState<{ id: string, name: string, percentage: string }[]>([
    { id: 'PTR-1', name: 'Mohammed Abdullah', percentage: '50' },
    { id: 'PTR-2', name: 'Khalid Investor', percentage: '25' },
    { id: 'PTR-3', name: 'Fahad Partner', percentage: '25' }
  ]);

  const [total, setTotal] = useState(100);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let sum = 0;
    splits.forEach(s => {
      const val = parseFloat(s.percentage);
      if (!isNaN(val)) sum += val;
    });
    setTotal(sum);
  }, [splits]);

  if (!vehicle) return <div>Vehicle not found</div>;

  const handlePercentageChange = (id: string, value: string) => {
    setSplits(splits.map(s => s.id === id ? { ...s, percentage: value } : s));
  };

  const handleAddPartner = () => {
    setSplits([...splits, { id: `PTR-NEW-${Date.now()}`, name: 'New Partner', percentage: '0' }]);
  };

  const handleRemovePartner = (id: string) => {
    setSplits(splits.filter(s => s.id !== id));
  };

  const handleSave = () => {
    if (total !== 100) return;
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert('Ownership split finalized and saved securely.');
    }, 1000);
  };

  const isError = total !== 100;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/vehicles">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-zinc-200 dark:border-zinc-800">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partner Split</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            {vehicle.make} {vehicle.model} • {vehicle.plateNumber}
          </p>
        </div>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 p-6">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-500" />
            Ownership Distribution
          </CardTitle>
          <CardDescription>
            Assign exact percentage shares for revenue calculations. The total must equal exactly 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            {splits.map((split, idx) => (
              <div key={split.id} className="flex items-center gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Partner Name</label>
                  <input 
                    type="text" 
                    value={split.name}
                    onChange={(e) => setSplits(splits.map(s => s.id === split.id ? { ...s, name: e.target.value } : s))}
                    className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-sm font-medium"
                  />
                </div>
                <div className="w-32 space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Percentage (%)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={split.percentage}
                      onChange={(e) => handlePercentageChange(split.id, e.target.value)}
                      className="w-full h-9 pl-3 pr-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-bold text-indigo-700 dark:text-indigo-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-bold">%</span>
                  </div>
                </div>
                <div className="pt-5">
                  <Button variant="ghost" size="icon" onClick={() => handleRemovePartner(split.id)} className="h-9 w-9 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={handleAddPartner} className="w-full border-dashed border-2 rounded-xl h-12 text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
            <Plus className="h-4 w-4 mr-2" />
            Add Another Partner
          </Button>

          <div className={`p-4 rounded-xl flex items-center justify-between border ${
            isError 
              ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-300' 
              : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-300'
          }`}>
            <div className="flex items-center gap-3">
              {isError && <AlertCircle className="h-5 w-5" />}
              <div>
                <div className="font-bold text-lg">Total: {total.toFixed(2)}%</div>
                <div className="text-xs opacity-80">
                  {isError ? `Must equal 100%. Currently off by ${Math.abs(100 - total).toFixed(2)}%` : 'Perfectly balanced.'}
                </div>
              </div>
            </div>
            
            <Button 
              onClick={handleSave} 
              disabled={isError || isSaving}
              className={`rounded-xl h-10 px-6 font-semibold shadow-sm transition-all ${
                isError 
                  ? 'bg-rose-200 text-rose-500 cursor-not-allowed opacity-50 dark:bg-rose-900 dark:text-rose-400' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isSaving ? 'Saving...' : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Split
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
