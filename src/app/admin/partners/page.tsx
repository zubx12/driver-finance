'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Search, Briefcase, UserPlus, Car } from 'lucide-react';

interface Partner {
  id: string;
  name: string;
  username: string | null;
  status: string;
  active_vehicles_count: number;
}

export default function PartnersList() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/partners-list-full')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPartners(d); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = partners.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.username ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Partners</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Manage investors and equity partners.</p>
        </div>
        <Link href="/admin/partners/add">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm w-full sm:w-auto">
            Add New Partner
          </Button>
        </Link>
      </header>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="py-4 px-6 border-b dark:border-zinc-800">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search partners..." className="pl-9 bg-zinc-50 dark:bg-zinc-900/50" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50 dark:text-zinc-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Name</th>
                  <th className="px-6 py-4 font-medium">Username</th>
                  <th className="px-6 py-4 font-medium text-center">Active Vehicles</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {loading && (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-zinc-400 text-sm">Loading partners...</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-zinc-400 text-sm">
                    {partners.length === 0 ? 'No partners yet. Add your first partner to get started.' : 'No partners match your search.'}
                  </td></tr>
                )}
                {filtered.map((partner) => (
                  <tr key={partner.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                      <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 p-2 rounded-lg">
                        <Briefcase className="h-4 w-4" />
                      </div>
                      {partner.name}
                    </td>
                    <td className="px-6 py-4 text-zinc-500 font-mono">
                      {partner.username ? `@${partner.username}` : <span className="text-zinc-300 italic">not set</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center min-w-[2rem] h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs px-3">
                        <Car className="h-3.5 w-3.5 mr-1.5 opacity-50" />
                        {partner.active_vehicles_count}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        partner.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {partner.status}
                      </span>
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