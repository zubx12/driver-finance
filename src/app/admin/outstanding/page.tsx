'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, AlertTriangle, Building, Car, ChevronDown, ChevronRight } from 'lucide-react';

interface OutstandingRide {
  id: string;
  ride_date: string;
  amount: number;
  reference: string | null;
  payer_id: string | null;
  payer_name: string;
  driver_name: string;
  vehicle_plate: string;
  vehicle_make: string;
  vehicle_model: string;
}

interface PayerGroup {
  payer_id: string;
  payer_name: string;
  total: number;
  count: number;
  rides: OutstandingRide[];
}

interface VehicleGroup {
  vehicle_id: string;
  vehicle_plate: string;
  vehicle_name: string;
  total: number;
  count: number;
  driver_name: string;
}

export default function OutstandingPaymentsPage() {
  const [rides, setRides] = useState<OutstandingRide[]>([]);
  const [byPayer, setByPayer] = useState<PayerGroup[]>([]);
  const [byVehicle, setByVehicle] = useState<VehicleGroup[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedPayer, setExpandedPayer] = useState<string | null>(null);
  const [view, setView] = useState<'payer' | 'vehicle' | 'all'>('payer');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/outstanding');
    if (res.ok) {
      const data = await res.json();
      setRides(data.rides || []);
      setByPayer(data.byPayer || []);
      setByVehicle(data.byVehicle || []);
      setTotalOutstanding(data.total || 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markCollected = async (rideId: string) => {
    setUpdatingId(rideId);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('rides').update({
      payment_status: 'Collected',
      collected_by: user?.id,
      collected_by_name: 'Admin',
      collected_by_role: 'admin',
      collected_at: new Date().toISOString(),
    }).eq('id', rideId);
    // Remove from local state
    setRides(prev => prev.filter(r => r.id !== rideId));
    setByPayer(prev => prev.map(g => ({
      ...g,
      rides: g.rides.filter(r => r.id !== rideId),
      count: g.rides.filter(r => r.id !== rideId).length,
      total: g.rides.filter(r => r.id !== rideId).reduce((s, r) => s + r.amount, 0),
    })).filter(g => g.count > 0));
    setTotalOutstanding(prev => prev - (rides.find(r => r.id === rideId)?.amount || 0));
    setUpdatingId(null);
  };

  const markPayerCollected = async (payerGroup: PayerGroup) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    for (const ride of payerGroup.rides) {
      await supabase.from('rides').update({
        payment_status: 'Collected',
        collected_by: user?.id,
        collected_by_name: 'Admin',
        collected_by_role: 'admin',
        collected_at: new Date().toISOString(),
      }).eq('id', ride.id);
    }
    // Reload data
    load();
  };

  const overdueRides = rides.filter(r => {
    const daysDiff = Math.floor((Date.now() - new Date(r.ride_date).getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff > 30;
  });
  const overdueTotal = overdueRides.reduce((s, r) => s + r.amount, 0);

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Outstanding Payments</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Voucher rides pending collection — grouped by payer</p>
      </header>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Outstanding</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">SAR {totalOutstanding.toLocaleString()}</div>
            <p className="text-xs text-zinc-500 mt-1">{rides.length} voucher{rides.length !== 1 ? 's' : ''} · {byPayer.length} payer{byPayer.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card className={overdueTotal > 0 ? 'border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Overdue (&gt;30 days)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${overdueTotal > 0 ? 'text-rose-600' : 'text-zinc-400'}`}>
              SAR {overdueTotal.toLocaleString()}
            </div>
            <p className="text-xs text-zinc-500 mt-1">{overdueRides.length} overdue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Vehicles with Outstanding</CardTitle>
            <Car className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{byVehicle.length}</div>
            <p className="text-xs text-zinc-500 mt-1">vehicle{byVehicle.length !== 1 ? 's' : ''} with unpaid vouchers</p>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle */}
      <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit">
        {(['payer', 'vehicle', 'all'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize ${
              view === v ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'
            }`}>
            {v === 'payer' ? 'By Payer' : v === 'vehicle' ? 'By Vehicle' : 'All Vouchers'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : rides.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-zinc-400">
            <CheckCircle className="h-10 w-10 mx-auto mb-3 text-emerald-400" />
            <p className="font-medium text-lg">All Clear!</p>
            <p className="text-sm mt-1">No outstanding voucher payments</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* BY PAYER VIEW */}
          {view === 'payer' && (
            <div className="space-y-3">
              {byPayer.map(group => {
                const isExpanded = expandedPayer === group.payer_id;
                return (
                  <Card key={group.payer_id} className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <button
                      onClick={() => setExpandedPayer(isExpanded ? null : group.payer_id)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <Building className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-base">{group.payer_name}</p>
                          <p className="text-xs text-zinc-500">{group.count} voucher{group.count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-amber-600">SAR {group.total.toLocaleString()}</span>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-zinc-100 dark:border-zinc-800">
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {group.rides.map(ride => {
                            const daysDiff = Math.floor((Date.now() - new Date(ride.ride_date).getTime()) / (1000 * 60 * 60 * 24));
                            return (
                              <div key={ride.id} className="flex items-center justify-between px-6 py-3 pl-16 hover:bg-zinc-50/30 dark:hover:bg-zinc-900/20">
                                <div>
                                  <p className="text-sm font-medium">{ride.driver_name}</p>
                                  <p className="text-xs text-zinc-500">
                                    {formatDate(ride.ride_date)} · {ride.vehicle_plate}
                                    {ride.reference ? ` · Ref: ${ride.reference}` : ''}
                                    {daysDiff > 30 && <span className="ml-1 text-rose-500 font-medium">({daysDiff}d overdue)</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-amber-600">SAR {ride.amount.toLocaleString()}</span>
                                  <Button variant="outline" size="sm"
                                    className="h-7 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                    disabled={updatingId === ride.id}
                                    onClick={(e) => { e.stopPropagation(); markCollected(ride.id); }}>
                                    <CheckCircle className="h-3 w-3" />
                                    {updatingId === ride.id ? '...' : 'Collected'}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="px-6 py-3 bg-zinc-50/50 dark:bg-zinc-900/20 border-t border-zinc-100 dark:border-zinc-800">
                          <Button variant="outline" size="sm"
                            className="text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => markPayerCollected(group)}>
                            <CheckCircle className="h-3 w-3" />
                            Mark All {group.count} Collected
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* BY VEHICLE VIEW */}
          {view === 'vehicle' && (
            <div className="space-y-3">
              {byVehicle.map(group => (
                <Card key={group.vehicle_id} className="border-zinc-200 dark:border-zinc-800">
                  <CardContent className="flex items-center justify-between p-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <Car className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-semibold">{group.vehicle_name}</p>
                        <p className="text-xs text-zinc-500">{group.vehicle_plate} · Driver: {group.driver_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-amber-600">SAR {group.total.toLocaleString()}</p>
                      <p className="text-xs text-zinc-500">{group.count} voucher{group.count !== 1 ? 's' : ''}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ALL VOUCHERS VIEW */}
          {view === 'all' && (
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50">
                      <tr>
                        <th className="px-6 py-3 font-medium">Date</th>
                        <th className="px-6 py-3 font-medium">Driver</th>
                        <th className="px-6 py-3 font-medium">Payer</th>
                        <th className="px-6 py-3 font-medium">Vehicle</th>
                        <th className="px-6 py-3 font-medium">Ref</th>
                        <th className="px-6 py-3 font-medium">Amount</th>
                        <th className="px-6 py-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {rides.map(ride => (
                        <tr key={ride.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">{formatDate(ride.ride_date)}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium">{ride.driver_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-blue-600 font-medium">{ride.payer_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-zinc-500 font-mono text-xs">{ride.vehicle_plate}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-zinc-500">{ride.reference || '—'}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-amber-600">SAR {ride.amount.toLocaleString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <Button variant="outline" size="sm"
                              className="h-7 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                              disabled={updatingId === ride.id}
                              onClick={() => markCollected(ride.id)}>
                              <CheckCircle className="h-3 w-3" />
                              {updatingId === ride.id ? '...' : 'Collected'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
