import {
  BandStatus,
  PROTOCOL_VERSION,
  StatusReason,
  decodeSummaryPage,
  encodeSummary,
  type StatusPacket,
  type SummaryRecord,
} from '@neobridge/ble-protocol';

import type { BandTransport } from './types';

/**
 * Browser preview only: browsers can't reach the band, so this pretends one is
 * nearby. It is found after a moment, connects, reports green with good skin
 * contact and 82% battery. It starts with 30 minutes of saved readings (as if
 * the phone had been away) and records a new one every 5 seconds — real bands
 * record one a minute.
 */
const PAGE = 12;
const SIM_MINUTE_MS = 5_000;

export function createBandClient(): BandTransport {
  const demo = { id: 'demo-band', name: 'NeoBridge Band (demo)', rssi: -55 };
  let connected = false;
  const disconnectListeners = new Set<() => void>();

  const log: SummaryRecord[] = [];
  const record = (timestamp: number) => {
    const wobble = Math.sin(log.length / 6);
    log.push({
      seq: log.length + 1,
      timestamp,
      skinTempC: Math.round((36.1 + wobble * 0.25) * 100) / 100,
      roomTempC: 24.5,
      contactPct: 95,
      heartRateBpm: Math.round(138 + wobble * 8),
      hrvRmssdMs: Math.round(30 + wobble * 6),
      hrQuality: 82,
      batteryPct: 82,
      status: BandStatus.Green,
      flags: 0,
    });
  };
  const start = Math.floor(Date.now() / 1000) - 30 * 60;
  for (let m = 0; m < 30; m++) record(start + m * 60);
  setInterval(() => record(Math.floor(Date.now() / 1000)), SIM_MINUTE_MS);

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

    async readSummaries(_id, fromSeq) {
      await wait(150);
      // round-trip through the wire format so the preview exercises the real decoder
      const page = log.filter((r) => r.seq >= fromSeq).slice(0, PAGE);
      return decodeSummaryPage(new Uint8Array(page.flatMap((r) => [...encodeSummary(r)])));
    },

    async disconnect() {
      connected = false;
    },
  };
}
