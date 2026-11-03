import { useSyncExternalStore } from 'react';

import { getSyncEngine, type SyncState } from './sync-engine';

/** Upload status for the screen, plus the engine for "Upload now". */
export function useSync(): [SyncState, ReturnType<typeof getSyncEngine>] {
  const engine = getSyncEngine();
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  return [state, engine];
}
