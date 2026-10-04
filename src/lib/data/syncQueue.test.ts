import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, type LocalRide, type LocalExpense } from '@/lib/db/dexie';
import { syncAll, retryEntry, discardEntry, getUnsyncedCounts } from '@/lib/data/syncQueue';

// ─── Fake Supabase: records what the app sends, fails on demand ──────────────
const server = vi.hoisted(() => ({
  existing: new Set<string>(),
  upserts: [] as { table: string; payload: Record<string, unknown> }[],
  uploads: [] as string[],
  updates: [] as { table: string; values: Record<string, unknown>; id: string }[],
  upsertError: null as null | { message: string; code?: string },
  uploadError: null as null | { message: string },
  /** Simulate a lost response: the row is stored but the app gets an error. */
  storeDespiteError: false,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      upsert: async (payload: Record<string, unknown>) => {
        server.upserts.push({ table, payload });
        if (server.upsertError) {
          if (server.storeDespiteError) server.existing.add(payload.id as string);
          return { error: server.upsertError };
        }
        server.existing.add(payload.id as string);
        return { error: null };
      },
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({ data: server.existing.has(id) ? { id } : null }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          server.updates.push({ table, values, id });
          return { error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          server.uploads.push(path);
          return { error: server.uploadError };
        },
      }),
    },
  }),
}));

const ctx = { driverId: 'driver-1', vehicleId: 'vehicle-current' };
const RECEIPT = `data:image/jpeg;base64,${btoa('fake-jpeg-bytes')}`;

const ride = (over: Partial<LocalRide> = {}): LocalRide => ({
  id: crypto.randomUUID(),
  date: '2026-10-04',
  amount: 100,
  revenueType: 'CASH',
  paymentStatus: 'Received',
  syncStatus: 'pending',
  createdAt: Date.now(),
  ...over,
});

const expense = (over: Partial<LocalExpense> = {}): LocalExpense => ({
  id: crypto.randomUUID(),
  date: '2026-10-04',
  amount: 40,
  category: 'Fuel',
  allocation: 'Current Vehicle',
  paymentSource: 'Cash',
  receiptImageBase64: RECEIPT,
  syncStatus: 'pending',
  createdAt: Date.now(),
  ...over,
});

beforeEach(async () => {
  await Promise.all([db.rides.clear(), db.expenses.clear(), db.payers.clear(), db.cashHandovers.clear()]);
  server.existing.clear();
  server.upserts.length = 0;
  server.uploads.length = 0;
  server.updates.length = 0;
  server.upsertError = null;
  server.uploadError = null;
  server.storeDespiteError = false;
});

describe('rides', () => {
  it('uploads with the local id and the vehicle recorded at entry time', async () => {
    const r = ride({ driverId: 'driver-1', vehicleId: 'vehicle-at-entry' });
    await db.rides.add(r);

    const result = await syncAll(ctx);

    expect(result).toEqual({ synced: 1, retrying: 0, rejected: 0 });
    expect(server.upserts[0].payload).toMatchObject({
      id: r.id, driver_id: 'driver-1', vehicle_id: 'vehicle-at-entry', payment_method: 'Cash', payment_status: 'Received',
    });
    expect((await db.rides.get(r.id))?.syncStatus).toBe('synced');
  });

  it('sends the server payer id, or only the name for payers added on the phone', async () => {
    await db.payers.bulkAdd([
      { id: 'payer-server', name: 'Hotel Group', type: 'Organization', createdAt: 0, source: 'server' },
      { id: 'payer-local', name: 'New Agency', type: 'Organization', createdAt: 0 },
    ]);
    const a = ride({ revenueType: 'VOUCHER', paymentStatus: 'Outstanding', payerId: 'payer-server' });
    const b = ride({ revenueType: 'VOUCHER', paymentStatus: 'Outstanding', payerId: 'payer-local' });
    await db.rides.bulkAdd([a, b]);

    await syncAll(ctx);

    const sent = Object.fromEntries(server.upserts.map(u => [u.payload.id, u.payload]));
    expect(sent[a.id]).toMatchObject({ payer_id: 'payer-server', payer_name: 'Hotel Group', payment_status: 'Outstanding' });
    expect(sent[b.id]).toMatchObject({ payer_id: null, payer_name: 'New Agency' });
  });

  it('keeps a ride pending and backs off after a temporary error', async () => {
    const r = ride();
    await db.rides.add(r);
    server.upsertError = { message: 'Failed to fetch' };

    expect(await syncAll(ctx)).toEqual({ synced: 0, retrying: 1, rejected: 0 });
    const stored = await db.rides.get(r.id);
    expect(stored).toMatchObject({ syncStatus: 'pending', attempts: 1, lastError: 'Failed to fetch' });
    expect(stored!.nextAttemptAt).toBeGreaterThan(Date.now());

    // Not due yet: no second upload attempt.
    server.upsertError = null;
    await syncAll(ctx);
    expect(server.upserts).toHaveLength(1);

    // Reconnect forces a retry, which now succeeds.
    expect(await syncAll(ctx, true)).toEqual({ synced: 1, retrying: 0, rejected: 0 });
    expect((await db.rides.get(r.id))?.syncStatus).toBe('synced');
  });

  it('marks a ride failed with the server reason when a rule rejects it, and retries only on request', async () => {
    const r = ride();
    await db.rides.add(r);
    server.upsertError = { message: 'Entries older than 7 days cannot be added', code: '23514' };

    expect(await syncAll(ctx)).toEqual({ synced: 0, retrying: 0, rejected: 1 });
    expect(await db.rides.get(r.id)).toMatchObject({ syncStatus: 'failed', lastError: 'Entries older than 7 days cannot be added' });

    await syncAll(ctx, true);
    expect(server.upserts).toHaveLength(1); // rejected entries are not retried automatically

    server.upsertError = null;
    await retryEntry('ride', r.id);
    await syncAll(ctx);
    expect((await db.rides.get(r.id))?.syncStatus).toBe('synced');
  });

  it('treats a lost response as success when the ride is on the server', async () => {
    const r = ride();
    await db.rides.add(r);
    server.upsertError = { message: 'network timeout' };
    server.storeDespiteError = true;

    expect(await syncAll(ctx)).toEqual({ synced: 1, retrying: 0, rejected: 0 });
    expect((await db.rides.get(r.id))?.syncStatus).toBe('synced');
  });

  it('never uploads another driver\'s entries, but uploads untagged older entries', async () => {
    const mine = ride({ driverId: 'driver-1' });
    const theirs = ride({ driverId: 'driver-2' });
    const legacy = ride();
    await db.rides.bulkAdd([mine, theirs, legacy]);

    await syncAll(ctx);

    const sent = server.upserts.map(u => u.payload.id);
    expect(sent).toEqual(expect.arrayContaining([mine.id, legacy.id]));
    expect(sent).not.toContain(theirs.id);
    expect((await db.rides.get(theirs.id))?.syncStatus).toBe('pending');
  });

  it('retries "failed" entries left by older app versions once', async () => {
    const r = ride({ syncStatus: 'failed' }); // no lastError = old engine
    await db.rides.add(r);

    expect(await syncAll(ctx)).toEqual({ synced: 1, retrying: 0, rejected: 0 });
  });

  it('waits with a clear message when no vehicle is assigned', async () => {
    const r = ride();
    await db.rides.add(r);

    expect(await syncAll({ driverId: 'driver-1', vehicleId: null })).toEqual({ synced: 0, retrying: 1, rejected: 0 });
    expect(server.upserts).toHaveLength(0);
    expect((await db.rides.get(r.id))?.lastError).toMatch(/No vehicle is assigned/);
  });

  it('sends an amount edited while the upload was in flight', async () => {
    const r = ride({ amount: 100 });
    await db.rides.add(r);
    const realUpsert = server.upserts.push.bind(server.upserts);
    server.upserts.push = (...items) => {
      void db.rides.update(r.id, { amount: 120 }); // driver edits mid-upload
      return realUpsert(...items);
    };

    await syncAll(ctx);
    server.upserts.push = realUpsert;

    expect(server.updates).toContainEqual({ table: 'rides', values: { amount: 120 }, id: r.id });
  });
});

describe('expenses', () => {
  it('stores driver and company expenses without a vehicle (D5)', async () => {
    const driverExp = expense({ allocation: 'Driver' });
    const companyExp = expense({ allocation: 'Other / Company' });
    const vehicleExp = expense({ allocation: 'Current Vehicle', vehicleId: 'vehicle-at-entry' });
    await db.expenses.bulkAdd([driverExp, companyExp, vehicleExp]);

    await syncAll(ctx);

    const sent = Object.fromEntries(server.upserts.map(u => [u.payload.id, u.payload]));
    expect(sent[driverExp.id]).toMatchObject({ allocation: 'Driver', vehicle_id: null });
    expect(sent[companyExp.id]).toMatchObject({ allocation: 'Company', vehicle_id: null });
    expect(sent[vehicleExp.id]).toMatchObject({ allocation: 'Vehicle', vehicle_id: 'vehicle-at-entry' });
  });

  it('uploads the receipt to a fixed path, so retries reuse the same photo', async () => {
    const e = expense();
    await db.expenses.add(e);
    server.uploadError = { message: 'The resource already exists' }; // uploaded on an earlier attempt

    expect(await syncAll(ctx)).toEqual({ synced: 1, retrying: 0, rejected: 0 });
    const path = `driver-1/2026-10-04/${e.id}.jpg`;
    expect(server.uploads).toEqual([path]);
    expect(server.upserts[0].payload.receipt_image_url).toBe(path);
  });

  it('does not insert the expense when the receipt upload fails', async () => {
    const e = expense();
    await db.expenses.add(e);
    server.uploadError = { message: 'Payload too large' };

    expect(await syncAll(ctx)).toEqual({ synced: 0, retrying: 1, rejected: 0 });
    expect(server.upserts).toHaveLength(0);
  });

  it('rejects an expense with no receipt photo', async () => {
    const e = expense({ receiptImageBase64: undefined });
    await db.expenses.add(e);

    expect(await syncAll(ctx)).toEqual({ synced: 0, retrying: 0, rejected: 1 });
    expect(server.uploads).toHaveLength(0);
    expect((await db.expenses.get(e.id))?.syncStatus).toBe('failed');
  });
});

describe('cash handovers', () => {
  it('uploads a handover with its own id, so re-sending cannot duplicate it', async () => {
    await db.cashHandovers.add({
      id: 'handover-1', date: '2026-10-04', amount: 3000, handedTo: 'Office manager',
      reference: 'R-1', syncStatus: 'pending', createdAt: Date.now(), driverId: 'driver-1', vehicleId: 'vehicle-at-entry',
    });

    expect(await syncAll(ctx)).toEqual({ synced: 1, retrying: 0, rejected: 0 });
    expect(server.upserts[0]).toMatchObject({
      table: 'cash_handovers',
      payload: { id: 'handover-1', driver_id: 'driver-1', vehicle_id: 'vehicle-at-entry', amount: 3000, handover_date: '2026-10-04', reference: 'R-1' },
    });
    expect((await db.cashHandovers.get('handover-1'))?.syncStatus).toBe('synced');
  });

  it('keeps a rejected handover with the reason, and counts it', async () => {
    await db.cashHandovers.add({
      id: 'handover-2', date: '2026-09-01', amount: 500, handedTo: 'Office', syncStatus: 'pending', createdAt: Date.now(),
    });
    server.upsertError = { message: 'Handovers older than 7 days cannot be added from the app.', code: '23514' };

    expect(await syncAll(ctx)).toEqual({ synced: 0, retrying: 0, rejected: 1 });
    expect(await db.cashHandovers.get('handover-2')).toMatchObject({ syncStatus: 'failed' });
    expect(await getUnsyncedCounts()).toEqual({ pending: 0, failed: 1 });
  });
});

describe('local entry management', () => {
  it('discard removes rejected entries but never synced ones', async () => {
    const rejected = ride({ syncStatus: 'failed', lastError: 'rule' });
    const synced = ride({ syncStatus: 'synced' });
    await db.rides.bulkAdd([rejected, synced]);

    await discardEntry('ride', rejected.id);
    await discardEntry('ride', synced.id);

    expect(await db.rides.get(rejected.id)).toBeUndefined();
    expect(await db.rides.get(synced.id)).toBeDefined();
  });

  it('counts pending and rejected entries separately', async () => {
    await db.rides.bulkAdd([ride(), ride({ syncStatus: 'failed', lastError: 'x' }), ride({ syncStatus: 'synced' })]);
    await db.expenses.add(expense());

    expect(await getUnsyncedCounts()).toEqual({ pending: 2, failed: 1 });
  });
});
