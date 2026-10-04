'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SyncStatus } from '@/lib/db/dexie';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Car, Receipt, Clock, CheckCircle2, Wallet, Building, Circle, Flag, PencilLine, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CorrectionRequestModal } from '@/components/driver/CorrectionRequestModal';
import { SkeletonCard, EmptyState } from '@/components/ui/skeleton-card';
import { createClient } from '@/lib/supabase/client';
import { retryEntry, discardEntry } from '@/lib/data/syncQueue';
import { runSync } from '@/lib/sync/sync-engine';

/** Local ids equal server ids; older app versions prefixed loaded entries with srv-. */
const serverId = (id: string) => id.replace(/^srv-/, '');

/** Upload state of one entry, with the server's reason and actions when it was rejected. */
function SyncBadge({ kind, entry }: {
  kind: 'ride' | 'expense';
  entry: { id: string; syncStatus: SyncStatus; lastError?: string };
}) {
  if (entry.syncStatus === 'synced') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Uploaded
      </span>
    );
  }
  if (entry.syncStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-amber-600" title={entry.lastError}>
        <Clock className="h-3 w-3" /> {entry.lastError ? 'Waiting to retry' : 'Waiting to upload'}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end gap-1 text-rose-600">
      <span className="inline-flex items-center gap-1 font-semibold">
        <AlertCircle className="h-3 w-3" /> Not accepted
      </span>
      {entry.lastError && <span className="max-w-[16rem] text-right normal-case">{entry.lastError}</span>}
      <span className="flex gap-3">
        <button
          className="underline"
          onClick={async () => { await retryEntry(kind, entry.id); runSync(true); }}
        >
          Retry
        </button>
        <button
          className="underline"
          onClick={async () => {
            if (confirm('Discard this entry? It has not been saved on the server and will be deleted from this phone.')) {
              await discardEntry(kind, entry.id);
            }
          }}
        >
          Discard
        </button>
      </span>
    </span>
  );
}

function groupByDate<T extends { date: string }>(items: T[]): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const key = item.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export default function DriverHistoryPage() {
  const [rideFilter, setRideFilter] = useState<'ALL' | 'CASH' | 'VOUCHER'>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('All Time');
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<{
    type: 'ride' | 'expense';
    id: string;
    date: string;
    amount: number;
  } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');

  const handleEditStart = (item: { id: string; amount: number }) => {
    setEditingId(item.id);
    setEditAmount(String(item.amount));
  };

  // Same-day edit. Synced entries are changed on the server first (the
  // database only allows today's entries); entries still on the phone are
  // changed locally and upload with the new amount.
  const handleEditSave = async (type: 'ride' | 'expense') => {
    if (!editingId) return;
    const id = editingId;
    const newAmount = parseFloat(editAmount);
    setEditingId(null);
    if (isNaN(newAmount) || newAmount <= 0) return;

    const rec = type === 'ride' ? await db.rides.get(id) : await db.expenses.get(id);
    if (!rec || rec.amount === newAmount) return;

    if (rec.syncStatus === 'synced') {
      const { data, error } = await createClient()
        .from(type === 'ride' ? 'rides' : 'expenses')
        .update({ amount: newAmount, updated_at: new Date().toISOString() })
        .eq('id', serverId(id))
        .select('id');
      if (error || !data?.length) {
        alert(error?.message ?? 'This entry can no longer be changed from the app. Use Flag to ask the office for a correction.');
        return;
      }
    }

    if (type === 'ride') await db.rides.update(id, { amount: newAmount });
    else await db.expenses.update(id, { amount: newAmount });
  };

  // Mark a voucher ride as collected by this driver
  const markVoucherCollected = async (rideId: string) => {
    setCollectingId(rideId);
    try {
      // Synced records: the server is the source of truth, so update it first.
      // collect_voucher only changes the collection fields (see migration 20260930000001).
      // Rides still on the phone upload as collected.
      const ride = await db.rides.get(rideId);
      if (ride?.syncStatus === 'synced') {
        const { error } = await createClient().rpc('collect_voucher', { p_ride_id: serverId(rideId) });
        if (error) throw new Error(error.message);
      }
      await db.rides.update(rideId, { paymentStatus: 'Collected' });
    } catch (err) {
      console.error('Failed to mark as collected:', err);
      alert(`Could not mark voucher as collected: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    setCollectingId(null);
  };

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

  
  const allRides = useLiveQuery(() => db.rides.orderBy('createdAt').reverse().toArray(), []);
  const allExpenses = useLiveQuery(() => db.expenses.orderBy('createdAt').reverse().toArray(), []);
  const payers = useLiveQuery(() => db.payers.toArray(), []);

  const filterByDate = (date: string) => {
    if (dateFilter === 'All Time') return true;
    
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
    const itemDateObj = new Date(date);
    const todayObj = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
    
    switch (dateFilter) {
      case 'Today': return date === todayStr;
      case 'This Week':
        const weekAgo = new Date(todayObj.getTime() - 7 * 24 * 60 * 60 * 1000);
        return itemDateObj >= weekAgo;
      case 'This Month':
        const monthAgo = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);
        return itemDateObj >= monthAgo;
      default: return true;
    }
  };

  const filteredRides = allRides
    ?.filter(r => rideFilter === 'ALL' || r.revenueType === rideFilter)
    ?.filter(r => filterByDate(r.date));

  const filteredExpenses = allExpenses?.filter(e => filterByDate(e.date));

  const getPayerName = (id?: string) => {
    if (!id || !payers) return null;
    return payers.find(p => p.id === id)?.name;
  };

  if (!allRides || !allExpenses) {
    return <div className="p-4 space-y-3">{Array.from({length:4}).map((_,i) => <SkeletonCard key={i} />)}</div>;
  }

  return (
    <>
      {correctionTarget && (
        <CorrectionRequestModal
          recordType={correctionTarget.type}
          recordId={correctionTarget.id}
          recordDate={correctionTarget.date}
          recordAmount={correctionTarget.amount}
          onClose={() => setCorrectionTarget(null)}
        />
      )}
    <div className="p-4 space-y-6 pb-24">
      <header className="pt-4 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        
        <div className="flex gap-2">
          <Select value={dateFilter} onValueChange={(val) => val && setDateFilter(val as string)}>
            <SelectTrigger className="w-full bg-white dark:bg-zinc-900">
              <SelectValue placeholder="Date Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Today">Today</SelectItem>
              <SelectItem value="This Week">This Week</SelectItem>
              <SelectItem value="This Month">This Month</SelectItem>
              <SelectItem value="All Time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <Tabs defaultValue="rides" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rides">Rides</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        
        <TabsContent value="rides" className="space-y-4 mt-4">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            <button
              onClick={() => setRideFilter('ALL')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${rideFilter === 'ALL' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
            >
              All
            </button>
            <button
              onClick={() => setRideFilter('CASH')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${rideFilter === 'CASH' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
            >
              Cash
            </button>
            <button
              onClick={() => setRideFilter('VOUCHER')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${rideFilter === 'VOUCHER' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
            >
              Voucher
            </button>
          </div>

          {filteredRides?.length === 0 ? (
            <EmptyState icon={Car} title="No rides yet" description="Your logged rides will appear here." />
          ) : (
            Object.entries(groupByDate(filteredRides ?? [])).map(([date, rides]) => (
              <div key={date} className="space-y-2">
                <div className="flex justify-between items-center px-1 py-2 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-xs font-bold text-emerald-600">SAR {rides.reduce((s, r) => s + r.amount, 0).toLocaleString()}</span>
                </div>
                {rides.map(ride => (
                  <Card key={ride.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {ride.revenueType === 'CASH' ? (
                            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                              <Wallet className="h-4 w-4" />
                            </div>
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                              <Building className="h-4 w-4" />
                            </div>
                          )}
                          <div>
                            {editingId === ride.id ? (
                              <input
                                type="number"
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                                onBlur={() => handleEditSave('ride')}
                                onKeyDown={(e) => e.key === 'Enter' && handleEditSave('ride')}
                                className="w-24 px-1 py-0.5 text-sm font-semibold border rounded dark:bg-zinc-800 dark:border-zinc-700"
                                autoFocus
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <p className="font-semibold">{ride.amount.toFixed(2)} SAR</p>
                                {ride.date === todayStr && ride.syncStatus !== 'failed' && (
                                  <button onClick={() => handleEditStart(ride)} className="p-1 text-zinc-400 hover:text-indigo-600">
                                    <PencilLine className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                            <p className="text-[10px] text-zinc-500 font-medium tracking-wider uppercase">
                              {ride.date} • {ride.time || new Date(ride.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className={`text-xs font-bold px-2 py-1 rounded-md ${
                            ride.revenueType === 'CASH' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {ride.revenueType}
                          </div>
                        </div>
                      </div>
                      
                      {ride.revenueType === 'VOUCHER' && ride.payerId && (
                        <div className="text-xs text-zinc-600 bg-zinc-50 p-2 rounded-md">
                          Payer: <span className="font-semibold">{getPayerName(ride.payerId)}</span>
                          {ride.voucherReference && <span className="ml-2 text-zinc-400">({ride.voucherReference})</span>}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs pt-2 border-t">
                        <div className="flex items-center gap-1 font-medium">
                          {ride.paymentStatus === 'Received' ? (
                            <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-emerald-600">Received</span></>
                          ) : ride.paymentStatus === 'Collected' ? (
                            <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-emerald-600">Payment Collected</span></>
                          ) : (
                            <><Circle className="h-4 w-4 text-amber-500" /><span className="text-amber-600">Awaiting Payment</span></>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-zinc-400">
                          {/* Mark Collected button for outstanding voucher rides */}
                          {ride.revenueType === 'VOUCHER' && ride.paymentStatus === 'Outstanding' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px] gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                              disabled={collectingId === ride.id}
                              onClick={() => markVoucherCollected(ride.id)}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {collectingId === ride.id ? '...' : 'Mark Collected'}
                            </Button>
                          )}
                          {ride.date !== todayStr && ride.syncStatus === 'synced' && (
                            <button
                              onClick={() => setCorrectionTarget({ type: 'ride', id: serverId(ride.id), date: ride.date, amount: ride.amount })}
                              className="flex items-center gap-0.5 text-amber-500 hover:text-amber-600 font-medium"
                            >
                              <Flag className="h-3 w-3" /> Flag
                            </button>
                          )}
                          <SyncBadge kind="ride" entry={ride} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))
          )}
        </TabsContent>
        
        <TabsContent value="expenses" className="space-y-4 mt-4">
          {filteredExpenses?.length === 0 ? (
            <EmptyState icon={Receipt} title="No expenses yet" description="Your logged expenses will appear here." />
          ) : (
            Object.entries(groupByDate(filteredExpenses ?? [])).map(([date, exps]) => (
              <div key={date} className="space-y-2">
                <div className="flex justify-between items-center px-1 py-2 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-xs font-bold text-emerald-600">SAR {exps.reduce((s, r) => s + r.amount, 0).toLocaleString()}</span>
                </div>
                {exps.map(exp => (
                  <Card key={exp.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                            <Receipt className="h-5 w-5" />
                          </div>
                          <div>
                            {editingId === exp.id ? (
                              <input
                                type="number"
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                                onBlur={() => handleEditSave('expense')}
                                onKeyDown={(e) => e.key === 'Enter' && handleEditSave('expense')}
                                className="w-24 px-1 py-0.5 text-sm font-semibold border rounded dark:bg-zinc-800 dark:border-zinc-700"
                                autoFocus
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-lg">{exp.amount.toFixed(2)} SAR</p>
                                {exp.date === todayStr && exp.syncStatus !== 'failed' && (
                                  <button onClick={() => handleEditStart(exp)} className="p-1 text-zinc-400 hover:text-indigo-600">
                                    <PencilLine className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-zinc-500 capitalize">{exp.category}</p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-xs font-medium bg-zinc-100 px-2 py-1 rounded">
                            {exp.paymentSource}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t">
                         <span>{exp.date} • {new Date(exp.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                         <div className="flex items-center gap-2">
                           {exp.date !== todayStr && exp.syncStatus === 'synced' && (
                             <button
                               onClick={() => setCorrectionTarget({ type: 'expense', id: serverId(exp.id), date: exp.date, amount: exp.amount })}
                               className="flex items-center gap-0.5 text-amber-500 hover:text-amber-600 font-medium"
                             >
                               <Flag className="h-3 w-3" /> Flag
                             </button>
                           )}
                           <SyncBadge kind="expense" entry={exp} />
                         </div>
                       </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}
