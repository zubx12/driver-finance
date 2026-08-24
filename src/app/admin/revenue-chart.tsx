'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartPoint { date: string; revenue: number; expenses: number; }

export function RevenueChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-zinc-500" />
        <YAxis tick={{ fontSize: 11 }} className="text-zinc-500" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
        <Tooltip formatter={(value: any) => `SAR ${Number(value).toLocaleString('en-SA')}`} />
        <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#colorRevenue)" name="Revenue" />
        <Area type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} fill="url(#colorExpenses)" name="Expenses" />
      </AreaChart>
    </ResponsiveContainer>
  );
}