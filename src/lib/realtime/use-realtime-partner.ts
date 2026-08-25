/**
 * use-realtime-partner.ts
 *
 * Subscribes to Supabase Realtime changes scoped to the partner's vehicle(s).
 * Partners receive live updates to their financial totals and salary calculations
 * without needing to manually refresh.
 *
 * RLS on Supabase ensures the partner only receives events for their own vehicles —
 * not for other partners' vehicles. The client-side filter is an additional safeguard.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface PartnerRealtimeFinancials {
  totalRevenue: number;
  totalExpenses: number;
  netRevenue: number;
  cashRevenue: number;
  voucherRevenue: number;
  updatedAt: string;
}

export interface SalaryNotification {
  id: string;
  vehicleId: string;
  status: 'draft' | 'finalized';
  periodStart: string;
  periodEnd: string;
  netRevenue: number;
  notifiedAt: string;
}

export interface PartnerRealtimeState {
  /** Live financials per vehicle (keyed by vehicleId). Updated on every daily_summary change. */
  vehicleFinancials: Record<string, PartnerRealtimeFinancials>;
  /** Toast queue for salary-finalized notifications */
  salaryNotifications: SalaryNotification[];
  /** Whether the Realtime channel is connected */
  isConnected: boolean;
}

export function useRealtimePartner(vehicleIds: string[]): PartnerRealtimeState & {
  dismissSalaryNotification: (id: string) => void;
} {
  const [vehicleFinancials, setVehicleFinancials] = useState<Record<string, PartnerRealtimeFinancials>>({});
  const [salaryNotifications, setSalaryNotifications] = useState<SalaryNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const dismissSalaryNotification = useCallback((id: string) => {
    setSalaryNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (vehicleIds.length === 0) return;

    const supabase = createClient();

    // ── Initial fetch: current period totals from daily_summary ──────────────
    async function fetchInitialFinancials() {
      const monthStart = new Date();
      monthStart.setDate(1);
      const startStr = monthStart.toISOString().split('T')[0];
      const endStr = new Date().toISOString().split('T')[0];

      const { data } = await supabase
        .from('daily_summary')
        .select('vehicle_id, total_revenue, total_expenses, net_revenue, cash_revenue, voucher_revenue, updated_at')
        .in('vehicle_id', vehicleIds)
        .gte('summary_date', startStr)
        .lte('summary_date', endStr);

      if (!data) return;

      // Aggregate per vehicle across the period
      const agg: Record<string, PartnerRealtimeFinancials> = {};
      for (const row of data) {
        const vid = row.vehicle_id;
        if (!agg[vid]) {
          agg[vid] = { totalRevenue: 0, totalExpenses: 0, netRevenue: 0, cashRevenue: 0, voucherRevenue: 0, updatedAt: row.updated_at };
        }
        agg[vid].totalRevenue   += row.total_revenue;
        agg[vid].totalExpenses  += row.total_expenses;
        agg[vid].netRevenue     += row.net_revenue;
        agg[vid].cashRevenue    += row.cash_revenue;
        agg[vid].voucherRevenue += row.voucher_revenue;
        if (row.updated_at > agg[vid].updatedAt) agg[vid].updatedAt = row.updated_at;
      }
      setVehicleFinancials(agg);
    }

    fetchInitialFinancials();

    // ── Realtime channel ──────────────────────────────────────────────────────
    // Use a single channel with multiple event listeners (one per table).
    const channelName = `partner-vehicles-${vehicleIds.sort().join('-')}`;
    const channel = supabase.channel(channelName);

    // daily_summary: one event fires per row (per date/driver/vehicle combo).
    // We re-aggregate the whole vehicle total when any row changes.
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'daily_summary',
      },
      async (payload) => {
        const row = (payload.new ?? payload.old) as any;
        if (!row || !vehicleIds.includes(row.vehicle_id)) return;

        // Re-fetch totals for this vehicle (simpler than in-memory merging)
        const monthStart = new Date();
        monthStart.setDate(1);
        const startStr = monthStart.toISOString().split('T')[0];
        const endStr = new Date().toISOString().split('T')[0];

        const { data } = await supabase
          .from('daily_summary')
          .select('total_revenue, total_expenses, net_revenue, cash_revenue, voucher_revenue, updated_at')
          .eq('vehicle_id', row.vehicle_id)
          .gte('summary_date', startStr)
          .lte('summary_date', endStr);

        if (!data) return;

        const totals: PartnerRealtimeFinancials = {
          totalRevenue: 0, totalExpenses: 0, netRevenue: 0,
          cashRevenue: 0, voucherRevenue: 0, updatedAt: new Date().toISOString(),
        };
        for (const r of data) {
          totals.totalRevenue   += r.total_revenue;
          totals.totalExpenses  += r.total_expenses;
          totals.netRevenue     += r.net_revenue;
          totals.cashRevenue    += r.cash_revenue;
          totals.voucherRevenue += r.voucher_revenue;
        }

        setVehicleFinancials((prev) => ({ ...prev, [row.vehicle_id]: totals }));
      }
    );

    // salary_calculations: notify partner when their payout is finalized
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'salary_calculations',
      },
      (payload) => {
        const row = payload.new as any;
        if (!row || !vehicleIds.includes(row.vehicle_id)) return;
        if (row.status !== 'finalized') return;

        const notification: SalaryNotification = {
          id: row.id,
          vehicleId: row.vehicle_id,
          status: 'finalized',
          periodStart: row.period_start,
          periodEnd: row.period_end,
          netRevenue: row.net_revenue,
          notifiedAt: new Date().toISOString(),
        };

        setSalaryNotifications((prev) => [notification, ...prev]);
      }
    );

    channel.subscribe((status) => {
      setIsConnected(status === 'SUBSCRIBED');
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [vehicleIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { vehicleFinancials, salaryNotifications, isConnected, dismissSalaryNotification };
}
