'use client';

import { usePartner } from '@/contexts/PartnerContext';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { User, Calendar, Shield, LogOut, ChevronRight } from 'lucide-react';

export default function PartnerSettingsPage() {
  const { partnerName, username, status, joinedDate, loading } = usePartner();
  const router = useRouter();

  const initials = partnerName
    ? partnerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const handleLogout = async () => {
    await createClient().auth.signOut();
    window.location.href = '/login';
  };

  if (loading) return <div className="p-6 text-zinc-400 text-sm">Loading...</div>;

  return (
    <div className="py-6 space-y-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* Profile Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 text-xl font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 truncate">{partnerName}</h2>
          <p className="text-sm text-zinc-500 font-mono">@{username}</p>
          <span className={`inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500'}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />{status}
          </span>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
        <div className="flex items-center gap-3 p-4">
          <User className="h-4 w-4 text-zinc-400 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-zinc-500">Full Name</p>
            <p className="text-sm font-medium">{partnerName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <Shield className="h-4 w-4 text-zinc-400 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-zinc-500">Username</p>
            <p className="text-sm font-medium font-mono">@{username}</p>
          </div>
        </div>
        {joinedDate && (
          <div className="flex items-center gap-3 p-4">
            <Calendar className="h-4 w-4 text-zinc-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-zinc-500">Partner Since</p>
              <p className="text-sm font-medium">{new Date(joinedDate).toLocaleDateString('en-SA', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <LogOut className="h-4 w-4" />
          <span className="font-medium">Sign Out</span>
        </div>
        <ChevronRight className="h-4 w-4 opacity-50" />
      </button>
    </div>
  );
}