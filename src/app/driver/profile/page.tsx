'use client';

import Link from 'next/link';
import { ChevronLeft, Car, Percent, DollarSign, Gift, LogOut } from 'lucide-react';
import { useDriver } from '@/contexts/DriverContext';
import { createClient } from '@/lib/supabase/client';
import { db } from '@/lib/db/dexie';
import { PortalSwitch } from '@/components/PortalSwitch';

export default function DriverProfilePage() {
  const { driverId, driverName, username, status, vehicleMake, vehicleModel, vehiclePlate, vehicleId, payType, commissionRate, fixedSalary, bonusRate, loading } = useDriver();

  // Entries that are not on the server yet are never deleted at sign-out. They
  // stay on this phone tagged with this driver and upload at their next sign-in.
  const handleLogout = async () => {
    const { syncAll, getUnsyncedCounts } = await import('@/lib/data/syncQueue');

    let { pending, failed } = await getUnsyncedCounts();
    if (pending + failed > 0 && navigator.onLine) {
      await syncAll({ driverId, vehicleId: vehicleId ?? null }, true).catch(() => null);
      ({ pending, failed } = await getUnsyncedCounts());
    }
    const unsynced = pending + failed;

    if (unsynced > 0) {
      const ok = confirm(
        `${unsynced} entr${unsynced > 1 ? 'ies have' : 'y has'} not been uploaded yet. ` +
        'They will stay saved on this phone and upload the next time you sign in here. Sign out anyway?'
      );
      if (!ok) return;

      // Older entries were not tagged with a driver; tag them so they can only
      // ever upload under this driver's account.
      await db.rides.filter(r => r.syncStatus !== 'synced' && !r.driverId).modify({ driverId });
      await db.expenses.filter(e => e.syncStatus !== 'synced' && !e.driverId).modify({ driverId });

      await createClient().auth.signOut();
      // Remove only what is already safely on the server.
      await db.rides.where('syncStatus').equals('synced').delete();
      await db.expenses.where('syncStatus').equals('synced').delete();
    } else {
      if (!confirm('Are you sure you want to sign out?')) return;
      await createClient().auth.signOut();
      await db.delete();
      await db.open();
    }
    window.location.href = '/login';
  };

  const initials = driverName ? driverName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-zinc-400 text-sm">Loading profile...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <Link href="/driver"><ChevronLeft className="h-5 w-5 text-zinc-500" /></Link>
        <h1 className="font-bold text-lg">My Profile</h1>
      </header>

      <div className="p-4 space-y-4 max-w-md mx-auto">
        {/* Identity Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">{driverName || 'Driver'}</h2>
            <p className="text-sm text-zinc-500 font-mono">@{username}</p>
            <span className={`inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500'}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />{status}
            </span>
          </div>
        </div>

        {/* Operational Info */}
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">Operational Information</p>

        {/* Vehicle */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
          <div className="flex items-center gap-3 p-4">
            <div className="h-9 w-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
              <Car className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-500 font-medium">My Vehicle</p>
              {vehicleId ? (
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{vehicleMake} {vehicleModel} <span className="text-zinc-400 font-normal">• {vehiclePlate}</span></p>
              ) : (
                <p className="text-zinc-400 text-sm">No vehicle assigned yet</p>
              )}
            </div>
          </div>

          {/* Compensation */}
          {payType === 'commission' && (
            <div className="flex items-center gap-3 p-4">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                <Percent className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-zinc-500 font-medium">My Revenue Share</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{commissionRate ?? 0}% of Net Revenue</p>
              </div>
            </div>
          )}

          {payType === 'fixed_salary' && (
            <>
              <div className="flex items-center gap-3 p-4">
                <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 font-medium">Fixed Salary</p>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">SAR {(fixedSalary ?? 0).toLocaleString('en-SA')} / month</p>
                </div>
              </div>
              {bonusRate > 0 && (
                <div className="flex items-center gap-3 p-4">
                  <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <Gift className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-zinc-500 font-medium">Performance Bonus</p>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{bonusRate}% of Net Revenue after expenses</p>
                  </div>
                </div>
              )}
            </>
          )}

          {!payType && (
            <div className="flex items-center gap-3 p-4">
              <div className="h-9 w-9 rounded-xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                <Percent className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-zinc-500 font-medium">Compensation</p>
                <p className="text-zinc-400 text-sm">Not configured yet</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8">
          <PortalSwitch to="partner" />
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors mt-3"
        >
          <div className="flex items-center gap-3">
            <LogOut className="h-4 w-4" />
            <span className="font-medium">Sign Out</span>
          </div>
        </button>
      </div>
    </div>
  );
}