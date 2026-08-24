"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

const mockChartData = [
  { name: "Mon", revenue: 4000, expenses: 2400 },
  { name: "Tue", revenue: 3000, expenses: 1398 },
  { name: "Wed", revenue: 2000, expenses: 9800 },
  { name: "Thu", revenue: 2780, expenses: 3908 },
  { name: "Fri", revenue: 1890, expenses: 4800 },
  { name: "Sat", revenue: 2390, expenses: 3800 },
  { name: "Sun", revenue: 3490, expenses: 4300 },
];

export function RevenueChart() {
  return (
    <div className="h-[300px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={mockChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 12 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 12 }} />
          <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
          <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
          <Area type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
