'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wallet, CheckCircle2, Search, Clock, FileText, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Settlement {
  id: string;
  partner_id: string;
  partner_name: string;
  amount: number;
  status: 'pending' | 'paid';
  paid_at: string | null;
  payment_reference: string | null;
  notes: string | null;
  period_start: string;
  period_end: string;
  vehicle_name: string;
  plate_number: string;
  ownership_percentage: number;
}

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Payment drawer state
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    loadSettlements();
  }, []);

  async function loadSettlements() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('partner_settlement_view')
      .select('*')
      .order('period_start', { ascending: false });

    if (!error && data) {
      setSettlements(data);
    }
    setLoading(false);
  }

  const handlePayClick = (s: Settlement) => {
    setSelectedSettlement(s);
    setPayRef('');
    setPayNotes('');
    setPayDrawerOpen(true);
  };

  const submitPayment = async () => {
    if (!selectedSettlement) return;
    if (!payRef.trim()) {
      alert('Payment Reference is required.');
      return;
    }

    setIsPaying(true);
    try {
      const res = await fetch('/api/admin/pay-settlement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settlementId: selectedSettlement.id,
          paymentReference: payRef,
          notes: payNotes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Update local state
      setSettlements(prev => prev.map(s => s.id === selectedSettlement.id ? { 
        ...s, 
        status: 'paid', 
        paid_at: new Date().toISOString(), 
        payment_reference: payRef, 
        notes: payNotes 
      } : s));
      
      setPayDrawerOpen(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsPaying(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const filtered = settlements.filter(s => 
    (s.partner_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (s.vehicle_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (s.payment_reference?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const pending = filtered.filter(s => s.status === 'pending');
  const paid = filtered.filter(s => s.status === 'paid');

  const renderCard = (s: Settlement, isPending: boolean) => (
    <Card key={s.id} className="border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col h-full">
      <CardHeader className={`px-4 py-3 ${isPending ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'bg-emerald-50/50 dark:bg-emerald-950/20'} border-b border-zinc-100 dark:border-zinc-800`}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">{s.period_start} to {s.period_end}</div>
            <CardTitle className="text-base">{s.partner_name || 'Unknown Partner'}</CardTitle>
            <CardDescription className="text-xs flex items-center gap-1 mt-0.5">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{s.vehicle_name}</span> 
              <span className="text-zinc-400">({s.plate_number})</span>
            </CardDescription>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${isPending ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-500'}`}>
              SAR {fmt(s.amount)}
            </div>
            <div className="text-xs font-medium text-zinc-500">{s.ownership_percentage}% Share</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 flex-1 flex flex-col justify-end">
        {!isPending && s.payment_reference && (
          <div className="bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg mb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Payment Reference</div>
            <div className="font-mono text-sm break-all">{s.payment_reference}</div>
            {s.paid_at && <div className="text-xs text-zinc-500 mt-1">Paid on: {new Date(s.paid_at).toLocaleDateString()}</div>}
            {s.notes && <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 italic">"{s.notes}"</div>}
          </div>
        )}
        
        {isPending ? (
          <Button onClick={() => handlePayClick(s)} className="w-full mt-2 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm">
            <Wallet className="h-4 w-4 mr-2" /> Mark as Paid
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-500 mt-2 py-2 border border-emerald-100 dark:border-emerald-900/50 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20">
            <CheckCircle2 className="h-4 w-4" /> Paid
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Partner Settlements</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage and record payouts to partners.</p>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input 
          placeholder="Search partners, vehicles, or payment refs..." 
          className="pl-9 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 h-12 items-center rounded-xl p-1 bg-zinc-100/50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
          <TabsTrigger value="pending" className="rounded-lg h-9 data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800">
            Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="paid" className="rounded-lg h-9 data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800">
            Paid History ({paid.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="pending" className="mt-0">
          {loading ? (
            <div className="text-center py-12 text-zinc-500">Loading settlements...</div>
          ) : pending.length === 0 ? (
            <div className="text-center py-16 px-4 border border-dashed rounded-2xl border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-semibold mb-1">All Caught Up</h3>
              <p className="text-sm text-zinc-500">No pending payouts waiting.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pending.map(s => renderCard(s, true))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="paid" className="mt-0">
          {loading ? (
            <div className="text-center py-12 text-zinc-500">Loading history...</div>
          ) : paid.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">No paid settlements found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paid.map(s => renderCard(s, false))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Payment Drawer */}
      <Drawer open={payDrawerOpen} onOpenChange={setPayDrawerOpen}>
        <DrawerContent className="bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto w-full max-w-md pb-6 pt-4 px-4">
            <DrawerHeader className="px-0 pt-0 text-left">
              <DrawerTitle>Record Payout</DrawerTitle>
              <DrawerDescription>
                Mark this settlement as paid for {selectedSettlement?.partner_name}.
              </DrawerDescription>
            </DrawerHeader>
            
            {selectedSettlement && (
              <div className="space-y-6">
                <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-zinc-500">Total Amount</span>
                    <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">SAR {fmt(selectedSettlement.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">Period</span>
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{selectedSettlement.period_start} to {selectedSettlement.period_end}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Payment Reference <span className="text-rose-500">*</span></label>
                    <Input 
                      placeholder="e.g., Bank Transfer ID, Check Number" 
                      value={payRef} 
                      onChange={e => setPayRef(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Notes <span className="text-zinc-400 font-normal">(Optional)</span></label>
                    <Input 
                      placeholder="Any internal notes about this payment..." 
                      value={payNotes} 
                      onChange={e => setPayNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <DrawerClose className="flex-1">
                    <Button variant="outline" className="w-full rounded-xl">Cancel</Button>
                  </DrawerClose>
                  <Button onClick={submitPayment} disabled={isPaying || !payRef.trim()} className="flex-1 rounded-xl bg-zinc-900 text-white">
                    {isPaying ? 'Saving...' : 'Confirm Paid'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}