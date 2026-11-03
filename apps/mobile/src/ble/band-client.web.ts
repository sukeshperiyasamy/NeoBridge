import { BandStatus, PROTOCOL_VERSION, StatusReason, type StatusPacket } from '@neobridge/ble-protocol';

import type { BandTransport } from './types';

/**
 * Browser preview only: browsers can't reach the band, so this pretends one is
 * nearby. It is found after a moment, connects, reports green with good skin
 * contact and 82% battery.
 */
export function createBandClient(): BandTransport {
  const demo = { id: 'demo-band', name: 'NeoBridge Band (demo)', rssi: -55 };
  let connected = false;
  const disconnectListeners = new Set<() => void>();

  const status = (): StatusPacket => ({
    version: PROTOCOL_VERSION,
    status: BandStatus.Green,
    reason: StatusReason.None,
    contactPct: 96,
    timestamp: Math.floor(Date.now() / 1000),
  });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    bluetoothState: async () => 'on',
    requestPermissions: async () => true,

    scan(onFound, timeoutMs, onDone) {
      const found = setTimeout(() => onFound(demo), 1200);
      const done = setTimeout(onDone, Math.min(timeoutMs, 2500));
      return () => {
        clearTimeout(found);
        clearTimeout(done);
        onDone();
      };
    },

    async connect() {
      await wait(900);
      connected = true;
    },

    isConnected: async () => connected,

    onDisconnected(_id, listener) {
      disconnectListeners.add(listener);
      return () => disconnectListeners.delete(listener);
    },

    onStatus(_id, listener) {
      const timer = setInterval(() => connected && listener(status()), 2000);
      return () => clearInterval(timer);
    },

    readStatus: async () => status(),
    readBattery: async () => 82,

    async disconnect() {
      connected = false;
    },
  };
}
