'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalRide, type LocalExpense } from '@/lib/db/dexie';
import { useDriver } from '@/contexts/DriverContext';

/**
 * The signed-in driver's entries on this phone, newest first, live-updating.
 *
 * Entries kept on a shared phone for another driver (unsynced work is never
 * deleted at sign-out) are hidden. Untagged entries come from older app
 * versions, which only ever held the current driver's data.
 * Returns undefined while loading.
 */
const isMine = (entry: { driverId?: string }, driverId: string) =>
  !entry.driverId || entry.driverId === driverId;

export function useMyRides(): LocalRide[] | undefined {
  const { driverId } = useDriver();
  return useLiveQuery(
    async () => (await db.rides.orderBy('createdAt').reverse().toArray()).filter(r => isMine(r, driverId)),
    [driverId],
  );
}

export function useMyExpenses(): LocalExpense[] | undefined {
  const { driverId } = useDriver();
  return useLiveQuery(
    async () => (await db.expenses.orderBy('createdAt').reverse().toArray()).filter(e => isMine(e, driverId)),
    [driverId],
  );
}
