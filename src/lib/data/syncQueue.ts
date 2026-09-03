import { db } from '@/lib/db/dexie';
import { insertRide, InsertRidePayload } from '@/lib/data/rides';
import { insertExpense, uploadReceiptFromBase64, InsertExpensePayload } from '@/lib/data/expenses';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncResult {
  ridesSucceeded: number;
  ridesFailed: number;
  expensesSucceeded: number;
  expensesFailed: number;
}

// ─── Core sync functions ──────────────────────────────────────────────────────

/**
 * Flush all pending rides from IndexedDB to Supabase.
 * Called by the sync worker when connectivity is restored.
 */
export async function flushPendingRides(driverId: string, vehicleId: string): Promise<{ succeeded: number; failed: number }> {
  const pending = await db.rides.where('syncStatus').equals('pending').toArray();
  let succeeded = 0;
  let failed = 0;

  for (const localRide of pending) {
    try {
      const payload: InsertRidePayload = {
        driver_id: driverId,
        vehicle_id: vehicleId,
        amount: localRide.amount,
        payment_method: localRide.revenueType === 'CASH' ? 'Cash' : 'Voucher',
        ride_date: localRide.date,
        reference: localRide.voucherReference,
      };

      await insertRide(payload);
      await db.rides.update(localRide.id, { syncStatus: 'synced' });
      succeeded++;
    } catch (err) {
      console.error(`Failed to sync ride ${localRide.id}:`, err);
      await db.rides.update(localRide.id, { syncStatus: 'failed' });
      failed++;
    }
  }

  return { succeeded, failed };
}

/**
 * Flush all pending expenses from IndexedDB to Supabase.
 * For expenses with a receipt image (base64), upload to Storage first,
 * then insert the expense with the returned storage path as receipt_image_url.
 */
export async function flushPendingExpenses(driverId: string, vehicleId: string): Promise<{ succeeded: number; failed: number }> {
  const pending = await db.expenses.where('syncStatus').equals('pending').toArray();
  let succeeded = 0;
  let failed = 0;

  for (const localExpense of pending) {
    try {
      // AGENTS.md Rule #3: An expense without a receipt image must be impossible.
      // If no receipt image exists, mark this expense as failed rather than using a fake URL.
      if (!localExpense.receiptImageBase64) {
        console.error(`Expense ${localExpense.id} is missing a receipt image. Skipping sync.`);
        await db.expenses.update(localExpense.id, { syncStatus: 'failed' });
        failed++;
        continue;
      }

      const storagePath = await uploadReceiptFromBase64(
        driverId,
        localExpense.date,
        localExpense.receiptImageBase64
      );
      let receiptUrl = storagePath;

      const payload: InsertExpensePayload = {
        driver_id: driverId,
        vehicle_id: localExpense.vehicleId ?? vehicleId,
        amount: localExpense.amount,
        category: localExpense.category,
        payment_method: localExpense.paymentSource === 'Cash'
          ? 'Cash'
          : localExpense.paymentSource === 'Bank Transfer'
          ? 'Transfer'
          : 'Card',
        description: localExpense.description,
        receipt_image_url: receiptUrl,
        expense_date: localExpense.date,
      };

      await insertExpense(payload);
      await db.expenses.update(localExpense.id, { syncStatus: 'synced' });
      succeeded++;
    } catch (err) {
      console.error(`Failed to sync expense ${localExpense.id}:`, err);
      await db.expenses.update(localExpense.id, { syncStatus: 'failed' });
      failed++;
    }
  }

  return { succeeded, failed };
}

/**
 * Main sync entry point. Call this whenever connectivity is detected.
 * Returns a summary of what was synced.
 */
export async function syncAll(driverId: string, vehicleId: string): Promise<SyncResult> {
  const [ridesResult, expensesResult] = await Promise.all([
    vehicleId ? flushPendingRides(driverId, vehicleId) : Promise.resolve({ succeeded: 0, failed: 0 }),
    flushPendingExpenses(driverId, vehicleId),
  ]);

  return {
    ridesSucceeded: ridesResult.succeeded,
    ridesFailed: ridesResult.failed,
    expensesSucceeded: expensesResult.succeeded,
    expensesFailed: expensesResult.failed,
  };
}

/**
 * Get the count of records waiting to be synced.
 * Used to show the offline queue indicator in the driver UI.
 */
export async function getPendingCount(): Promise<number> {
  const [rides, expenses] = await Promise.all([
    db.rides.where('syncStatus').equals('pending').count(),
    db.expenses.where('syncStatus').equals('pending').count(),
  ]);
  return rides + expenses;
}

/**
 * Register a network listener to auto-sync when coming back online.
 * Call this once on app mount in the driver layout.
 */
export function registerOnlineListener(driverId: string, vehicleId: string): () => void {
  const handler = () => {
    syncAll(driverId, vehicleId).then((result) => {
      if (result.ridesSucceeded + result.expensesSucceeded > 0) {
        console.log(`[Sync] Synced ${result.ridesSucceeded} rides and ${result.expensesSucceeded} expenses.`);
      }
    });
  };

  window.addEventListener('online', handler);
  // Return cleanup function
  return () => window.removeEventListener('online', handler);
}
