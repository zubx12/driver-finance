'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Car, DollarSign, Activity, FileText } from 'lucide-react';
import Link from 'next/link';

export default function DriverDetailPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [driver, setDriver] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [stats, setStats] = useState({ revenue: 0, expenses: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const supabase = createClient();
      
      const { data: dData } = await supabase.from('drivers').select('*').eq('id', id).single();
      if (dData) {
        setDriver(dData);
        if (dData.vehicle_id) {
          const { data: vData } = await supabase.from('vehicles').select('*').eq('id', dData.vehicle_id).single();
          setVehicle(vData);
        }
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sinceDate = thirtyDaysAgo.toISOString().split('T')[0];

      const [ridesRes, expensesRes] = await Promise.all([
        supabase.from('rides').select('*').eq('driver_id', id).gte('ride_date', sinceDate).order('ride_date', { ascending: false }),
        supabase.from('expenses').select('*').eq('driver_id', id).gte('expense_date', sinceDate).order('expense_date', { ascending: false })
      ]);

      const rides = ridesRes.data || [];
      const expenses = expensesRes.data || [];

      const rStats = rides.reduce((acc, r) => acc + r.amount, 0);
      const eStats = expenses.reduce((acc, e) => acc + e.amount, 0);
      setStats({ revenue: rStats, expenses: eStats });

      const mappedRides = rides.map(r => ({ id: r.id, type: 'Ride', date: r.ride_date, amount: r.amount, detail: r.payment_method }));
      const mappedExpenses = expenses.map(e => ({ id: e.id, type: 'Expense', date: e.expense_date, amount: e.amount, detail: e.category }));
      
      const combined = [...mappedRides, ...mappedExpenses].sort((a, b) => b.date.localeCompare(a.date));
      setRecentEntries(combined.slice(0, 50));
      
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading driver details...</div>;
  if (!driver) return <div className="p-8 text-center text-zinc-500">Driver not found.</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{driver.name}</h1>
          <p className="text-zinc-500">{driver.phone || driver.username} &middot; Status: {driver.status}</p>
        </div>
        <Link href="/admin">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Assigned Vehicle</CardTitle>
            <Car className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {vehicle ? (
              <>
                <div className="text-xl font-bold">{vehicle.make} {vehicle.model}</div>
                <p className="text-xs text-zinc-500">Plate: {vehicle.plate_number}</p>
              </>
            ) : (
              <div className="text-sm text-zinc-500">No vehicle assigned</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">30-Day Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">SAR {stats.revenue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">30-Day Expenses</CardTitle>
            <Activity className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">SAR {stats.expenses.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEntries.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">No activity in the last 30 days.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium">Detail</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {recentEntries.map((entry, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4 whitespace-nowrap">{entry.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">
                        <span className={entry.type === 'Ride' ? 'text-emerald-600' : 'text-rose-600'}>
                          {entry.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-zinc-600">{entry.detail}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-bold">
                        SAR {entry.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}