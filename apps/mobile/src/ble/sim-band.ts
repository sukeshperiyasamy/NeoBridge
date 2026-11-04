import {
  BandStatus,
  PROTOCOL_VERSION,
  ReadingFlag,
  StatusReason,
  decodeReading,
  decodeSummaryPage,
  encodeReading,
  encodeSummary,
  type LiveReading,
  type StatusPacket,
  type SummaryRecord,
} from '@neobridge/ble-protocol';

import type { BandTransport } from './types';

/**
 * A pretend band, so the demo never depends on the hardware (PRD summary #5).
 * Works on phones and in the browser preview. It sends a live reading every
 * 5 s (the real band: 30 s) and acts out a scenario the demo picks.
 */
export const SIM_BAND = { id: 'demo-band', name: 'NeoBridge Band (demo)', rssi: -55 } as const;

export type SimScenario = 'normal' | 'cooling' | 'veryCold' | 'hot' | 'offBody' | 'lowBattery';
export const simScenarios: SimScenario[] = ['normal', 'cooling', 'veryCold', 'hot', 'offBody', 'lowBattery'];

const READING_MS = 5_000;
const SUMMARY_EVERY = 6; // one summary per 6 readings = 30 s of demo time
const PAGE = 12;

/** Skin temperature each scenario drifts towards, °C, and how fast per reading. */
const target: Record<SimScenario, { skin: number; step: number }> = {
  normal: { skin: 36.5, step: 0.3 },
  cooling: { skin: 35.0, step: 0.15 },
  veryCold: { skin: 34.0, step: 0.5 },
  hot: { skin: 38.3, step: 0.4 },
  offBody: { skin: 36.5, step: 0.3 },
  lowBattery: { skin: 36.5, step: 0.3 },
};

export interface SimBand extends BandTransport {
  setScenario(s: SimScenario): void;
  scenario(): SimScenario;
}

export function createSimBand(): SimBand {
  let connected = false;
  let scenario: SimScenario = 'normal';
  let skin = 36.5;
  let pattern = BandStatus.Grey;
  const disconnectListeners = new Set<() => void>();
  const readingListeners = new Set<(r: LiveReading) => void>();
  const log: SummaryRecord[] = [];
  let tick = 0;

  const reading = (): LiveReading => {
    const t = target[scenario];
    skin += Math.max(-t.step, Math.min(t.step, t.skin - skin));
    const wobble = Math.sin(tick / 3) * 0.05;
    const off = scenario === 'offBody';
    return {
      timestamp: Math.floor(Date.now() / 1000),
      skinTempC: off ? null : Math.round((skin + wobble) * 100) / 100,
      roomTempC: 24.5,
      contactPct: off ? 0 : 95,
      heartRateBpm: off ? null : Math.round(138 + Math.sin(tick / 5) * 8),
      batteryPct: scenario === 'lowBattery' ? 8 : 82,
      flags: off ? ReadingFlag.NoContact : 0,
    };
  };

  const record = (r: LiveReading) => {
    log.push({
      // seq grows with time, so it keeps increasing across app restarts like
      // the real band's (which persists it), and the server never sees a repeat
      seq: Math.floor(r.timestamp / 30),
      timestamp: r.timestamp,
      skinTempC: r.skinTempC,
      roomTempC: r.roomTempC,
      contactPct: r.contactPct,
      heartRateBpm: r.heartRateBpm,
      hrvRmssdMs: r.heartRateBpm ? Math.round(30 + Math.sin(tick / 6) * 6) : null,
      hrQuality: r.heartRateBpm ? 82 : 0,
      batteryPct: r.batteryPct,
      status: pattern,
      flags: r.flags,
    });
  };

  // 30 minutes of saved readings, as if the phone had been away
  const start = Math.floor(Date.now() / 1000) - 30 * 60;
  for (let m = 0; m < 30; m++) record({ ...reading(), timestamp: start + m * 60 });

  setInterval(() => {
    tick += 1;
    // round-trip through the wire format so the demo exercises the real decoder
    const r = decodeReading(encodeReading(reading()));
    if (tick % SUMMARY_EVERY === 0) record(r);
    if (connected) readingListeners.forEach((l) => l(r));
  }, READING_MS);

  const status = (): StatusPacket => ({
    version: PROTOCOL_VERSION,
    status: pattern,
    reason: StatusReason.None,
    contactPct: scenario === 'offBody' ? 0 : 95,
    timestamp: Math.floor(Date.now() / 1000),
  });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    setScenario: (s) => {
      scenario = s;
    },
    scenario: () => scenario,

    bluetoothState: async () => 'on',
    requestPermissions: async () => true,

    scan(onFound, timeoutMs, onDone) {
      const found = setTimeout(() => onFound({ ...SIM_BAND }), 1200);
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

    onReading(_id, listener) {
      readingListeners.add(listener);
      return () => readingListeners.delete(listener);
    },

    readStatus: async () => status(),
    readBattery: async () => (scenario === 'lowBattery' ? 8 : 82),

    async readSummaries(_id, fromSeq) {
      await wait(150);
      const page = log.filter((r) => r.seq >= fromSeq).slice(0, PAGE);
      return decodeSummaryPage(new Uint8Array(page.flatMap((r) => [...encodeSummary(r)])));
    },

    testBuzz: async () => undefined,
    setTime: async () => undefined,
    setStatus: async (_id, s) => {
      pattern = s;
    },
    ackRed: async () => undefined,

    async disconnect() {
      connected = false;
    },
  };
}
