import { db, type LocalRide, type LocalExpense, type SyncStatus } from '@/lib/db/dexie';
import { createClient } from '@/lib/supabase/client';
import type { InsertExpensePayload } from '@/lib/data/expenses';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncResult {
  synced: number;
  retrying: number;
  rejected: number;
}

export interface SyncContext {
  driverId: string;
  /** Currently assigned vehicle; used only for entries saved before vehicles were recorded per entry. */
  vehicleId: string | null;
}

const EMPTY: SyncResult = { synced: 0, retrying: 0, rejected: 0 };

// Errors that will not go away by retrying: the server rejected the entry
// (entry rules raise 23514 with a message meant for the driver).
const PERMANENT_ERROR_CODES = new Set(['23514', '22023', '22P02', '23502', '23503', '42501', 'P0002']);

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 30 * 60_000;

class SyncError extends Error {
  constructor(message: string, readonly code?: string, readonly permanent = false) {
    super(message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function retryDelay(attempts: number) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
}

function isDue(rec: { syncStatus: SyncStatus; nextAttemptAt?: number; lastError?: string }, force: boolean) {
  if (rec.syncStatus === 'pending') return force || !rec.nextAttemptAt || rec.nextAttemptAt <= Date.now();
  // 'failed' records from older app versions never recorded why; retry them once.
  return rec.syncStatus === 'failed' && !rec.lastError;
}

function belongsTo(rec: { driverId?: string }, driverId: string) {
  return !rec.driverId || rec.driverId === driverId;
}

function toSyncError(error: { message: string; code?: string }): SyncError {
  return new SyncError(error.message, error.code, !!error.code && PERMANENT_ERROR_CODES.has(error.code));
}

type EntryTable = 'rides' | 'expenses';
type SyncChanges = { syncStatus?: SyncStatus; attempts?: number; nextAttemptAt?: number; lastError?: string };

function updateLocal(table: EntryTable, id: string, changes: SyncChanges) {
  return table === 'rides' ? db.rides.update(id, changes) : db.expenses.update(id, changes);
}

async function existsOnServer(table: EntryTable, id: string) {
  const { data } = await createClient().from(table).select('id').eq('id', id).maybeSingle();
  return !!data;
}

/** Record the outcome of one upload attempt on the local entry. */
async function recordOutcome(table: EntryTable, rec: LocalRide | LocalExpense, err: unknown): Promise<keyof SyncResult> {
  const synced: SyncChanges = { syncStatus: 'synced', lastError: undefined, nextAttemptAt: undefined };
  if (!err) {
    await updateLocal(table, rec.id, synced);
    return 'synced';
  }
  // The insert may have succeeded even though the response was lost.
  if (await existsOnServer(table, rec.id).catch(() => false)) {
    await updateLocal(table, rec.id, synced);
    return 'synced';
  }
  const e = err instanceof SyncError ? err : new SyncError(err instanceof Error ? err.message : 'Unknown error');
  if (e.permanent) {
    await updateLocal(table, rec.id, { syncStatus: 'failed', lastError: e.message, nextAttemptAt: undefined });
    return 'rejected';
  }
  const attempts = (rec.attempts ?? 0) + 1;
  await updateLocal(table, rec.id, {
    syncStatus: 'pending',
    attempts,
    lastError: e.message,
    nextAttemptAt: Date.now() + retryDelay(attempts),
  });
  return 'retrying';
}

// ─── Rides ────────────────────────────────────────────────────────────────────

async function pushRide(ride: LocalRide, ctx: SyncContext) {
  const vehicleId = ride.vehicleId ?? ctx.vehicleId;
  if (!vehicleId) {
    throw new SyncError('No vehicle is assigned to you yet. The ride is saved on this phone and will upload once the office assigns a vehicle.');
  }

  // Payers added on this phone have no server id; send the name instead.
  const payer = ride.payerId ? await db.payers.get(ride.payerId) : undefined;
  const isVoucher = ride.revenueType === 'VOUCHER';
  const collected = isVoucher && ride.paymentStatus === 'Collected';

  const payload = {
    id: ride.id,
    driver_id: ctx.driverId,
    vehicle_id: vehicleId,
    amount: ride.amount,
    payment_method: isVoucher ? 'Voucher' : 'Cash',
    payment_status: !isVoucher ? 'Received' : collected ? 'Collected' : 'Outstanding',
    ride_date: ride.date,
    reference: ride.voucherReference ?? null,
    payer_id: payer?.source === 'server' ? payer.id : null,
    payer_name: payer?.name ?? null,
    ...(collected ? { collected_by_role: 'driver', collected_at: new Date().toISOString() } : {}),
  };

  // Same id every attempt + ignoreDuplicates = a retry can never create a second ride.
  const { error } = await createClient()
    .from('rides')
    .upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw toSyncError(error);

  await applyEditMadeDuringUpload('rides', ride.id, payload.amount);
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

async function uploadReceipt(driverId: string, expense: LocalExpense): Promise<string> {
  const base64 = expense.receiptImageBase64!;
  const byteString = atob(base64.split(',')[1] ?? base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);

  // Fixed path per expense, so a retry reuses the photo instead of leaving orphans.
  const path = `${driverId}/${expense.date}/${expense.id}.jpg`;
  const { error } = await createClient()
    .storage.from('receipts')
    .upload(path, new Blob([bytes], { type: 'image/jpeg' }), { upsert: false, contentType: 'image/jpeg' });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new SyncError(`Receipt upload failed: ${error.message}`);
  }
  return path;
}

async function pushExpense(expense: LocalExpense, ctx: SyncContext) {
  // AGENTS.md rule 3: an expense without a receipt image must be impossible.
  if (!expense.receiptImageBase64) {
    throw new SyncError('This expense has no receipt photo. Please discard it and add it again with a photo.', undefined, true);
  }

  // D5: only "Current Vehicle" expenses are charged to a vehicle. Driver and
  // company expenses are stored without one so they never reduce partner pay.
  // Entries saved before allocation existed were vehicle expenses.
  const isVehicleExpense = (expense.allocation ?? 'Current Vehicle') === 'Current Vehicle';
  const vehicleId = isVehicleExpense ? (expense.vehicleId ?? ctx.vehicleId) : null;
  if (isVehicleExpense && !vehicleId) {
    throw new SyncError('No vehicle is assigned to you yet. The expense is saved on this phone and will upload once the office assigns a vehicle.');
  }

  const receiptPath = await uploadReceipt(ctx.driverId, expense);

  const payload: InsertExpensePayload & { id: string } = {
    id: expense.id,
    driver_id: ctx.driverId,
    allocation: isVehicleExpense ? 'Vehicle' : expense.allocation === 'Driver' ? 'Driver' : 'Company',
    vehicle_id: vehicleId,
    amount: expense.amount,
    category: expense.category,
    payment_method: expense.paymentSource === 'Cash'
      ? 'Cash'
      : expense.paymentSource === 'Bank Transfer'
      ? 'Transfer'
      : 'Card',
    description: expense.description,
    receipt_image_url: receiptPath,
    expense_date: expense.date,
  };

  const { error } = await createClient()
    .from('expenses')
    .upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw toSyncError(error);

  await applyEditMadeDuringUpload('expenses', expense.id, payload.amount);
}

/**
 * If the driver edited the amount while the upload was in flight, the server
 * has the old amount. Send the edit now (allowed: same-day entries only).
 */
async function applyEditMadeDuringUpload(table: 'rides' | 'expenses', id: string, uploadedAmount: number) {
  const latest = table === 'rides' ? await db.rides.get(id) : await db.expenses.get(id);
  if (latest && latest.amount !== uploadedAmount) {
    await createClient().from(table).update({ amount: latest.amount }).eq('id', id);
  }
}

// ─── Flush ────────────────────────────────────────────────────────────────────

async function flush(ctx: SyncContext, force: boolean): Promise<SyncResult> {
  const result: SyncResult = { ...EMPTY };

  const rides = (await db.rides.where('syncStatus').anyOf('pending', 'failed').toArray())
    .filter((r) => belongsTo(r, ctx.driverId) && isDue(r, force));
  for (const ride of rides) {
    let err: unknown = null;
    try { await pushRide(ride, ctx); } catch (e) { err = e; }
    result[await recordOutcome('rides', ride, err)]++;
  }

  const expenses = (await db.expenses.where('syncStatus').anyOf('pending', 'failed').toArray())
    .filter((e) => belongsTo(e, ctx.driverId) && isDue(e, force));
  for (const expense of expenses) {
    let err: unknown = null;
    try { await pushExpense(expense, ctx); } catch (e) { err = e; }
    result[await recordOutcome('expenses', expense, err)]++;
  }

  return result;
}

/**
 * Upload every entry that is due. Safe to call often and from several tabs:
 * only one tab syncs at a time, and re-sending an entry never duplicates it.
 * @param force retry pending entries now instead of waiting for their back-off.
 */
export async function syncAll(ctx: SyncContext, force = false): Promise<SyncResult> {
  if (!ctx.driverId) return EMPTY;
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('driver-finance-sync', { ifAvailable: true }, (lock) =>
      lock ? flush(ctx, force) : EMPTY,
    );
  }
  return flush(ctx, force);
}

/** Entries not yet on the server, split by whether they will retry by themselves. */
export async function getUnsyncedCounts(): Promise<{ pending: number; failed: number }> {
  const [pendingRides, pendingExpenses, failedRides, failedExpenses] = await Promise.all([
    db.rides.where('syncStatus').equals('pending').count(),
    db.expenses.where('syncStatus').equals('pending').count(),
    db.rides.where('syncStatus').equals('failed').count(),
    db.expenses.where('syncStatus').equals('failed').count(),
  ]);
  return { pending: pendingRides + pendingExpenses, failed: failedRides + failedExpenses };
}

/** Driver tapped "Retry" on a rejected entry (e.g. after the office fixed their vehicle). */
export async function retryEntry(kind: 'ride' | 'expense', id: string) {
  await updateLocal(kind === 'ride' ? 'rides' : 'expenses', id, {
    syncStatus: 'pending', attempts: 0, nextAttemptAt: undefined, lastError: undefined,
  });
}

/** Driver chose to throw away an entry the server rejected. Never used for synced entries. */
export async function discardEntry(kind: 'ride' | 'expense', id: string) {
  const rec = kind === 'ride' ? await db.rides.get(id) : await db.expenses.get(id);
  if (!rec || rec.syncStatus === 'synced') return;
  if (kind === 'ride') await db.rides.delete(id);
  else await db.expenses.delete(id);
}
