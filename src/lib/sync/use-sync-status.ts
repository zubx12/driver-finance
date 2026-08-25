/**
 * use-sync-status.ts
 *
 * React hook that subscribes to the singleton SyncEngine state and
 * exposes it for UI consumption (SyncStatusBanner, status badges, etc.)
 */

'use client';

import { useState, useEffect } from 'react';
import { subscribeSyncState, getState, SyncState } from './sync-engine';

export function useSyncStatus(): SyncState {
  const [state, setState] = useState<SyncState>(getState);

  useEffect(() => {
    // Subscribe returns an unsubscribe function
    return subscribeSyncState(setState);
  }, []);

  return state;
}
