/**
 * sync-engine.ts
 * 
 * The central sync engine for the Driver app.
 * 
 * Responsibilities:
 *  1. On mount: immediately flush all 'pending' Dexie records to Supabase.
 *  2. On reconnect (window 'online' event): flush again automatically.
 *  3. On new Dexie write: re-trigger flush (catches records added while online).
 *  4. After flush: atomically upload receipt images then insert expense records.
 *  5. Register Background Sync tags so the browser can retry even when the app is closed.
 *
 * Usage: call startSyncEngine(driverId, vehicleId) once from the Driver layout.
 * The returned stop() function tears everything down on unmount.
 */

import { db } from '@/lib/db/dexie';
import { syncAll } from '@/lib/data/syncQueue';

export interface SyncState {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

type SyncStateListener = (state: SyncState) => void;

// ─── Singleton state ──────────────────────────────────────────────────────────

let _state: SyncState = {
  pendingCount: 0,
  isSyncing: false,
  lastSyncedAt: null,
  lastError: null,
};

const _listeners = new Set<SyncStateListener>();

function setState(patch: Partial<SyncState>) {
  _state = { ..._state, ...patch };
  _listeners.forEach((fn) => fn(_state));
}

export function getState(): SyncState {
  return _state;
}

export function subscribeSyncState(fn: SyncStateListener): () => void {
  _listeners.add(fn);
  fn(_state); // immediately call with current state
  return () => _listeners.delete(fn);
}

// ─── Pending count refresh ────────────────────────────────────────────────────

async function refreshPendingCount() {
  const [rides, expenses] = await Promise.all([
    db.rides.where('syncStatus').equals('pending').count(),
    db.expenses.where('syncStatus').equals('pending').count(),
  ]);
  setState({ pendingCount: rides + expenses });
}

// ─── Core flush logic ─────────────────────────────────────────────────────────

let _isSyncRunning = false;
let _driverId = '';
let _vehicleId = '';

export async function runSync() {
  if (_isSyncRunning || !_driverId) return;
  if (!navigator.onLine) {
    await refreshPendingCount();
    return;
  }

  _isSyncRunning = true;
  setState({ isSyncing: true, lastError: null });

  try {
    const result = await syncAll(_driverId, _vehicleId);
    const total = result.ridesSucceeded + result.expensesSucceeded;
    const failed = result.ridesFailed + result.expensesFailed;

    await refreshPendingCount();

    setState({
      isSyncing: false,
      lastSyncedAt: total > 0 ? new Date() : _state.lastSyncedAt,
      lastError: failed > 0 ? `${failed} record(s) failed to sync. Retrying…` : null,
    });
  } catch (err) {
    await refreshPendingCount();
    setState({
      isSyncing: false,
      lastError: 'Sync error. Will retry on next connection.',
    });
    console.error('[SyncEngine] Unexpected error:', err);
  } finally {
    _isSyncRunning = false;
  }
}

// ─── Background Sync registration ─────────────────────────────────────────────

async function registerBackgroundSync() {
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      // @ts-expect-error — SyncManager types not always in TS lib
      await registration.sync.register('sync-pending-rides');
      // @ts-expect-error
      await registration.sync.register('sync-pending-expenses');
    }
  } catch {
    // Background Sync not supported; online listener handles it
  }
}

// ─── Dexie change watcher ─────────────────────────────────────────────────────
// Dexie v3 doesn't expose db.on('changes') as a subscribe/unsubscribe pattern
// in all environments. Instead we poll the pending count on a short interval
// (250ms) and debounce a sync attempt whenever the count increases.
// This is cheap: the query just counts indexed rows.

function watchDexieChanges(): () => void {
  let lastCount = 0;

  const intervalId = window.setInterval(async () => {
    const [rides, expenses] = await Promise.all([
      db.rides.where('syncStatus').equals('pending').count(),
      db.expenses.where('syncStatus').equals('pending').count(),
    ]);
    const count = rides + expenses;
    setState({ pendingCount: count });

    if (count > lastCount) {
      // New pending records appeared — debounce a sync
      clearTimeout(_debounceTimer);
      _debounceTimer = window.setTimeout(() => runSync(), 800);
    }
    lastCount = count;
  }, 5000);

  return () => window.clearInterval(intervalId);
}

let _debounceTimer: number;


// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the sync engine. Call once from the Driver layout's useEffect.
 * @returns stop — call this in the layout's useEffect cleanup to teardown.
 */
export function startSyncEngine(driverId: string, vehicleId: string): () => void {
  _driverId = driverId;
  _vehicleId = vehicleId;

  // 1. Initial flush
  refreshPendingCount().then(() => runSync());

  // 2. Reconnect listener
  const onOnline = () => {
    runSync();
    registerBackgroundSync();
  };
  window.addEventListener('online', onOnline);

  // 3. Dexie change watcher
  const stopDexieWatch = watchDexieChanges();

  // 4. Background sync registration (best-effort)
  registerBackgroundSync();

  return () => {
    window.removeEventListener('online', onOnline);
    stopDexieWatch();
    clearTimeout(_debounceTimer);
  };
}
