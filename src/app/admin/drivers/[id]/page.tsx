'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose, DrawerTrigger } from '@/components/ui/drawer';
import { 
  ChevronLeft, Car, DollarSign, TrendingDown, TrendingUp, Receipt,
  ChevronDown, ImageIcon, Fuel, Wrench, FileText
} from 'lucide-react';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────
interface Driver {
  id: string;
  name: string;
  username: string | null;
  phone: string | null;
  status: string;
  vehicle_id: string | null;
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  plate_number: string;
  year: number | null;
}

interface Ride {
  id: string;
  ride_date: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  notes: string | null;
}

interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  description: string | null;
  receipt_image_url: string;
}

interface MonthOption {
  label: string;
  value: string;
  start: string;
  end: string;
}

// ── Helpers ────────────────────────────────────────────────────────
function getMonthOptions(count: number): MonthOption[] {
  const options: MonthOption[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    options.push({
      label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      value: `${year}-${String(month + 1).padStart(2, '0')}`,
      start,
      end,
    });
  }
  return options;
}

function groupByDate<T extends { date: string }>(items: T[]): [string, T[]][] {
  const map: Record<string, T[]> = {};
  for (const item of items) {
    if (!map[item.date]) map[item.date] = [];
    map[item.date].push(item);
  }
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

const categoryIcons: Record<string, typeof Fuel> = {
  fuel: Fuel, maintenance: Wrench, other: FileText,
};

// ── Component ──────────────────────────────────────────────────────
export default function DriverDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const monthOptions = getMonthOptions(12);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);
  const [tab, setTab] = useState<'rides' | 'expenses'>('rides');

  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function loadProfile() {
      const supabase = createClient();
      const { data: dData } = await supabase.from('drivers').select('*').eq('id', id).single();
      if (dData) {
        setDriver(dData);
        if (dData.vehicle_id) {
          const { data: vData } = await supabase.from('vehicles').select('*').eq('id', dData.vehicle_id).single();
          setVehicle(vData);
        }
      }
      setLoading(false);
    }
    loadProfile();
  }, [id]);

  const loadMonthData = useCallback(async (month: MonthOption) => {
    setDataLoading(true);
    const supabase = createClient();
    const [ridesRes, expensesRes] = await Promise.all([
      supabase.from('rides').select('id, ride_date, amount, payment_method, payment_status, notes')
        .eq('driver_id', id).gte('ride_date', month.start).lte('ride_date', month.end)
        .order('ride_date', { ascending: false }),
      supabase.from('expenses').select('id, expense_date, amount, category, description, receipt_image_url')
        .eq('driver_id', id).gte('expense_date', month.start).lte('expense_date', month.end)
        .order('expense_date', { ascending: false }),
    ]);
    setRides(ridesRes.data || []);
    setExpenses(expensesRes.data || []);
    setDataLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) loadMonthData(selectedMonth);
  }, [id, selectedMonth, loadMonthData]);

  const totalRevenue = rides.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netRevenue = totalRevenue - totalExpenses;
  const cashTotal = rides.filter(r => r.payment_method === 'Cash').reduce((s, r) => s + r.amount, 0);
  const voucherTotal = rides.filter(r => r.payment_method === 'Voucher').reduce((s, r) => s + r.amount, 0);
  const outstandingRides = rides.filter(r => r.payment_status === 'Outstanding');
  const outstandingTotal = outstandingRides.reduce((s, r) => s + r.amount, 0);

  const rideItems = rides.map(r => ({ ...r, date: r.ride_date }));
  const expenseItems = expenses.map(e => ({ ...e, date: e.expense_date }));

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center">
        <p className="text-zinc-500">Driver not found.</p>
        <Link href="/admin/drivers"><Button variant="outline" className="mt-4">Back to Drivers</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/drivers">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{driver.name}</h1>
            <p className="text-zinc-500 text-sm">
              {driver.username ? `@${driver.username}` : ''}
              {driver.phone ? ` · ${driver.phone}` : ''}
              {' · '}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                driver.status === 'Active'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-zinc-100 text-zinc-600'
              }`}>{driver.status}</span>
            </p>
          </div>
        </div>

        {/* Period Selector */}
        <div className="relative">
          <select
            value={selectedMonth.value}
            onChange={(e) => {
              const m = monthOptions.find(o => o.value === e.target.value);
              if (m) setSelectedMonth(m);
            }}
            className="appearance-none h-10 pl-4 pr-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {monthOptions.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        </div>
      </header>

      {/* Vehicle Card */}
      {vehicle && (
        <Card className="border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/20 dark:to-zinc-950">
          <CardContent className="py-4 px-6 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
              <Car className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-bold text-lg">{vehicle.make} {vehicle.model}</p>
              <p className="text-sm text-zinc-500 font-mono">{vehicle.plate_number}{vehicle.year ? ` · ${vehicle.year}` : ''}</p>
            </div>
            <div className="ml-auto">
              <Link href={`/admin/vehicles/${vehicle.id}/setup`}>
                <Button variant="outline" size="sm" className="text-xs">Vehicle Setup</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">SAR {totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-zinc-500 mt-1">{rides.length} ride{rides.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">SAR {totalExpenses.toLocaleString()}</div>
            <p className="text-xs text-zinc-500 mt-1">{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Net Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netRevenue >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
              SAR {netRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-zinc-500 mt-1">{selectedMonth.label}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Cash / Voucher</CardTitle>
            <Receipt className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-emerald-600">Cash {cashTotal.toLocaleString()}</div>
            <div className="text-lg font-bold text-blue-600 mt-0.5">Voucher {voucherTotal.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className={outstandingTotal > 0 ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Outstanding</CardTitle>
            <FileText className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${outstandingTotal > 0 ? 'text-amber-600' : 'text-zinc-400'}`}>
              SAR {outstandingTotal.toLocaleString()}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {outstandingRides.length} unpaid voucher{outstandingRides.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Rides / Expenses */}
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="pb-0 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex gap-1">
            <button onClick={() => setTab('rides')}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${
                tab === 'rides' ? 'bg-white dark:bg-zinc-950 text-indigo-600 border-b-2 border-indigo-600' : 'text-zinc-500 hover:text-zinc-700'
              }`}>
              Rides ({rides.length})
            </button>
            <button onClick={() => setTab('expenses')}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${
                tab === 'expenses' ? 'bg-white dark:bg-zinc-950 text-indigo-600 border-b-2 border-indigo-600' : 'text-zinc-500 hover:text-zinc-700'
              }`}>
              Expenses ({expenses.length})
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {dataLoading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : tab === 'rides' ? (
            rides.length === 0 ? (
              <div className="text-center py-12 text-zinc-400">
                <Car className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="font-medium">No rides in {selectedMonth.label}</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {groupByDate(rideItems).map(([date, dayRides]) => (
                  <div key={date}>
                    <div className="flex justify-between items-center px-6 py-3 bg-zinc-50 dark:bg-zinc-900/50">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{formatDate(date)}</span>
                      <span className="text-xs font-bold text-emerald-600">
                        SAR {dayRides.reduce((s, r) => s + r.amount, 0).toLocaleString()} · {dayRides.length} ride{dayRides.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    {dayRides.map(ride => (
                      <div key={ride.id} className="flex items-center justify-between px-6 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                            ride.payment_method === 'Cash'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}>
                            {ride.payment_method === 'Cash' ? 'C' : 'V'}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{ride.payment_method} Ride</p>
                            {ride.notes && <p className="text-xs text-zinc-400">{ride.notes}</p>}
                          </div>
                        </div>
                        <span className="font-bold text-emerald-600">SAR {ride.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          ) : (
            expenses.length === 0 ? (
              <div className="text-center py-12 text-zinc-400">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="font-medium">No expenses in {selectedMonth.label}</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {groupByDate(expenseItems).map(([date, dayExpenses]) => (
                  <div key={date}>
                    <div className="flex justify-between items-center px-6 py-3 bg-zinc-50 dark:bg-zinc-900/50">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{formatDate(date)}</span>
                      <span className="text-xs font-bold text-rose-600">
                        SAR {dayExpenses.reduce((s, e) => s + e.amount, 0).toLocaleString()} · {dayExpenses.length} expense{dayExpenses.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    {dayExpenses.map(expense => {
                      const CatIcon = categoryIcons[expense.category?.toLowerCase()] ?? FileText;
                      return (
                        <div key={expense.id} className="flex items-center justify-between px-6 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                              <CatIcon className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium capitalize">{expense.category}</p>
                              {expense.description && <p className="text-xs text-zinc-400">{expense.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {expense.receipt_image_url && (
                              <Drawer>
                                <DrawerTrigger>
                                  <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                                    <ImageIcon className="h-3 w-3" />Receipt
                                  </Button>
                                </DrawerTrigger>
                                <DrawerContent className="max-h-[90vh]">
                                  <DrawerHeader>
                                    <DrawerTitle>Receipt — {expense.category} · SAR {expense.amount.toLocaleString()}</DrawerTitle>
                                  </DrawerHeader>
                                  <div className="p-4 overflow-auto flex justify-center">
                                    <img src={expense.receipt_image_url} alt="Receipt" className="max-w-full h-auto object-contain rounded-md border" style={{ maxHeight: '60vh' }} />
                                  </div>
                                  <DrawerFooter>
                                    <DrawerClose>
                                      <Button variant="outline">Close</Button>
                                    </DrawerClose>
                                  </DrawerFooter>
                                </DrawerContent>
                              </Drawer>
                            )}
                            <span className="font-bold text-rose-600">SAR {expense.amount.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}