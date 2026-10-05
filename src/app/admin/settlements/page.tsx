'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wallet, CheckCircle2, Search, Clock, FileText, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { payPartnerSettlement, previewPartnerSettlement, type SettlementPreview } from '@/lib/data/partnerVouchers';
import { PartnerVoucherList } from '@/components/PartnerVoucherList';

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
  cash_amount: number | null;
  voucher_amount: number | null;
  payment_method: 'cash' | 'bank_transfer' | null;
  vouchers_kept_by_office: boolean;
}

const PAGE_SIZE = 50;

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Payment drawer state
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [payMethod, setPayMethod] = useState<'cash' | 'bank_transfer'>('bank_transfer');
  // Uncollected vouchers handed to the partner as part of the share (7E).
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  const loadSettlements = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const offset = (page - 1) * PAGE_SIZE;

    let query = supabase
      .from('partner_settlement_view')
      .select('*', { count: 'exact' })
      .order('period_start', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (debouncedSearch) {
      query = query.or(`partner_name.ilike.%${debouncedSearch}%,vehicle_name.ilike.%${debouncedSearch}%,payment_reference.ilike.%${debouncedSearch}%`);
    }

    const { data, error, count } = await query;
    if (!error && data) {
      setSettlements(data);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => { loadSettlements(); }, [loadSettlements]);

  const handlePayClick = (s: Settlement) => {
    setSelectedSettlement(s);
    setPayRef('');
    setPayNotes('');
    setPayMethod('bank_transfer');
    setPreview(null);
    setPreviewError(null);
    setPayDrawerOpen(true);
    previewPartnerSettlement(s.id)
      .then(setPreview)
      .catch(e => setPreviewError((e as Error).message));
  };

  const submitPayment = async () => {
    if (!selectedSettlement) return;
    if (!payRef.trim()) {
      alert('Payment Reference is required.');
      return;
    }

    if (!preview) return;

    setIsPaying(true);
    try {
      const keepVouchers = preview.vouchers_exceed_share;
      const split = await payPartnerSettlement({
        settlementId: selectedSettlement.id,
        method: payMethod,
        reference: payRef,
        notes: payNotes,
        keepVouchers,
      });

      // Update local state
      setSettlements(prev => prev.map(s => s.id === selectedSettlement.id ? {
        ...s,
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_reference: payRef,
        notes: payNotes,
        payment_method: payMethod,
        cash_amount: split.cash_amount,
        voucher_amount: split.voucher_amount,
        vouchers_kept_by_office: keepVouchers,
      } : s));

      setPayDrawerOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsPaying(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Search is now server-side — no client-side filtering needed
  const pending = settlements.filter(s => s.status === 'pending');
  const paid = settlements.filter(s => s.status === 'paid');
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
            {s.cash_amount != null && (
              <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Cash SAR {fmt(Number(s.cash_amount))}{s.payment_method === 'bank_transfer' ? ' (bank transfer)' : ''}
                {Number(s.voucher_amount) > 0 && <> · Vouchers SAR {fmt(Number(s.voucher_amount))}</>}
                {s.vouchers_kept_by_office && <> · vouchers kept by the office</>}
              </div>
            )}
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
        <TabsList className="grid w-full grid-cols-3 mb-6 h-12 items-center rounded-xl p-1 bg-zinc-100/50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
          <TabsTrigger value="pending" className="rounded-lg h-9 data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800">
            Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="paid" className="rounded-lg h-9 data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800">
            Paid History ({paid.length})
          </TabsTrigger>
          <TabsTrigger value="vouchers" className="rounded-lg h-9 data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800">
            Vouchers
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

        <TabsContent value="vouchers" className="mt-0">
          <PartnerVoucherList mode="office" />
        </TabsContent>
      </Tabs>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Page {page} of {totalPages} · {totalCount.toLocaleString()} total
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

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

                {previewError ? (
                  <div className="text-sm text-red-600">{previewError}</div>
                ) : !preview ? (
                  <div className="text-sm text-zinc-500">Checking uncollected vouchers…</div>
                ) : preview.vouchers_exceed_share ? (
                  <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-xl p-3">
                    The partner&apos;s part of the uncollected vouchers (SAR {fmt(preview.voucher_amount)}) is more than the share,
                    so the office keeps the vouchers and pays the full SAR {fmt(preview.amount)} in cash.
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-zinc-500">Pay in cash / transfer</span><span className="font-bold">SAR {fmt(preview.cash_amount)}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Vouchers handed to the partner</span><span className="font-bold">SAR {fmt(preview.voucher_amount)}</span></div>
                    {preview.vouchers.length > 0 && (
                      <ul className="pt-2 mt-1 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5 max-h-40 overflow-y-auto">
                        {preview.vouchers.map(v => (
                          <li key={v.ride_id} className="flex justify-between gap-2">
                            <span>{v.ride_date} · {v.payer ?? 'Voucher'}{v.reference ? ` · ${v.reference}` : ''} · {fmt(v.ride_amount)} × {v.percentage}%</span>
                            <span className="font-mono">{fmt(v.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Paid by</label>
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value as 'cash' | 'bank_transfer')}
                      className="h-9 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-sm">
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
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
                  <Button onClick={submitPayment} disabled={isPaying || !payRef.trim() || !preview} className="flex-1 rounded-xl bg-zinc-900 text-white">
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