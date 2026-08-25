/**
 * use-realtime-admin.ts
 *
 * Subscribes to Supabase Realtime changes on daily_summary and rides tables.
 * Designed for the Admin dashboard to receive live KPI updates without refresh.
 *
 * Strategy (safe at scale):
 *  - Instead of re-aggregating 100+ drivers on every event (expensive),
 *    we show a "New data available" notification banner so the admin can
 *    choose when to refresh their current view.
 *  - The "Recent Activity" feed IS updated live (row-level, cheap).
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface RecentActivity {
  id: string;
  driverName: string;
  amount: number;
  createdAt: string;
  type: 'ride' | 'expense';
}

export interface AdminRealtimeState {
  hasNewData: boolean;         // Banner: "New data — click to refresh"
  recentActivity: RecentActivity[];
  pendingCorrectionCount: number;
  isConnected: boolean;
}

export function useRealtimeAdmin(): AdminRealtimeState & { dismiss: () => void } {
  const [hasNewData, setHasNewData] = useState(false);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [pendingCorrectionCount, setPendingCorrectionCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  const dismiss = useCallback(() => setHasNewData(false), []);

  // Fetch recent activity and correction count on mount
  useEffect(() => {
    const supabase = createClient();

    async function fetchInitial() {
      // Recent rides (last 5)
      const { data: rides } = await supabase
        .from('rides')
        .select('id, amount, created_at, drivers(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      if (rides) {
        setRecentActivity(
          rides.map((r: any) => ({
            id: r.id,
            driverName: r.drivers?.name ?? 'Unknown Driver',
            amount: r.amount,
            createdAt: r.created_at,
            type: 'ride' as const,
          }))
        );
      }

      // Pending correction requests count
      const { count } = await supabase
        .from('correction_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      setPendingCorrectionCount(count ?? 0);
    }

    fetchInitial();

    // ── Realtime channel setup ─────────────────────────────────────────────
    const channel = supabase
      .channel('admin-live')

      // daily_summary changes → flag that new data exists (don't re-aggregate live)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_summary' },
        () => {
          setHasNewData(true);
        }
      )

      // New rides → prepend to recent activity feed
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rides' },
        async (payload) => {
          const newRide = payload.new as any;
          // Fetch driver name for this ride
          const { data: driver } = await supabase
            .from('drivers')
            .select('name')
            .eq('id', newRide.driver_id)
            .single();

          const activity: RecentActivity = {
            id: newRide.id,
            driverName: driver?.name ?? 'Unknown Driver',
            amount: newRide.amount,
            createdAt: newRide.created_at,
            type: 'ride',
          };

          setRecentActivity((prev) => [activity, ...prev].slice(0, 5));
        }
      )

      // Correction requests: bump the pending badge
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'correction_requests' },
        () => {
          setPendingCorrectionCount((c) => c + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'correction_requests',
          filter: 'status=neq.pending',
        },
        () => {
          setPendingCorrectionCount((c) => Math.max(0, c - 1));
        }
      )

      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { hasNewData, recentActivity, pendingCorrectionCount, isConnected, dismiss };
}
