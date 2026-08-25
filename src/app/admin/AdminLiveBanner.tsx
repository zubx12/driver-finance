'use client';

/**
 * AdminLiveBanner.tsx
 *
 * Client component embedded in the Admin dashboard (Server Component) that:
 *  - Shows a "New data available" banner when drivers sync rides
 *    (uses banner pattern instead of live re-aggregate — safe at 100+ driver scale)
 *  - Updates the "Recent Activity" feed live without page refresh
 *  - Shows a correction-request badge with pending count
 *  - Displays a 🔴 LIVE indicator when Realtime is connected
 */

import { useRouter } from 'next/navigation';
import { useRealtimeAdmin, RecentActivity } from '@/lib/realtime/use-realtime-admin';
import { Car, Bell, RefreshCw, Radio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

interface Props {
  /** SSR-fetched initial recent activity — replaced by realtime feed once connected */
  initialActivity: RecentActivity[];
}

const fmt = (n: number) =>
  n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

export function AdminLiveBanner({ initialActivity }: Props) {
  const router = useRouter();
  const { hasNewData, recentActivity, pendingCorrectionCount, isConnected, dismiss } =
    useRealtimeAdmin();

  // Use live feed once non-empty, else fall back to SSR-rendered data
  const feed: RecentActivity[] = recentActivity.length > 0 ? recentActivity : initialActivity;

  return (
    <>
      {/* ── New Data Banner ───────────────────────────────────────────────── */}
      {hasNewData && (
        <div className="flex items-center justify-between gap-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-medium">
            <RefreshCw className="h-4 w-4" />
            New driver data synced — click to refresh totals
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { dismiss(); router.refresh(); }}
              className="text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={dismiss}
              className="text-xs text-indigo-500 hover:text-indigo-700 px-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Correction Requests Badge ─────────────────────────────────────── */}
      {pendingCorrectionCount > 0 && (
        <Link
          href="/admin/corrections"
          className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
        >
          <Bell className="h-4 w-4 text-amber-600" />
          <span className="font-medium text-amber-700 dark:text-amber-300">
            {pendingCorrectionCount} correction request{pendingCorrectionCount > 1 ? 's' : ''} pending review
          </span>
          <span className="ml-auto text-xs text-amber-500">View →</span>
        </Link>
      )}

      {/* ── Recent Activity + LIVE indicator ─────────────────────────────── */}
      <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Driver Activity</CardTitle>
          {isConnected && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
              <Radio className="h-2.5 w-2.5 animate-pulse" />
              LIVE
            </span>
          )}
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <div className="py-8 text-center text-zinc-400 text-sm">
              No rides synced yet. Activity will appear here once drivers log their first ride.
            </div>
          ) : (
            <div className="space-y-4">
              {feed.map((item) => (
                <div key={item.id} className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                    <Car className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    <p className="text-sm font-medium leading-none truncate">{item.driverName}</p>
                    <p className="text-sm text-zinc-500">Synced {fmt(item.amount)} SAR</p>
                  </div>
                  <div className="text-sm text-zinc-500 shrink-0">{timeAgo(item.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
