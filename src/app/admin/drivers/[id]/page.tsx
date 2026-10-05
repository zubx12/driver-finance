'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AssignmentHistory } from '@/components/admin/AssignmentHistory';
import { DriverEmployment } from '@/components/admin/DriverEmployment';
import { DriverClearance } from '@/components/admin/DriverClearance';
import { DriverOverview } from '@/components/admin/DriverOverview';
import { DriverCashVouchers } from '@/components/admin/DriverCashVouchers';
import { DriverSettlementsPay } from '@/components/admin/DriverSettlementsPay';

const WORKSPACE_TABS = ['overview', 'rides', 'expenses', 'cash', 'pay', 'history'] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, Car, Receipt,
  ChevronDown, ImageIcon, Fuel, Wrench, FileText, Building, Download, Printer, AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { riyadhToday, monthOf } from '@/lib/dates';
import { getReceiptSignedUrl } from '@/lib/data/expenses';
import { driverStatementCsv, fetchDriverStatement } from '@/lib/data/reports';
import { downloadCsv } from '@/lib/csv';
import { createClient } from '@/lib/supabase/client';

// ── Types ──────────────────────────────────────────────────────────
interface Driver {
  id: string;
  driver_code: string;
  name: string;
  username: string | null;
  phone: string | null;
  status: string;
  vehicle_id: string | null;
  created_at: string | null;
  is_partner: boolean;
  last_activity: string | null;
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
  payer_id: string | null;
  reference: string | null;
  notes?: string | null;
  payers: { name: string } | null;
  vehicles: { plate_number: string } | null;
}

interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  description: string | null;
  receipt_image_url: string;
  paid_by: 'driver' | 'company' | 'office';
  payment_method: string;
  allocation: 'Vehicle' | 'Driver' | 'Company';
  review_status: 'unreviewed' | 'company_cost' | 'charged';
  vehicles: { plate_number: string } | null;
}

interface PartnerShareRow {
  id: string;
  percentage: number;
  effective_from: string;
  effective_to: string | null;
  partners: { name: string } | null;
}

interface PayTerms {
  compensation_type: 'commission' | 'fixed_salary';
  commission_percentage: number | null;
  fixed_salary_amount: number | null;
  bonus_rate: number | null;
  effective_from: string;
  effective_to: string | null;
}

const PAID_BY_LABEL: Record<Expense['paid_by'], string> = {
  driver: 'Paid by driver',
  company: 'Paid by company',
  office: 'Paid by office',
};

// get_driver_profile (database, office only): the page's data for one month.
interface DriverProfileData {
  driver: Driver;
  vehicle: (Vehicle & { since: string | null }) | null;
  vehiclePartners: PartnerShareRow[];
  driverCompensation: PayTerms | null;
  rides: Ride[];
  expenses: Expense[];
  balance: { carried_forward: number; period_start: string } | null;
}

async function fetchDriverProfile(id: string, month: string): Promise<DriverProfileData> {
  const { data, error } = await createClient().rpc('get_driver_profile', { p_driver_id: id, p_month: `${month}-01` });
  if (error) throw new Error(error.message);
  return data as DriverProfileData;
}

const fmtDay = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Riyadh' });

interface MonthOption {
  label: string;
  value: string;
  start: string;
  end: string;
}

// ── Helpers ────────────────────────────────────────────────────────
// Months in Riyadh time (not the computer's clock), newest first.
function getMonthOptions(count: number): MonthOption[] {
  const options: MonthOption[] = [];
  const [y, m] = riyadhToday().split('-').map(Number);
  for (let i = 0; i < count; i++) {
    const year = y + Math.floor((m - 1 - i) / 12);
    const month = (((m - 1 - i) % 12) + 12) % 12 + 1;
    const value = `${year}-${String(month).padStart(2, '0')}`;
    const { start, end } = monthOf(`${value}-01`);
    options.push({
      label: new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      value,
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
  // Tab and month come from the address (?tab=...&month=YYYY-MM), so links and Back work.
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const m = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('month');
    return monthOptions.find(o => o.value === m) ?? monthOptions[0];
  });
  const [tab, setTab] = useState<WorkspaceTab>(() => {
    const t = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('tab');
    return (WORKSPACE_TABS as readonly string[]).includes(t ?? '') ? (t as WorkspaceTab) : 'overview';
  });
  const syncAddress = (t: WorkspaceTab, m: string) =>
    window.history.replaceState(null, '', `${window.location.pathname}?tab=${t}&month=${m}`);
  const changeTab = (t: WorkspaceTab) => { setTab(t); syncAddress(t, selectedMonth.value); };
  const selectMonthValue = (value: string) => {
    const m = monthOptions.find(o => o.value === value);
    if (m) { setSelectedMonth(m); syncAddress(tab, m.value); }
  };

  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicle, setVehicle] = useState<DriverProfileData['vehicle']>(null);
  const [balance, setBalance] = useState<DriverProfileData['balance']>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vehiclePartners, setVehiclePartners] = useState<PartnerShareRow[]>([]);
  const [driverCompensation, setDriverCompensation] = useState<PayTerms | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [rides, setRides] = useState<Ride[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  // Driver profile + the selected month, from one admin-only database call.
  useEffect(() => {
    if (!id) return;
    async function loadInitial() {
      try {
        const data = await fetchDriverProfile(id, selectedMonth.value);
        setDriver(data.driver);
        setVehicle(data.vehicle);
        setBalance(data.balance);
        setVehiclePartners(data.vehiclePartners ?? []);
        setDriverCompensation(data.driverCompensation ?? null);
        setRides(data.rides ?? []);
        setExpenses(data.expenses ?? []);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'The driver could not be loaded.');
      }
      setLoading(false);
    }
    loadInitial();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadMonthData = useCallback(async (month: MonthOption) => {
    setDataLoading(true);
    try {
      const data = await fetchDriverProfile(id, month.value);
      // Owners and pay terms can differ from month to month.
      setVehiclePartners(data.vehiclePartners ?? []);
      setDriverCompensation(data.driverCompensation ?? null);
      setRides(data.rides ?? []);
      setExpenses(data.expenses ?? []);
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The month could not be loaded.');
    }
    setDataLoading(false);
  }, [id]);

  useEffect(() => {
    if (id && !loading) loadMonthData(selectedMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const outstandingRides = rides.filter(r => r.payment_status === 'Outstanding');
  const outstandingTotal = outstandingRides.reduce((s, r) => s + r.amount, 0);

  const openReceipt = async (path: string) => {
    setActionError(null);
    try {
      window.open(await getReceiptSignedUrl(path, 300), '_blank', 'noopener');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The receipt could not be opened.');
    }
  };

  // The driver's monthly statement (7F) for the selected month.
  const statementHref = `/admin/reports?tab=monthly&kind=driver&driver=${id}&month=${selectedMonth.value}`;
  const exportStatementCsv = async () => {
    if (!driver) return;
    setExporting(true); setActionError(null);
    try {
      const st = await fetchDriverStatement(id, selectedMonth.value);
      downloadCsv(`driver-statement-${driver.driver_code}-${selectedMonth.value}.csv`, driverStatementCsv(st, `${driver.name} (${driver.driver_code})`));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The statement could not be downloaded.');
    }
    setExporting(false);
  };

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
        <p className="text-zinc-500">{loadError ?? 'Driver not found.'}</p>
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
              <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">{driver.driver_code}</span>
              {driver.username ? ` · @${driver.username}` : ''}
              {driver.phone ? ` · ${driver.phone}` : ''}
              {' · '}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                driver.status === 'Active'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : driver.status === 'Leaving'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }`}>{driver.status}</span>
              {driver.is_partner && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">Also a partner</span>
              )}
            </p>
            <p className="text-xs text-zinc-500">
              {driver.last_activity ? `Last activity ${fmtDay(driver.last_activity)}` : 'No activity yet'}
              {driver.created_at && ` · account created ${fmtDay(driver.created_at)}`}
              {balance && Number(balance.carried_forward) !== 0 && (
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {' · '}{Number(balance.carried_forward) > 0
                    ? `owes the office SAR ${Number(balance.carried_forward).toFixed(2)}`
                    : `the office owes SAR ${(-Number(balance.carried_forward)).toFixed(2)}`}
                  {` (after ${new Date(`${balance.period_start}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })})`}
                </span>
              )}
            </p>
            <DriverEmployment driverId={id} status={driver.status} onChanged={() => window.location.reload()} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        {/* Monthly statement: print / PDF on the report page, or CSV here */}
        <Link href={statementHref}>
          <Button variant="outline" className="h-10 rounded-xl gap-2 text-sm"><Printer className="h-4 w-4" />Statement</Button>
        </Link>
        <Button variant="outline" disabled={exporting} onClick={exportStatementCsv} className="h-10 rounded-xl gap-2 text-sm">
          <Download className="h-4 w-4" />{exporting ? 'Preparing…' : 'CSV'}
        </Button>
        {/* Period Selector */}
        <div className="relative">
          <select
            value={selectedMonth.value}
            onChange={(e) => {
              selectMonthValue(e.target.value);
            }}
            className="appearance-none h-10 pl-4 pr-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {monthOptions.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        </div>
        </div>
      </header>

      {(driver.status === 'Leaving' || driver.status === 'Left') && (
        <DriverClearance driverId={id} onChanged={() => window.location.reload()} />
      )}

      {actionError && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800 rounded-xl flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{actionError}
        </div>
      )}

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
              {vehicle.since && <p className="text-xs text-zinc-500">Driving it since {fmtDay(vehicle.since)}</p>}
            </div>
            <div className="ml-auto">
              <Link href={`/admin/vehicles/${vehicle.id}/setup`}>
                <Button variant="outline" size="sm" className="text-xs">Vehicle Setup</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Partner Split + Commission */}
      {vehicle && (vehiclePartners.length > 0 || driverCompensation) && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {/* Partner Equity Split */}
          {vehiclePartners.length > 0 && (
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Partner Equity Split · {selectedMonth.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {vehiclePartners.map((vp, i) => {
                  const colors = ['bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500'];
                  const bgColors = ['bg-indigo-100 dark:bg-indigo-900/30', 'bg-rose-100 dark:bg-rose-900/30', 'bg-amber-100 dark:bg-amber-900/30', 'bg-emerald-100 dark:bg-emerald-900/30'];
                  return (
                    <div key={vp.id}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium">
                          {vp.partners?.name || 'Partner'}
                          {(vp.effective_from > selectedMonth.start || (vp.effective_to && vp.effective_to <= selectedMonth.end)) && (
                            <span className="text-xs font-normal text-zinc-500"> · {vp.effective_from > selectedMonth.start ? `from ${vp.effective_from}` : ''}{vp.effective_to && vp.effective_to <= selectedMonth.end ? ` until ${vp.effective_to}` : ''}</span>
                          )}
                        </span>
                        <span className="font-bold">{vp.percentage}%</span>
                      </div>
                      <div className={`h-2 rounded-full ${bgColors[i % bgColors.length]}`}>
                        <div className={`h-2 rounded-full ${colors[i % colors.length]} transition-all`} style={{ width: `${vp.percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Driver Compensation */}
          {driverCompensation && (
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Driver Compensation · {selectedMonth.label}</CardTitle>
              </CardHeader>
              <CardContent>
                {driverCompensation.compensation_type === 'commission' ? (
                  <div>
                    <p className="text-2xl font-bold text-indigo-600">{driverCompensation.commission_percentage}%</p>
                    <p className="text-xs text-zinc-500 mt-1">Commission on Net Revenue</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">SAR {Number(driverCompensation.fixed_salary_amount).toLocaleString()}</p>
                    <p className="text-xs text-zinc-500 mt-1">Fixed Monthly Salary</p>
                  </div>
                )}
                {Number(driverCompensation.bonus_rate) > 0 && (
                  <p className="text-xs text-amber-600 font-medium mt-2">+ {driverCompensation.bonus_rate}% Bonus</p>
                )}
                <p className="text-xs text-zinc-400 mt-2">
                  Since {driverCompensation.effective_from}{driverCompensation.effective_to ? `, until ${driverCompensation.effective_to}` : ''}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Workspace tabs (docs/agent-prompts/driver-profile-and-navigation.md, section 3) */}
      <nav aria-label="Driver" className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 print:hidden">
        {([
          ['overview', 'Overview'],
          ['rides', `Rides (${rides.length})`],
          ['expenses', `Expenses (${expenses.length})`],
          ['cash', 'Cash & vouchers'],
          ['pay', 'Settlements & pay'],
          ['history', 'History'],
        ] as [WorkspaceTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => changeTab(key)} aria-current={tab === key ? 'page' : undefined}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-6">
          <DriverOverview driverId={id} month={selectedMonth.value} onSelectMonth={selectMonthValue} />
        {/* Outstanding Breakdown by Payer — only shown when there are outstanding vouchers */}
        {outstandingRides.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-600" />
                Outstanding Vouchers ({outstandingRides.length} unpaid — SAR {outstandingTotal.toLocaleString()})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(() => {
                // Group outstanding rides by payer
                const groups: Record<string, { name: string; rides: typeof outstandingRides; total: number }> = {};
                for (const r of outstandingRides) {
                  const key = r.payer_id || 'unknown';
                  const name = r.payers?.name || 'Unknown Payer';
                  if (!groups[key]) groups[key] = { name, rides: [], total: 0 };
                  groups[key].rides.push(r);
                  groups[key].total += r.amount;
                }
                return Object.entries(groups).map(([payerId, group]) => (
                  <div key={payerId} className="mb-4 last:mb-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Building className="h-4 w-4 text-blue-600" />
                      <span className="font-semibold text-sm">{group.name}</span>
                      <span className="ml-auto font-bold text-amber-600">SAR {group.total.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1 pl-6">
                      {group.rides.map(r => (
                        <div key={r.id} className="flex items-center justify-between text-xs py-1.5 px-3 bg-white/60 dark:bg-zinc-900/30 rounded-md">
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {new Date(r.ride_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {r.reference ? ` · Ref: ${r.reference}` : ''}
                          </span>
                          <span className="font-semibold text-amber-600">SAR {r.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        )}
  
        </div>
      )}

      {(tab === 'rides' || tab === 'expenses') && (
        <Card className="border-zinc-200 dark:border-zinc-800">
  
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
                              <p className="text-xs text-zinc-400">
                                {[ride.vehicles?.plate_number, ride.payers?.name, ride.reference && `Ref ${ride.reference}`,
                                  ride.payment_method === 'Voucher' ? ride.payment_status : null].filter(Boolean).join(' · ')}
                              </p>
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
                                <p className="text-xs text-zinc-400">
                                  {PAID_BY_LABEL[expense.paid_by] ?? expense.paid_by}
                                  {' · '}
                                  {expense.allocation === 'Vehicle'
                                    ? (expense.vehicles?.plate_number ?? 'Vehicle')
                                    : `${expense.allocation} expense (${expense.review_status === 'unreviewed' ? 'to review' : expense.review_status === 'charged' ? 'charged to a vehicle' : 'company cost'})`}
                                </p>
                                {expense.description && <p className="text-xs text-zinc-400">{expense.description}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {expense.receipt_image_url && (
                                <Button variant="outline" size="sm" onClick={() => openReceipt(expense.receipt_image_url)}
                                  className="h-7 px-2 text-[10px] gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                                  <ImageIcon className="h-3 w-3" />Receipt
                                </Button>
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
  
      )}

      {tab === 'cash' && (
        <DriverCashVouchers driverId={id} month={selectedMonth.value} monthStart={selectedMonth.start} monthEnd={selectedMonth.end} />
      )}

      {tab === 'pay' && <DriverSettlementsPay driverId={id} />}

      {tab === 'history' && <AssignmentHistory driverId={id} />}
    </div>
  );
}
