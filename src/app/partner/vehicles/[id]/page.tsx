'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { partnerService, CalculatedFinancials } from '@/services/partner-service';
import { Partner, PartnerVehicle, OwnershipArrangement } from '@/types/partner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { ChevronLeft, Car, Users, TrendingUp, TrendingDown, Receipt, Image as ImageIcon, MapPin, Fuel, Wrench, Banknote } from 'lucide-react';
import Image from 'next/image';

type ExpenseWithDriver = { id: string; date: string; vehicleId: string; driverId: string; amount: number; category: string; paymentMethod: string; description?: string; receiptUrl?: string; driverName: string; };

export default function VehicleDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const vehicleId = params.id as string;

  const [partner, setPartner] = useState<Partner | null>(null);
  const [vehicle, setVehicle] = useState<PartnerVehicle | null>(null);
  const [myOwnership, setMyOwnership] = useState<OwnershipArrangement | null>(null);
  const [allPartners, setAllPartners] = useState<OwnershipArrangement[]>([]);
  const [financials, setFinancials] = useState<CalculatedFinancials | null>(null);
  const [expenses, setExpenses] = useState<ExpenseWithDriver[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [receiptDrawerOpen, setReceiptDrawerOpen] = useState(false);

  // New state for Log Cash to Driver
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentReason, setPaymentReason] = useState<string>('Cash Advance');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const handleLogPayment = async () => {
    if (!selectedDriverId || !paymentAmount || isNaN(Number(paymentAmount))) return;
    setIsSubmittingPayment(true);
    await partnerService.logCashToDriver(vehicleId, selectedDriverId, Number(paymentAmount), paymentReason);
    
    // Refresh financials
    const vFin = await partnerService.getCalculatedFinancials('August 2026', vehicleId);
    setFinancials(vFin);
    
    setIsSubmittingPayment(false);
    setPaymentDrawerOpen(false);
    setPaymentAmount('');
    setSelectedDriverId('');
  };

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const p = await partnerService.getCurrentPartner();
      setPartner(p);

      const vehicles = await partnerService.getPartnerVehicles(p.id);
      const v = vehicles.find(vec => vec.id === vehicleId);
      
      if (!v) {
        setIsLoading(false);
        return;
      }
      setVehicle(v);

      const o = await partnerService.getOwnership(p.id, v.id);
      setMyOwnership(o);

      const partners = await partnerService.getVehiclePartners(v.id);
      setAllPartners(partners);

      const vFin = await partnerService.getCalculatedFinancials('August 2026', v.id);
      setFinancials(vFin);

      // Load expenses with driver names
      const vExp = await partnerService.getVehicleExpenses(v.id, 'August 2026');
      setExpenses(vExp);

      setIsLoading(false);
    }
    loadData();
  }, [vehicleId]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4 animate-pulse max-w-3xl mx-auto">
        <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/4 mb-6"></div>
        <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-xl mb-4"></div>
        <div className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
        <div className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="p-8 text-center space-y-4 max-w-3xl mx-auto">
        <h2 className="text-xl font-bold">Vehicle Not Found</h2>
        <p className="text-zinc-500">You do not have authorization to view this vehicle.</p>
        <Button onClick={() => router.back()} variant="outline">Go Back</Button>
      </div>
    );
  }

  const vNet = financials?.netRevenue || 0;
  const myShare = vNet * ((myOwnership?.percentage || 0) / 100);
  const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];

  // Determine active drivers from expenses (unique drivers)
  const activeDrivers = Array.from(new Set(expenses.map(e => e.driverName)));

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24 max-w-3xl mx-auto">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{vehicle.make} {vehicle.model}</h1>
          <p className="text-sm text-zinc-500 font-mono">{vehicle.plateNumber}</p>
        </div>
      </header>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 h-12 bg-zinc-100 dark:bg-zinc-900 rounded-xl p-1">
          <TabsTrigger value="overview" className="rounded-lg text-sm font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:shadow-sm">Overview</TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-lg text-sm font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:shadow-sm">Daily Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 animate-in fade-in">
          {/* PERFORMANCE */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">August 2026 Performance</h2>
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-emerald-200/50 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50 shadow-sm rounded-2xl">
                <CardHeader className="p-4 pb-1 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-medium text-emerald-800 dark:text-emerald-400">Revenue</CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-600 opacity-50" />
                </CardHeader>
                <CardContent className="p-4 pt-0 mt-1">
                  <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                    SAR {financials?.totalRevenue.toLocaleString() || '0'}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-rose-200/50 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/50 shadow-sm rounded-2xl">
                <CardHeader className="p-4 pb-1 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-medium text-rose-800 dark:text-rose-400">Expenses</CardTitle>
                  <TrendingDown className="h-4 w-4 text-rose-600 opacity-50" />
                </CardHeader>
                <CardContent className="p-4 pt-0 mt-1">
                  <div className="text-xl font-bold text-rose-700 dark:text-rose-300">
                    SAR {financials?.totalExpenses.toLocaleString() || '0'}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-200 dark:border-zinc-800 col-span-2 shadow-sm rounded-2xl bg-white dark:bg-zinc-900">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Net Revenue</div>
                    <div className="text-2xl font-bold mt-1 text-zinc-900 dark:text-white">SAR {vNet.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">My Share ({myOwnership?.percentage}%)</div>
                    <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">SAR {myShare.toLocaleString()}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* OWNERSHIP */}
          <section className="space-y-3 pt-2">
            <div className="flex justify-between items-end">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Ownership Distribution</h2>
            </div>
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-2xl">
              <CardContent className="p-5 space-y-6">
                <div className="h-4 w-full rounded-full overflow-hidden flex">
                  {allPartners.map((p, idx) => (
                    <div 
                      key={p.partnerId} 
                      className={`h-full ${p.partnerId === partner?.id ? 'bg-indigo-600' : colors[idx % colors.length]}`}
                      style={{ width: `${p.percentage}%` }}
                    />
                  ))}
                </div>
                <div className="space-y-4">
                  {allPartners.map((p, idx) => {
                    const isMe = p.partnerId === partner?.id;
                    const partnerName = isMe ? partner?.name : `Partner ${p.partnerId.replace('PTR-', '')}`;
                    const dotColor = isMe ? 'bg-indigo-600' : colors[idx % colors.length];
                    const partnerShareValue = vNet * (p.percentage / 100);
                    
                    return (
                      <div key={p.partnerId} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-3 w-3 rounded-full ${dotColor}`}></div>
                          <div className="text-sm font-medium flex items-center gap-2">
                            {partnerName}
                            {isMe && <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 px-1.5 py-0.5 rounded-md">YOU</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm text-zinc-900 dark:text-white">SAR {partnerShareValue.toLocaleString()}</div>
                          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{p.percentage}% Share</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* DRIVERS & VEHICLE INFO */}
          <section className="space-y-3 pt-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Details & Assignment</h2>
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-2xl">
              <CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800">
                <div className="p-4 flex justify-between items-center">
                  <span className="text-sm text-zinc-500">Active Drivers</span>
                  <div className="text-sm font-medium text-zinc-900 dark:text-white flex flex-col items-end">
                    {activeDrivers.length > 0 ? activeDrivers.map(d => <span key={d}>{d}</span>) : <span>No active drivers</span>}
                  </div>
                </div>
                <div className="p-4 flex justify-between">
                  <span className="text-sm text-zinc-500">Status</span>
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{vehicle.status}</span>
                </div>
                <div className="p-4 flex justify-between">
                  <span className="text-sm text-zinc-500">Year</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{vehicle.year}</span>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-b-2xl">
                  <Drawer open={paymentDrawerOpen} onOpenChange={setPaymentDrawerOpen}>
                    <DrawerTrigger className="w-full inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 bg-indigo-600 text-white shadow hover:bg-indigo-700 h-10 px-4 py-2 rounded-xl">
                      <Banknote className="h-4 w-4" />
                      Log Cash to Driver
                    </DrawerTrigger>
                    <DrawerContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                      <DrawerHeader>
                        <DrawerTitle>Log Cash Given to Driver</DrawerTitle>
                        <DrawerDescription>Record out-of-pocket cash advances or salary payments.</DrawerDescription>
                      </DrawerHeader>
                      <div className="p-4 space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Select Driver</label>
                          <select 
                            className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                            value={selectedDriverId}
                            onChange={(e) => setSelectedDriverId(e.target.value)}
                          >
                            <option value="">-- Choose Driver --</option>
                            <option value="DRV-1">Ahmed Hassan</option>
                            <option value="DRV-2">Mohammed Ali</option>
                            <option value="DRV-3">Omar Saeed</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Amount (SAR)</label>
                          <input 
                            type="number" 
                            className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" 
                            placeholder="e.g. 500"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Reason</label>
                          <select 
                            className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                            value={paymentReason}
                            onChange={(e) => setPaymentReason(e.target.value)}
                          >
                            <option value="Cash Advance">Cash Advance</option>
                            <option value="Salary Payment">Salary Payment</option>
                            <option value="Expense Reimbursement">Expense Reimbursement</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                      <DrawerFooter className="flex-row gap-2">
                        <button 
                          onClick={handleLogPayment}
                          disabled={isSubmittingPayment || !selectedDriverId || !paymentAmount}
                          className="flex-1 inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors bg-indigo-600 text-white shadow hover:bg-indigo-700 h-10 px-4 py-2 rounded-xl disabled:opacity-50"
                        >
                          {isSubmittingPayment ? 'Saving...' : 'Submit Payment'}
                        </button>
                        <DrawerClose className="flex-1 inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 h-10 px-4 py-2 rounded-xl">
                          Cancel
                        </DrawerClose>
                      </DrawerFooter>
                    </DrawerContent>
                  </Drawer>
                </div>
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="expenses" className="animate-in fade-in">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Expense Log (Aug 2026)</h2>
              <div className="text-xs font-semibold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md">
                {expenses.length} Records
              </div>
            </div>

            {expenses.length === 0 ? (
              <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <Receipt className="h-8 w-8 text-zinc-400 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">No expenses recorded for this period.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <Card key={expense.id} className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-2xl overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex gap-3">
                          <div className={`p-2 rounded-xl h-max ${expense.category === 'Fuel' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-500'}`}>
                            {expense.category === 'Fuel' ? <Fuel className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                              {expense.category}
                            </div>
                            <div className="text-xs text-zinc-500 mt-0.5">{expense.description || 'No description provided'}</div>
                            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-zinc-500 font-medium">
                              <Users className="h-3 w-3" />
                              {expense.driverName}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-rose-600 dark:text-rose-400 text-base">SAR {expense.amount.toLocaleString()}</div>
                          <div className="text-[10px] text-zinc-500 mt-1">{expense.date}</div>
                        </div>
                      </div>
                      
                      {/* Receipt Action */}
                      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 mt-1 flex justify-between items-center">
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-md uppercase tracking-wider ${expense.paymentMethod === 'Cash' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                          Paid via {expense.paymentMethod}
                        </span>
                        
                        {expense.receiptUrl ? (
                          <Drawer open={receiptDrawerOpen && selectedReceipt === expense.receiptUrl} onOpenChange={(open) => {
                            if (open) {
                              setSelectedReceipt(expense.receiptUrl!);
                              setReceiptDrawerOpen(true);
                            } else {
                              setReceiptDrawerOpen(false);
                            }
                          }}>
                            <DrawerTrigger className="inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                              <ImageIcon className="h-3 w-3" />
                              View Receipt
                            </DrawerTrigger>
                            <DrawerContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 h-[85vh]">
                              <DrawerHeader>
                                <DrawerTitle>Receipt Proof</DrawerTitle>
                                <DrawerDescription>{expense.category} - SAR {expense.amount} by {expense.driverName}</DrawerDescription>
                              </DrawerHeader>
                              <div className="flex-1 overflow-auto p-4 flex justify-center items-center">
                                {selectedReceipt && (
                                  <div className="relative w-full max-w-sm rounded-xl overflow-hidden shadow-md">
                                    {/* Using standard img tag for mock external unsplash URL without configuring next.config.js domains */}
                                    <img src={selectedReceipt} alt="Receipt" className="w-full h-auto object-cover" />
                                  </div>
                                )}
                              </div>
                              <DrawerFooter>
                                <DrawerClose className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 rounded-xl h-12 px-4 py-2">
                                  Close
                                </DrawerClose>
                              </DrawerFooter>
                            </DrawerContent>
                          </Drawer>
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">No receipt provided</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
