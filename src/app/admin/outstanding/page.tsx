'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

interface OutstandingRide {
  id: string;
  ride_date: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  reference: string | null;
  driver_name: string;
  vehicle_plate: string;
}

export default function OutstandingPaymentsPage() {
  const [rides, setRides] = useState<OutstandingRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('rides')
      .select('id, ride_date, amount, payment_method, payment_status, reference, drivers(name), vehicles(plate_number)')
      .eq('payment_status', 'Outstanding')
      .order('ride_date', { ascending: true });

    if (data) {
      setRides(data.map((r: any) => ({
        id: r.id,
        ride_date: r.ride_date,
        amount: r.amount,
        payment_method: r.payment_method,
        payment_status: r.payment_status,
        reference: r.reference,
        driver_name: r.drivers?.name ?? 'Unknown',
        vehicle_plate: r.vehicles?.plate_number ?? '',
      })));
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
    setRides(prev => prev.filter(r => r.id !== rideId));
    setUpdatingId(null);
  };

  const totalOutstanding = rides.reduce((s, r) => s + r.amount, 0);
  const oldRides = rides.filter(r => {
    const daysDiff = Math.floor((Date.now() - new Date(r.ride_date).getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff > 30;
  });
  const overdueTotal = oldRides.reduce((s, r) => s + r.amount, 0);

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Outstanding Payments</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Voucher rides pending collection from payers</p>
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
            <p className="text-xs text-zinc-500 mt-1">{rides.length} voucher{rides.length !== 1 ? 's' : ''}</p>
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
            <p className="text-xs text-zinc-500 mt-1">{oldRides.length} overdue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Recent (&lt;30 days)</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              SAR {(totalOutstanding - overdueTotal).toLocaleString()}
            </div>
            <p className="text-xs text-zinc-500 mt-1">{rides.length - oldRides.length} voucher{rides.length - oldRides.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding Vouchers List */}
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle>Outstanding Vouchers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Driver</th>
                    <th className="px-6 py-3 font-medium">Vehicle</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Age</th>
                    <th className="px-6 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {rides.map(ride => {
                    const daysDiff = Math.floor((Date.now() - new Date(ride.ride_date).getTime()) / (1000 * 60 * 60 * 24));
                    const isOverdue = daysDiff > 30;
                    return (
                      <tr key={ride.id} className={`transition-colors ${isOverdue ? 'bg-rose-50/50 dark:bg-rose-950/10' : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30'}`}>
                        <td className="px-6 py-4 whitespace-nowrap">{formatDate(ride.ride_date)}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{ride.driver_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-zinc-500 font-mono text-xs">{ride.vehicle_plate}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-zinc-500">{ride.reference || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-bold text-amber-600">SAR {ride.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            isOverdue
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {daysDiff}d
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            disabled={updatingId === ride.id}
                            onClick={() => markCollected(ride.id)}
                          >
                            <CheckCircle className="h-3 w-3" />
                            {updatingId === ride.id ? 'Updating...' : 'Mark Collected'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
