'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { addDays } from '@/lib/dates';

// Who drove which vehicle, and when (owner decision M3). Recorded by the
// database whenever a driver's vehicle changes; dates are kept for good.

interface Row {
  driver_id: string;
  driver_name: string | null;
  vehicle_id: string;
  vehicle_label: string | null;
  assigned_from: string;
  assigned_to: string | null; // first day NOT on the vehicle
}

export function AssignmentHistory({ vehicleId, driverId }: { vehicleId?: string; driverId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    createClient()
      .rpc('get_assignment_history', { p_vehicle_id: vehicleId ?? null, p_driver_id: driverId ?? null })
      .then(({ data, error: err }) => {
        if (!current) return;
        if (err) setError(err.message);
        else setRows((data ?? []) as Row[]);
      });
    return () => { current = false; };
  }, [vehicleId, driverId]);

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-zinc-500" />
          {vehicleId ? 'Driver history' : 'Vehicle history'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : rows === null ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-zinc-400">No assignments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
            {rows.map(r => (
              <li key={`${r.driver_id}-${r.vehicle_id}-${r.assigned_from}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{vehicleId ? (r.driver_name ?? 'Unknown driver') : (r.vehicle_label ?? 'Unknown vehicle')}</span>
                <span className="text-zinc-500">
                  {r.assigned_from} → {r.assigned_to ? addDays(r.assigned_to, -1) : <span className="font-semibold text-emerald-600 dark:text-emerald-400">now</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
