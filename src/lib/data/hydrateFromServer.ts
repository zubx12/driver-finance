import { db, type LocalRide, type LocalExpense } from '@/lib/db/dexie';
import { createClient } from '@/lib/supabase/client';
import { addDays, riyadhToday } from '@/lib/dates';

/**
 * Hydrate IndexedDB (Dexie) from Supabase after login.
 * Pulls the current month's rides and expenses so the driver sees their data
 * immediately, and refreshes the list of paying organisations.
 *
 * Records use the server id as their local id (the same id the phone uses
 * when it uploads an entry), and are marked 'synced' so they are never
 * re-uploaded. Existing local records are never overwritten.
 */
export async function hydrateFromServer(driverId: string): Promise<{ rides: number; expenses: number }> {
  const supabase = createClient();

  await refreshPayers();

  // Already holding this driver's synced data (they have not signed out).
  const hasSyncedData = await db.rides.where('syncStatus').equals('synced').count();
  if (hasSyncedData > 0) {
    return { rides: 0, expenses: 0 };
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  const monthStart = `${today.slice(0, 7)}-01`;

  const [{ data: serverRides, error: ridesError }, { data: serverExpenses, error: expensesError }] = await Promise.all([
    supabase
      .from('rides')
      .select('id, ride_date, amount, payment_method, payment_status, vehicle_id, payer_id, reference, created_at')
      .eq('driver_id', driverId)
      .gte('ride_date', monthStart)
      .lte('ride_date', today),
    supabase
      .from('expenses')
      .select('id, expense_date, amount, category, description, allocation, vehicle_id, payment_method, paid_by, created_at')
      .eq('driver_id', driverId)
      .gte('expense_date', monthStart)
      .lte('expense_date', today),
  ]);
  if (ridesError) throw new Error(`hydrate rides: ${ridesError.message}`);
  if (expensesError) throw new Error(`hydrate expenses: ${expensesError.message}`);

  const localRides: LocalRide[] = (serverRides ?? []).map(r => ({
    id: r.id,
    date: r.ride_date,
    amount: Number(r.amount),
    revenueType: r.payment_method === 'Voucher' ? 'VOUCHER' : 'CASH',
    paymentStatus: r.payment_status ?? 'Received',
    vehicleId: r.vehicle_id ?? undefined,
    payerId: r.payer_id ?? undefined,
    voucherReference: r.reference ?? undefined,
    driverId,
    syncStatus: 'synced',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  }));

  const localExpenses: LocalExpense[] = (serverExpenses ?? []).map(e => ({
    id: e.id,
    date: e.expense_date,
    amount: Number(e.amount),
    category: e.category,
    allocation: e.allocation === 'Driver' ? 'Driver' : e.allocation === 'Company' ? 'Other / Company' : 'Current Vehicle',
    vehicleId: e.vehicle_id ?? undefined,
    paymentSource: e.payment_method === 'Cash' ? 'Cash'
      : e.paid_by === 'driver' ? 'Own Money'
      : e.payment_method === 'Transfer' ? 'Bank Transfer' : 'Company Card',
    description: e.description ?? undefined,
    // Receipt is stored on the server — no need to store base64 locally
    driverId,
    syncStatus: 'synced',
    createdAt: e.created_at ? new Date(e.created_at).getTime() : Date.now(),
  }));

  // bulkAdd + ignore existing keys: never overwrite an entry already on the phone.
  await db.rides.bulkAdd(localRides).catch(() => undefined);
  await db.expenses.bulkAdd(localExpenses).catch(() => undefined);

  return { rides: localRides.length, expenses: localExpenses.length };
}

/** Paying organisations from the server; payers added on the phone are kept. */
async function refreshPayers() {
  const { data, error } = await createClient().from('payers').select('id, name, type').eq('status', 'Active');
  if (error || !data) return;
  await db.payers.bulkPut(data.map(p => ({
    id: p.id,
    name: p.name,
    type: p.type === 'Individual' ? 'Individual' as const : 'Organization' as const,
    createdAt: Date.now(),
    source: 'server' as const,
  })));
}

/**
 * Refresh payment statuses for synced voucher rides.
 * When admin or partner marks a voucher as "Collected" in Supabase,
 * this updates the local Dexie record so the driver sees the change.
 * Runs on every app open — lightweight query (voucher rides only).
 */
export async function refreshPaymentStatuses(driverId: string): Promise<number> {
  const supabase = createClient();

  const { data: serverRides } = await supabase
    .from('rides')
    .select('id, payment_status')
    .eq('driver_id', driverId)
    .eq('payment_method', 'Voucher');

  if (!serverRides || serverRides.length === 0) return 0;

  let updated = 0;
  for (const sr of serverRides) {
    // Current app versions use the server id; older ones prefixed it with srv-.
    for (const localId of [sr.id, `srv-${sr.id}`]) {
      const localRide = await db.rides.get(localId);
      if (localRide && localRide.syncStatus === 'synced' && localRide.paymentStatus !== sr.payment_status) {
        await db.rides.update(localId, { paymentStatus: sr.payment_status as LocalRide['paymentStatus'] });
        updated++;
      }
    }
  }

  return updated;
}

/**
 * Cash handovers from the last 60 days: brings the office's decision
 * (confirmed / disputed, with its note) back to the phone, and adds handovers
 * missing on this phone (e.g. after changing phones). Never overwrites the
 * driver's own unsynced handovers.
 */
export async function refreshHandovers(driverId: string): Promise<number> {
  const since = addDays(riyadhToday(), -60);
  const { data, error } = await createClient()
    .from('cash_handovers')
    .select('id, handover_date, amount, handed_to, reference, notes, vehicle_id, status, admin_note, created_at')
    .eq('driver_id', driverId)
    .gte('handover_date', since);
  if (error || !data) return 0;

  let changed = 0;
  for (const h of data) {
    const local = await db.cashHandovers.get(h.id);
    if (local) {
      if (local.syncStatus === 'synced' && (local.reviewStatus !== h.status || local.adminNote !== (h.admin_note ?? undefined))) {
        await db.cashHandovers.update(h.id, { reviewStatus: h.status, adminNote: h.admin_note ?? undefined });
        changed++;
      }
    } else {
      await db.cashHandovers.add({
        id: h.id,
        date: h.handover_date,
        amount: Number(h.amount),
        handedTo: h.handed_to ?? '',
        reference: h.reference ?? undefined,
        notes: h.notes ?? undefined,
        vehicleId: h.vehicle_id ?? undefined,
        reviewStatus: h.status,
        adminNote: h.admin_note ?? undefined,
        driverId,
        syncStatus: 'synced',
        createdAt: h.created_at ? new Date(h.created_at).getTime() : Date.now(),
      });
      changed++;
    }
  }
  return changed;
}
