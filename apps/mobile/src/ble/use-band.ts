import { useSyncExternalStore } from 'react';

import { getBandController, type BandState } from './band-controller';

/** Live band state plus the controller for pairing / troubleshooting actions. */
export function useBand(): [BandState, ReturnType<typeof getBandController>] {
  const controller = getBandController();
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  return [state, controller];
}
