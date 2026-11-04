import type { BandTransport } from './types';
import { createSimBand } from './sim-band';

// Browsers can't reach the band, so the browser preview only has the demo band.
export function createBandClient(): BandTransport {
  return createSimBand();
}
