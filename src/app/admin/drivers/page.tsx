import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, MoreHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';

import Link from 'next/link';

const MOCK_DRIVERS = [
  { id: 'DRV-1001', name: 'Ahmed Al-Farsi', vehicle: 'Toyota Camry 2023', todayRev: 450, status: 'Active' },
  { id: 'DRV-1002', name: 'Omar Hassan', vehicle: 'Hyundai Sonata 2022', todayRev: 320, status: 'Active' },
  { id: 'DRV-1003', name: 'Khalid Saqer', vehicle: 'Ford Taurus 2024', todayRev: 0, status: 'Off-Duty' },
  { id: 'DRV-1004', name: 'Fahad Mohammed', vehicle: 'Toyota Camry 2023', todayRev: 890, status: 'Active' },
];

export default function DriversList() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Drivers</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Manage all registered drivers.</p>
        </div>
        <Link href="/admin/drivers/add">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm w-full sm:w-auto">
            Add New Driver
          </Button>
        </Link>
      </header>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="py-4 px-6 border-b dark:border-zinc-800">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input placeholder="Search drivers..." className="pl-9 bg-zinc-50 dark:bg-zinc-900/50" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50 dark:text-zinc-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Driver ID</th>
                  <th className="px-6 py-4 font-medium">Name</th>
                  <th className="px-6 py-4 font-medium">Assigned Vehicle</th>
                  <th className="px-6 py-4 font-medium">Today's Revenue</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {MOCK_DRIVERS.map((driver) => (
                  <tr key={driver.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{driver.id}</td>
                    <td className="px-6 py-4">{driver.name}</td>
                    <td className="px-6 py-4 text-zinc-500">{driver.vehicle}</td>
                    <td className="px-6 py-4 font-medium text-emerald-600 dark:text-emerald-400">{driver.todayRev} SAR</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        driver.status === 'Active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {driver.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
