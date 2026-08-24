'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Play, FileText, CheckCircle2, Search, Eye } from 'lucide-react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { MOCK_PARTNER_VEHICLES } from '@/data/mock-partner-data';

export default function AdminSalaryPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  
  // Mock drafted salary calculations
  const [drafts, setDrafts] = useState([
    {
      id: 'CALC-101',
      vehicle: MOCK_PARTNER_VEHICLES[0],
      period: 'August 2026',
      totalRevenue: 28450,
      totalExpenses: 4120,
      netRevenue: 24330,
      status: 'draft',
      shares: [
        { name: 'Mohammed Abdullah', pct: 50, amount: 12165 },
        { name: 'Khalid Investor', pct: 25, amount: 6082.5 },
        { name: 'Fahad Partner', pct: 25, amount: 6082.5 }
      ]
    },
    {
      id: 'CALC-102',
      vehicle: MOCK_PARTNER_VEHICLES[1],
      period: 'August 2026',
      totalRevenue: 15300,
      totalExpenses: 1200,
      netRevenue: 14100,
      status: 'draft',
      shares: [
        { name: 'Company', pct: 60, amount: 8460 },
        { name: 'Mohammed Abdullah', pct: 40, amount: 5640 }
      ]
    }
  ]);

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setHasGenerated(true);
    }, 2000);
  };

  const handleFinalize = (calcId: string) => {
    if (!confirm('Are you sure you want to finalize this payout? This action is immutable and cannot be undone.')) return;
    
    setDrafts(drafts.map(d => d.id === calcId ? { ...d, status: 'finalized' } : d));
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Salary & Payout Runs</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Generate and finalize partner payouts based on vehicle splits.
          </p>
        </div>
      </header>

      <Card className="border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-950/10 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 space-y-2">
            <h2 className="text-xl font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-500" />
              August 2026 Payout Run
            </h2>
            <p className="text-sm text-indigo-700/80 dark:text-indigo-300/80">
              Run the automated salary engine. This will calculate Net Revenue for all active vehicles and generate draft splits according to the active partner percentages.
            </p>
          </div>
          <Button 
            size="lg" 
            onClick={handleGenerate} 
            disabled={isGenerating || hasGenerated}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow rounded-xl font-semibold"
          >
            {isGenerating ? 'Running Calculation Engine...' : hasGenerated ? 'Run Complete' : (
              <>
                <Play className="h-4 w-4 mr-2 fill-current" />
                Generate Draft Payouts
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {hasGenerated && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h3 className="text-lg font-bold">Draft Calculations (Requires Review)</h3>
          
          <div className="grid gap-6 md:grid-cols-2">
            {drafts.map((calc) => (
              <Card key={calc.id} className="border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 p-5 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-zinc-500" />
                      {calc.vehicle.make} {calc.vehicle.model}
                    </CardTitle>
                    <CardDescription className="font-mono mt-1">{calc.vehicle.plateNumber}</CardDescription>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                    calc.status === 'finalized' 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400' 
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400'
                  }`}>
                    {calc.status}
                  </span>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-3 divide-x divide-zinc-100 dark:divide-zinc-800 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="p-4 text-center">
                      <div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Total Rev</div>
                      <div className="font-medium">SAR {calc.totalRevenue.toLocaleString()}</div>
                    </div>
                    <div className="p-4 text-center">
                      <div className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Total Exp</div>
                      <div className="font-medium text-rose-600 dark:text-rose-400">SAR {calc.totalExpenses.toLocaleString()}</div>
                    </div>
                    <div className="p-4 text-center bg-indigo-50/50 dark:bg-indigo-900/10">
                      <div className="text-[10px] uppercase font-bold text-indigo-500 mb-1">Net Rev</div>
                      <div className="font-bold text-indigo-700 dark:text-indigo-400">SAR {calc.netRevenue.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Calculated Split</h4>
                    <div className="space-y-3">
                      {calc.shares.map((share, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{share.name}</div>
                            <div className="text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{share.pct}%</div>
                          </div>
                          <div className="font-bold text-sm">SAR {share.amount.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {calc.status === 'draft' && (
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
                      <Drawer>
                        <DrawerTrigger className="inline-flex items-center justify-center whitespace-nowrap text-sm h-10 px-4 py-2 border rounded-xl font-semibold shadow-sm text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                          <Eye className="h-4 w-4 mr-2" />
                          View Breakdown
                        </DrawerTrigger>
                        <DrawerContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 h-[80vh]">
                          <DrawerHeader>
                            <DrawerTitle>Calculation Breakdown - {calc.vehicle.make} {calc.vehicle.model}</DrawerTitle>
                            <DrawerDescription>Detailed view of all drivers, rides, and expenses for this period.</DrawerDescription>
                          </DrawerHeader>
                          <div className="p-4 overflow-y-auto space-y-6">
                            <div className="space-y-4">
                              <h3 className="font-bold text-lg">Active Drivers</h3>
                              {/* Mock Driver Breakdown */}
                              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex justify-between items-center">
                                <div>
                                  <div className="font-bold">Ahmed Al-Farsi</div>
                                  <div className="text-sm text-zinc-500">24 Days Active</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-medium text-emerald-600 dark:text-emerald-400">+ SAR 16,400 (Rides)</div>
                                  <div className="text-sm text-rose-600 dark:text-rose-400">- SAR 2,100 (Expenses)</div>
                                </div>
                              </div>
                              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex justify-between items-center">
                                <div>
                                  <div className="font-bold">Omar Hassan</div>
                                  <div className="text-sm text-zinc-500">18 Days Active</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-medium text-emerald-600 dark:text-emerald-400">+ SAR 12,050 (Rides)</div>
                                  <div className="text-sm text-rose-600 dark:text-rose-400">- SAR 2,020 (Expenses)</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <DrawerFooter>
                            <DrawerClose className="inline-flex items-center justify-center whitespace-nowrap text-sm h-10 px-4 py-2 border rounded-xl border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                              Close
                            </DrawerClose>
                          </DrawerFooter>
                        </DrawerContent>
                      </Drawer>

                      <Button onClick={() => handleFinalize(calc.id)} className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl font-semibold shadow-sm">
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Finalize Payout
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

