'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface OutstandingRide {
  id: string;
  ride_date: string;
  amount: number;
  reference: string | null;
  driver_name: string;
  vehicle_plate: string;
  vehicle_make: string;
  vehicle_model: string;
}

export default function PartnerOutstandingPage() {
  const [rides, setRides] = useState<OutstandingRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();

    // Get partner's vehicles
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: partner } = await supabase
      .from('partners')
      .select('id')
      .eq('linked_auth_id', user.id)
      .single();

    if (!partner) { setLoading(false); return; }

    const { data: vps } = await supabase
      .from('vehicle_partners')
      .select('vehicle_id')
      .eq('partner_id', partner.id);

    if (!vps || vps.length === 0) { setLoading(false); return; }

    const vehicleIds = vps.map(v => v.vehicle_id);

    const { data } = await supabase
      .from('rides')
      .select('id, ride_date, amount, reference, drivers(name), vehicles(plate_number, make, model)')
      .in('vehicle_id', vehicleIds)
      .eq('payment_status', 'Outstanding')
      .order('ride_date', { ascending: true });

    if (data) {
      setRides(data.map((r: any) => ({
        id: r.id,
        ride_date: r.ride_date,
        amount: r.amount,
        reference: r.reference,
        driver_name: r.drivers?.name ?? 'Unknown',
        vehicle_plate: r.vehicles?.plate_number ?? '',
        vehicle_make: r.vehicles?.make ?? '',
        vehicle_model: r.vehicles?.model ?? '',
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markCollected = async (rideId: string) => {
    setUpdatingId(rideId);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Get partner name
    const { data: partner } = await supabase
      .from('partners')
      .select('name')
      .eq('linked_auth_id', user?.id ?? '')
      .single();

    await supabase.from('rides').update({
      payment_status: 'Collected',
      collected_by: user?.id,
      collected_by_name: partner?.name || 'Partner',
      collected_by_role: 'partner',
      collected_at: new Date().toISOString(),
    }).eq('id', rideId);

    setRides(prev => prev.filter(r => r.id !== rideId));
    setUpdatingId(null);
  };

  const totalOutstanding = rides.reduce((s, r) => s + r.amount, 0);

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Outstanding Payments</h1>
        <p className="text-zinc-500">Voucher rides pending collection for your vehicles</p>
      </header>

      {/* Summary */}
      <Card className={totalOutstanding > 0 ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20' : ''}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Outstanding</CardTitle>
          <Clock className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className={`text-3xl font-bold ${totalOutstanding > 0 ? 'text-amber-600' : 'text-zinc-400'}`}>
            SAR {totalOutstanding.toLocaleString()}
          </div>
          <p className="text-xs text-zinc-500 mt-1">{rides.length} unpaid voucher{rides.length !== 1 ? 's' : ''}</p>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>Unpaid Vouchers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : rides.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <CheckCircle className="h-10 w-10 mx-auto mb-3 text-emerald-400" />
              <p className="font-medium text-lg">All Clear!</p>
              <p className="text-sm mt-1">No outstanding voucher payments</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rides.map(ride => {
                const daysDiff = Math.floor((Date.now() - new Date(ride.ride_date).getTime()) / (1000 * 60 * 60 * 24));
                const isOverdue = daysDiff > 30;
                return (
                  <div key={ride.id} className={`flex items-center justify-between px-6 py-4 ${isOverdue ? 'bg-rose-50/50 dark:bg-rose-950/10' : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30'} transition-colors`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{ride.driver_name}</p>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-600'
                        }`}>
                          {daysDiff}d ago
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {ride.vehicle_make} {ride.vehicle_model} · {ride.vehicle_plate} · {formatDate(ride.ride_date)}
                        {ride.reference ? ` · Ref: ${ride.reference}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <span className="font-bold text-amber-600 whitespace-nowrap">SAR {ride.amount.toLocaleString()}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 whitespace-nowrap"
                        disabled={updatingId === ride.id}
                        onClick={() => markCollected(ride.id)}
                      >
                        <CheckCircle className="h-3 w-3" />
                        {updatingId === ride.id ? '...' : 'Collected'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
