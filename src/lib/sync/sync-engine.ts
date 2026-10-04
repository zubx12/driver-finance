/**
 * sync-engine.ts
 *
 * Runs the driver app's background sync (the upload logic is in syncQueue.ts).
 *
 *  1. On start: upload everything that is due.
 *  2. On reconnect (window 'online'): upload again, ignoring retry back-off.
 *  3. Every 15 seconds: pick up new entries and retries whose back-off ended.
 *  4. Publishes counts for the status banner: pending (will retry by itself)
 *     and failed (rejected by the server; the driver must act).
 *
 * Usage: call startSyncEngine(driverId, vehicleId) once from the Driver layout.
 * The returned stop() function tears everything down on unmount.
 */

import { syncAll, getUnsyncedCounts, type SyncContext } from '@/lib/data/syncQueue';

export interface SyncState {
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

type SyncStateListener = (state: SyncState) => void;

// ─── Singleton state ──────────────────────────────────────────────────────────

let _state: SyncState = {
  pendingCount: 0,
  failedCount: 0,
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

async function refreshCounts() {
  const { pending, failed } = await getUnsyncedCounts();
  setState({ pendingCount: pending, failedCount: failed });
}

// ─── Core ─────────────────────────────────────────────────────────────────────

let _isSyncRunning = false;
let _ctx: SyncContext = { driverId: '', vehicleId: null };

/** Upload what is due. `force` skips retry back-off (reconnect, manual retry). */
export async function runSync(force = false) {
  if (_isSyncRunning || !_ctx.driverId) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await refreshCounts();
    return;
  }

  _isSyncRunning = true;
  setState({ isSyncing: true });

  try {
    const result = await syncAll(_ctx, force);
    await refreshCounts();
    setState({
      isSyncing: false,
      lastSyncedAt: result.synced > 0 ? new Date() : _state.lastSyncedAt,
      lastError: result.retrying > 0
        ? `${result.retrying} record(s) could not upload yet. Retrying automatically…`
        : null,
    });
  } catch (err) {
    await refreshCounts();
    setState({ isSyncing: false, lastError: 'Sync error. Will retry automatically.' });
    console.error('[SyncEngine] Unexpected error:', err);
  } finally {
    _isSyncRunning = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const TICK_MS = 15_000;

/**
 * Start the sync engine. Call once from the Driver layout's useEffect.
 * Works without a vehicle: entries stay on the phone with a clear message.
 * @returns stop — call this in the layout's useEffect cleanup to teardown.
 */
export function startSyncEngine(driverId: string, vehicleId: string | null): () => void {
  _ctx = { driverId, vehicleId };

  refreshCounts().then(() => runSync());

  const onOnline = () => runSync(true);
  window.addEventListener('online', onOnline);

  const intervalId = window.setInterval(() => {
    refreshCounts().then(() => {
      if (_state.pendingCount > 0) runSync();
    });
  }, TICK_MS);

  return () => {
    window.removeEventListener('online', onOnline);
    window.clearInterval(intervalId);
  };
}
