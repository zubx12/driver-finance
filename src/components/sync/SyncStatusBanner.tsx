'use client';

/**
 * SyncStatusBanner.tsx
 *
 * Displays a slim top banner showing the current sync state:
 *  - Hidden   when everything is synced and online
 *  - Blue     when a sync is actively running
 *  - Red      when the server rejected entries (stays until the driver acts)
 *  - Amber    when offline with pending records, or retrying after an error
 *  - Green    flash when sync just completed successfully (auto-hides after 3s)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSyncStatus } from '@/lib/sync/use-sync-status';
import { runSync } from '@/lib/sync/sync-engine';
import { WifiOff, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export function SyncStatusBanner() {
  const { pendingCount, failedCount, isSyncing, lastSyncedAt, lastError } = useSyncStatus();
  const [isOnline, setIsOnline] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [prevSyncedAt, setPrevSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Flash green for 3 seconds after a successful sync
  useEffect(() => {
    if (lastSyncedAt && lastSyncedAt !== prevSyncedAt) {
      setPrevSyncedAt(lastSyncedAt);
      if (pendingCount === 0 && failedCount === 0 && !lastError) {
        setShowSuccess(true);
        const t = setTimeout(() => setShowSuccess(false), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [lastSyncedAt, pendingCount, failedCount, lastError, prevSyncedAt]);

  // ── Syncing in progress ────────────────────────────────────────────────────
  if (isSyncing) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-indigo-600 text-white text-xs font-semibold py-1.5 animate-pulse">
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing {pendingCount > 0 ? `${pendingCount} record${pendingCount > 1 ? 's' : ''}` : 'data'}…
      </div>
    );
  }

  // ── Entries the server rejected: the driver has to act ─────────────────────
  if (failedCount > 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-rose-600 text-white text-xs font-semibold py-1.5">
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>{failedCount} entr{failedCount > 1 ? 'ies were' : 'y was'} not accepted</span>
        <Link href="/driver/history" className="ml-2 underline underline-offset-2 hover:no-underline">
          See why
        </Link>
      </div>
    );
  }

  // ── Temporary upload problem: retries automatically ───────────────────────
  if (lastError) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-xs font-semibold py-1.5">
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>{lastError}</span>
        <button
          onClick={() => runSync(true)}
          className="ml-2 underline underline-offset-2 hover:no-underline"
        >
          Retry now
        </button>
      </div>
    );
  }

  // ── Offline with pending records ───────────────────────────────────────────
  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-xs font-semibold py-1.5">
        <WifiOff className="h-3 w-3 shrink-0" />
        Offline — data saved locally
        {pendingCount > 0 && (
          <span className="bg-white/20 px-1.5 py-0.5 rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>
    );
  }

  // ── Online but still has pending records (rare: upload slow / partial) ─────
  if (pendingCount > 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-400 text-white text-xs font-semibold py-1.5">
        <RefreshCw className="h-3 w-3 shrink-0" />
        {pendingCount} record{pendingCount > 1 ? 's' : ''} waiting to sync…
      </div>
    );
  }

  // ── Just synced success flash ──────────────────────────────────────────────
  if (showSuccess) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-emerald-500 text-white text-xs font-semibold py-1.5 transition-all">
        <CheckCircle2 className="h-3 w-3" />
        All data synced ✓
      </div>
    );
  }

  // All good — banner hidden
  return null;
}
