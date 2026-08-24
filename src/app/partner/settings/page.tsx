'use client';

import { useEffect, useState } from 'react';
import { partnerService } from '@/services/partner-service';
import { Partner, PartnerVehicle, OwnershipArrangement } from '@/types/partner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { User, Car, Settings, Bell, Globe, Shield, LogOut } from 'lucide-react';

export default function PartnerSettingsPage() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [vehicles, setVehicles] = useState<PartnerVehicle[]>([]);
  const [ownerships, setOwnerships] = useState<OwnershipArrangement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const p = await partnerService.getCurrentPartner();
      setPartner(p);
      const v = await partnerService.getPartnerVehicles(p.id);
      setVehicles(v);
      
      const owns: OwnershipArrangement[] = [];
      for (const vehicle of v) {
        const o = await partnerService.getOwnership(p.id, vehicle.id);
        if (o) owns.push(o);
      }
      setOwnerships(owns);
      setIsLoading(false);
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6 animate-pulse pb-24 max-w-3xl mx-auto">
        <div className="h-10 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
        <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"></div>
        <div className="h-48 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 pb-24 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">Profile & Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Manage your partner account, portfolio, and preferences.</p>
      </header>

      {/* Identity Card */}
      <Card className="border border-zinc-200/50 dark:border-zinc-800/50 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden rounded-2xl">
        <div className="h-24 bg-gradient-to-r from-indigo-500 to-indigo-700"></div>
        <CardContent className="px-6 pb-6 pt-0 relative">
          <div className="absolute -top-12 left-6 h-24 w-24 rounded-full border-4 border-white dark:border-zinc-900 bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center shadow-md">
            <User className="h-10 w-10 text-indigo-500" />
          </div>
          <div className="mt-14 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{partner?.name}</h2>
              <p className="text-sm text-zinc-500 font-mono mt-1">ID: {partner?.id}</p>
            </div>
            <div className="flex flex-col sm:text-right">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Status</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 w-max sm:ml-auto">
                {partner?.status} Partner
              </span>
              <span className="text-xs text-zinc-500 mt-1">Joined {partner?.joinedDate}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Section */}
      <Card className="border border-zinc-200/50 dark:border-zinc-800/50 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
        <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="h-4 w-4 text-indigo-500" />
            My Vehicle Portfolio
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {vehicles.map((v, i) => {
              const o = ownerships[i];
              return (
                <li key={v.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">{v.make} {v.model}</div>
                    <div className="text-xs text-zinc-500 font-mono mt-0.5">{v.plateNumber}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{o?.percentage}%</div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Stake</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Preferences Section */}
      <Card className="border border-zinc-200/50 dark:border-zinc-800/50 bg-white dark:bg-zinc-900 shadow-sm rounded-2xl">
        <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-zinc-500" />
            Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <li className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-zinc-400" />
                <div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">Push Notifications</div>
                  <div className="text-xs text-zinc-500">Receive alerts for payouts and expenses.</div>
                </div>
              </div>
              <Switch checked={true} />
            </li>
            <li className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-zinc-400" />
                <div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">Language</div>
                  <div className="text-xs text-zinc-500">English (US)</div>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8">Change</Button>
            </li>
            <li className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-zinc-400" />
                <div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">Security</div>
                  <div className="text-xs text-zinc-500">Update password and 2FA.</div>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8">Manage</Button>
            </li>
          </ul>
        </CardContent>
      </Card>
      
      <div className="pt-4">
        <Button variant="destructive" className="w-full rounded-xl flex items-center justify-center gap-2">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
