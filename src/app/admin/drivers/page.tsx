'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Search, MoreHorizontal, Car, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react';

interface Driver {
  id: string;
  name: string;
  username: string | null;
  status: string;
  vehicle_id: string | null;
  vehicles: { make: string; model: string; plate_number: string } | null;
}

const PAGE_LIMIT = 50;

export default function DriversList() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch drivers when page or debounced search changes
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    if (debouncedSearch) params.set('search', debouncedSearch);

    fetch(`/api/admin/drivers-list-full?${params}`)
      .then(r => r.json())
      .then((res) => {
        setDrivers(res.data ?? []);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Drivers</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Manage all registered drivers. · {total} total</p>
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
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drivers..." className="pl-9 bg-zinc-50 dark:bg-zinc-900/50" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50 dark:text-zinc-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Name</th>
                  <th className="px-6 py-4 font-medium">Username</th>
                  <th className="px-6 py-4 font-medium">Assigned Vehicle</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {loading && (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-zinc-400 text-sm">Loading drivers...</td></tr>
                )}
                {!loading && drivers.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-zinc-400 text-sm">
                    {debouncedSearch ? 'No drivers match your search.' : 'No drivers yet. Add your first driver to get started.'}
                  </td></tr>
                )}
                {drivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      <Link href={`/admin/drivers/${driver.id}`} className="text-indigo-600 hover:text-indigo-700 hover:underline">
                        {driver.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-zinc-500 font-mono">
                      {driver.username ? `@${driver.username}` : <span className="text-zinc-300 italic">not set</span>}
                    </td>
                    <td className="px-6 py-4">
                      {driver.vehicles ? (
                        <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                          <Car className="h-3.5 w-3.5 text-indigo-500" />
                          {(driver.vehicles as any).make} {(driver.vehicles as any).model}
                          <span className="text-zinc-400 font-mono text-xs">· {(driver.vehicles as any).plate_number}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400 italic text-xs">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        driver.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {driver.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/admin/drivers/${driver.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                          <UserCheck className="h-3.5 w-3.5" />Edit / Assign
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-6 py-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="gap-1.5"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}