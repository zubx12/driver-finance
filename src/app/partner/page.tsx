'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { partnerService, CalculatedFinancials, MoMFinancials } from '@/services/partner-service';
import { Partner, PartnerVehicle, OwnershipArrangement } from '@/types/partner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Car, ChevronRight, TrendingUp, TrendingDown, Clock, Banknote, Wallet, Activity, CalendarDays, Radio } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { useRealtimePartner } from '@/lib/realtime/use-realtime-partner';
import { SalaryToast } from '@/components/partner/SalaryToast';

// Custom tooltip for Recharts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl shadow-xl">
        <p className="font-bold text-sm mb-2 text-zinc-800 dark:text-zinc-200">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-zinc-500">{entry.name}:</span>
            </div>
            <span className="font-semibold">SAR {entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Trend Indicator Component
const TrendIndicator = ({ value }: { value: number }) => {
  if (value === 0) return null;
  const isPositive = value > 0;
  const colorClass = isPositive ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10';
  const Icon = isPositive ? TrendingUp : TrendingDown;
  
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${colorClass}`}>
      <Icon className="h-3 w-3" />
      <span>{Math.abs(value).toFixed(1)}%</span>
    </div>
  );
};

export default function PartnerDashboard() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [vehicles, setVehicles] = useState<PartnerVehicle[]>([]);
  const [ownerships, setOwnerships] = useState<Record<string, OwnershipArrangement>>({});
  
  const [momFinancials, setMomFinancials] = useState<MoMFinancials | null>(null);
  const [vehicleFinancials, setVehicleFinancials] = useState<Record<string, CalculatedFinancials>>({});
  
  const [period, setPeriod] = useState('August 2026');
  const [isLoading, setIsLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Derive vehicleId list once vehicles are loaded for the realtime hook
  const vehicleIds = useMemo(() => vehicles.map(v => v.id), [vehicles]);
  const { vehicleFinancials: liveFinancials, salaryNotifications, isConnected, dismissSalaryNotification } =
    useRealtimePartner(vehicleIds);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const p = await partnerService.getCurrentPartner();
        setPartner(p);

        const v = await partnerService.getPartnerVehicles(p.id);
        setVehicles(v);

        const ownRecord: Record<string, OwnershipArrangement> = {};
        for (const vehicle of v) {
          const o = await partnerService.getOwnership(p.id, vehicle.id);
          if (o) ownRecord[vehicle.id] = o;
        }
        setOwnerships(ownRecord);

        // Load MoM Financials (now securely handles no vehicleId)
        const momData = await partnerService.getMoMFinancials(period);
        setMomFinancials(momData);

        // Calculate Partner's specific share by iterating over each vehicle
        const vFinRecord: Record<string, CalculatedFinancials> = {};
        
        for (const vehicle of v) {
          const vFin = await partnerService.getCalculatedFinancials(period, vehicle.id);
          vFinRecord[vehicle.id] = vFin;
        }
        setVehicleFinancials(vFinRecord);

      } catch (err) {
        console.error("Failed to load partner dashboard:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [period]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-48"></div>
            <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-32"></div>
          </div>
          <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-32 hidden md:block"></div>
        </div>
        <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"></div>
          <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  // Calculate my total share across all vehicles
  let myTotalShare = 0;
  vehicles.forEach(v => {
    const vFin = vehicleFinancials[v.id];
    const pct = ownerships[v.id]?.percentage || 0;
    if (vFin) {
      myTotalShare += vFin.netRevenue * (pct / 100);
    }
  });

  const fin = momFinancials?.current;
  const deltas = momFinancials?.deltas;

  // Prepare chart data
  const chartData = vehicles.map(v => {
    const vFin = vehicleFinancials[v.id];
    const pct = ownerships[v.id]?.percentage || 0;
    const netRev = vFin?.netRevenue || 0;
    const share = netRev * (pct / 100);
    
    return {
      name: `${v.make} ${v.model}`,
      'Net Revenue': netRev,
      'My Share': share,
    };
  });

  const periods = ['August 2026', 'July 2026', 'June 2026'];

  return (
    <>
    <SalaryToast notifications={salaryNotifications} onDismiss={dismissSalaryNotification} />
    <div className="pt-2 pb-24 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* HEADER SECTION - Hidden on mobile, shown on md+ */}
      <header className="hidden lg:flex flex-col md:flex-row md:justify-between md:items-end gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-500 dark:from-white dark:to-zinc-400">
            Partner Portfolio
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm flex items-center gap-2">
            {partner?.name}
            {isConnected && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-full">
                <Radio className="h-2 w-2 animate-pulse" />LIVE
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(val) => val && setPeriod(val as string)}>
            <SelectTrigger className="w-[150px] h-10 border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md rounded-xl text-sm font-medium shadow-sm hover:bg-white dark:hover:bg-zinc-900 transition-all">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* MOBILE PERIOD SELECTOR (Drawer) */}
      <div className="lg:hidden flex justify-between items-center px-1 animate-in fade-in">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Overview</h2>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm text-xs font-semibold gap-2 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            <CalendarDays className="h-3.5 w-3.5 text-indigo-500" />
            {period}
          </DrawerTrigger>
          <DrawerContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
            <DrawerHeader>
              <DrawerTitle className="text-zinc-900 dark:text-white">Select Financial Period</DrawerTitle>
              <DrawerDescription>View data for a specific month.</DrawerDescription>
            </DrawerHeader>
            <div className="p-4 space-y-2">
              {periods.map(p => (
                <Button 
                  key={p}
                  variant={p === period ? "default" : "outline"}
                  className={`w-full justify-start h-12 rounded-xl text-base ${p === period ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-0' : 'border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-700 dark:text-zinc-300'}`}
                  onClick={() => { setPeriod(p); setDrawerOpen(false); }}
                >
                  {p}
                </Button>
              ))}
            </div>
            <DrawerFooter>
              <DrawerClose className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 h-9 px-4 py-2 rounded-xl">
                Cancel
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>

      {/* MY EST SHARE (Hero Card - Moved to Top for Mobile First) */}
      <Card className="border-0 bg-gradient-to-r from-indigo-900 to-indigo-700 dark:from-indigo-950 dark:to-indigo-900 text-white shadow-xl shadow-indigo-900/20 relative overflow-hidden group animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-20 -mt-20 transition-transform group-hover:scale-110 duration-700"></div>
        <CardContent className="p-6 md:p-8 relative z-10 flex items-center justify-between h-full">
          <div>
            <div className="flex items-center gap-2 mb-2 text-indigo-200">
              <Banknote className="h-5 w-5" />
              <div className="text-xs font-semibold uppercase tracking-wider">Your Estimated Share</div>
            </div>
            <div className="text-4xl md:text-5xl font-extrabold tracking-tight">
              <span className="text-indigo-300 text-2xl font-medium mr-2">SAR</span>
              {myTotalShare.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI CARDS - 1 col on mobile, 2 col on tablet, 4 on desktop */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
        
        {/* TOTAL REVENUE */}
        <Card className="col-span-1 sm:col-span-2 lg:col-span-1 border-0 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/20 overflow-hidden relative group">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          <CardContent className="p-5 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="text-emerald-100 text-xs font-semibold uppercase tracking-wider">Total Revenue</div>
              <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
            </div>
            <div className="text-3xl font-bold mb-1">
              <span className="text-emerald-200 text-xl font-normal mr-1">SAR</span>
              {fin?.totalRevenue.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-white/20 px-2 py-0.5 rounded-md text-[10px] font-medium backdrop-blur-sm">
                {deltas?.totalRevenuePct! > 0 ? '+' : ''}{deltas?.totalRevenuePct.toFixed(1)}% MoM
              </div>
            </div>
            
            <div className="flex justify-between mt-5 pt-3 border-t border-white/20">
              <div>
                <div className="text-[10px] text-emerald-200 uppercase tracking-wide">Cash</div>
                <div className="font-semibold text-sm">SAR {fin?.cashRevenue.toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-emerald-200 uppercase tracking-wide">Voucher</div>
                <div className="font-semibold text-sm">SAR {fin?.voucherRevenue.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* EXPENSES */}
        <Card className="border border-zinc-200/50 dark:border-zinc-800/50 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-4">
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Total Expenses</div>
              <TrendingDown className="h-4 w-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
              SAR {fin?.totalExpenses.toLocaleString()}
            </div>
            <TrendIndicator value={deltas?.totalExpensesPct || 0} />
            <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Cash Paid</div>
              <div className="font-semibold text-sm">SAR {fin?.cashExpenses.toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>

        {/* NET REVENUE */}
        <Card className="border border-zinc-200/50 dark:border-zinc-800/50 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md shadow-sm hover:shadow-md transition-all">
          <CardContent className="p-5">
            <div className="flex justify-between items-start mb-4">
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Net Revenue</div>
              <Activity className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
              SAR {fin?.netRevenue.toLocaleString()}
            </div>
            <TrendIndicator value={deltas?.netRevenuePct || 0} />
            <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Profit Margin</div>
              <div className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">
                {fin?.totalRevenue ? Math.round((fin.netRevenue / fin.totalRevenue) * 100) : 0}%
              </div>
            </div>
          </CardContent>
        </Card>

        {/* OUTSTANDING METRICS */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-1 flex flex-col gap-4">
          <Card className="flex-1 border border-amber-200/50 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 backdrop-blur-md shadow-sm">
            <CardContent className="p-4 flex flex-col justify-center h-full">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wider">Driver Cash Out.</div>
              </div>
              <div className="text-xl font-bold text-amber-900 dark:text-amber-300">
                SAR {fin?.driverCashOutstanding.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          
          <Card className="flex-1 border border-amber-200/50 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 backdrop-blur-md shadow-sm">
            <CardContent className="p-4 flex flex-col justify-center h-full">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wider">Vouchers</div>
              </div>
              <div className="text-xl font-bold text-amber-900 dark:text-amber-300">
                SAR {fin?.voucherOutstanding.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* MY VEHICLES LIST (Horizontal Carousel on Mobile) */}
      <section className="space-y-4 pt-2 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">Vehicle Breakdown</h2>
          <Link href="/partner/vehicles" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">View All</Link>
        </div>
        
        {/* Horizontal scroll container */}
        <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 hide-scrollbar">
          {vehicles.map(v => {
            const vOwn = ownerships[v.id];
            const vFin = vehicleFinancials[v.id];
            const vShare = vFin ? (vFin.netRevenue * ((vOwn?.percentage || 0) / 100)) : 0;

            return (
              <Link key={v.id} href={`/partner/vehicles/${v.id}`} className="block group shrink-0 w-[85vw] sm:w-auto snap-center">
                <Card className="border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-300 h-full rounded-2xl">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-zinc-100 dark:bg-zinc-800 p-2.5 rounded-xl group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
                          <Car className="h-5 w-5 text-zinc-600 dark:text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                        </div>
                        <div>
                          <div className="font-bold text-zinc-900 dark:text-white text-sm">{v.make} {v.model}</div>
                          <div className="text-xs text-zinc-500 mt-0.5 font-mono">{v.plateNumber}</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-1 rounded-md border border-indigo-100 dark:border-indigo-800/50">
                        {vOwn?.percentage}%
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-end border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-4">
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">My Share</div>
                        <div className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">SAR {vShare.toLocaleString()}</div>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-full p-1.5 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
                        <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* GRAPHICAL VEHICLE PERFORMANCE */}
      <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
        <Card className="border border-zinc-200/50 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl shadow-sm overflow-hidden rounded-2xl">
          <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 p-4 md:p-5 bg-white/50 dark:bg-zinc-900/50">
            <CardTitle className="text-sm md:text-base font-semibold flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
              <Activity className="h-4 w-4 md:h-5 md:w-5 text-indigo-500" />
              Performance Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-6 md:p-6">
            <div className="h-[250px] md:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#71717a' }}
                    dy={10}
                    // Truncate on mobile by splitting or just rely on styling
                    tickFormatter={(value) => value.split(' ')[0]} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false}
                    tickFormatter={(value) => `${value / 1000}k`}
                    tick={{ fontSize: 10, fill: '#71717a' }}
                    dx={-10}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(161, 161, 170, 0.1)' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px' }} />
                  
                  <Bar dataKey="Net Revenue" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="My Share" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* PAYOUT HISTORY */}
      <section className="space-y-4 pt-2 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">Payout History</h2>
        </div>
        
        {/* Mobile List View (Hidden on md+) */}
        <div className="md:hidden space-y-3">
          {['July 2026', 'June 2026', 'May 2026'].map((period, i) => (
            <Card key={period} className="border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mb-1">{period}</div>
                  <div className="text-xs text-zinc-500">Net: SAR {i === 0 ? '14,500' : i === 1 ? '13,200' : '15,100'}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                    SAR {i === 0 ? '4,712.50' : i === 1 ? '4,290.00' : '4,907.50'}
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    Paid
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Desktop Table View (Hidden on mobile) */}
        <Card className="hidden md:block border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm overflow-x-auto rounded-2xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Period</th>
                <th className="px-6 py-4 font-semibold text-right">Net Amount</th>
                <th className="px-6 py-4 font-semibold text-right">Your Share</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap font-medium text-zinc-900 dark:text-zinc-100">July 2026</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-zinc-900 dark:text-zinc-100 font-medium">SAR 14,500.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-indigo-600 dark:text-indigo-400">SAR 4,712.50</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    Paid
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap font-medium text-zinc-900 dark:text-zinc-100">June 2026</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-zinc-900 dark:text-zinc-100 font-medium">SAR 13,200.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-indigo-600 dark:text-indigo-400">SAR 4,290.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    Paid
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap font-medium text-zinc-900 dark:text-zinc-100">May 2026</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-zinc-900 dark:text-zinc-100 font-medium">SAR 15,100.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-indigo-600 dark:text-indigo-400">SAR 4,907.50</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    Paid
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </section>

    </div>
    </>
  );
}
