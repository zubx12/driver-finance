import { db } from '@/lib/db/dexie';
import { createClient } from '@/lib/supabase/client';

/**
 * Hydrate IndexedDB (Dexie) from Supabase after login.
 * Pulls the current month's rides and expenses so the driver
 * sees their data immediately without waiting for new entries.
 * 
 * Only imports records that don't already exist in Dexie (by server ID prefix).
 * Marks imported records as 'synced' so they won't be re-uploaded.
 */
export async function hydrateFromServer(driverId: string): Promise<{ rides: number; expenses: number }> {
  const supabase = createClient();

  // Get start of current month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

  // Check if Dexie already has data (skip hydration if so — user hasn't logged out)
  const existingCount = await db.rides.count();
  if (existingCount > 0) {
    return { rides: 0, expenses: 0 };
  }

  // Fetch this month's rides from Supabase
  const { data: serverRides } = await supabase
    .from('rides')
    .select('id, ride_date, amount, payment_method, notes')
    .eq('driver_id', driverId)
    .gte('ride_date', monthStart)
    .lte('ride_date', today)
    .order('ride_date', { ascending: false });

  // Fetch this month's expenses from Supabase
  const { data: serverExpenses } = await supabase
    .from('expenses')
    .select('id, expense_date, amount, category, description, receipt_image_url')
    .eq('driver_id', driverId)
    .gte('expense_date', monthStart)
    .lte('expense_date', today)
    .order('expense_date', { ascending: false });

  let ridesImported = 0;
  let expensesImported = 0;

  // Import rides into Dexie
  if (serverRides && serverRides.length > 0) {
    const localRides = serverRides.map(r => ({
      id: `srv-${r.id}`, // Prefix to distinguish from locally-created entries
      date: r.ride_date,
      amount: r.amount,
      revenueType: (r.payment_method === 'Cash' ? 'CASH' : 'VOUCHER') as 'CASH' | 'VOUCHER',
      paymentStatus: 'Received' as const,
      notes: r.notes ?? undefined,
      syncStatus: 'synced' as const,
      createdAt: Date.now(),
    }));
    await db.rides.bulkPut(localRides);
    ridesImported = localRides.length;
  }

  // Import expenses into Dexie (without base64 images — they're on the server)
  if (serverExpenses && serverExpenses.length > 0) {
    const localExpenses = serverExpenses.map(e => ({
      id: `srv-${e.id}`,
      date: e.expense_date,
      amount: e.amount,
      category: e.category,
      allocation: 'Current Vehicle' as const,
      paymentSource: 'Cash' as const,
      description: e.description ?? undefined,
      // Receipt is stored on the server — no need to store base64 locally
      syncStatus: 'synced' as const,
      createdAt: Date.now(),
    }));
    await db.expenses.bulkPut(localExpenses);
    expensesImported = localExpenses.length;
  }

  return { rides: ridesImported, expenses: expensesImported };
}

/**
 * Refresh payment statuses for synced voucher rides.
 * When admin or partner marks a voucher as "Collected" in Supabase,
 * this updates the local Dexie record so the driver sees the change.
 * Runs on every app open — lightweight query (voucher rides only).
 */
export async function refreshPaymentStatuses(driverId: string): Promise<number> {
  const supabase = createClient();

  // Fetch all voucher rides with their current payment_status from Supabase
  const { data: serverRides } = await supabase
    .from('rides')
    .select('id, payment_status, collected_by_name, collected_by_role')
    .eq('driver_id', driverId)
    .eq('payment_method', 'Voucher');

  if (!serverRides || serverRides.length === 0) return 0;

  let updated = 0;
  for (const sr of serverRides) {
    const localId = `srv-${sr.id}`;
    const localRide = await db.rides.get(localId);
    if (localRide && localRide.paymentStatus !== sr.payment_status) {
      await db.rides.update(localId, {
        paymentStatus: sr.payment_status as any,
      });
      updated++;
    }
  }

  return updated;
}
