import AsyncStorage from '@react-native-async-storage/async-storage';

import { StatusReason, type StatusPacket } from '@neobridge/ble-protocol';

import { createBandClient } from './band-client';
import type { BandTransport, FoundBand } from './types';

export type BandPhase = 'loading' | 'unpaired' | 'connecting' | 'connected' | 'reconnecting';

export type CheckKey = 'bluetooth' | 'permission' | 'nearby' | 'connect' | 'battery' | 'contact';
export type CheckResult = 'pending' | 'checking' | 'pass' | 'fail' | 'skipped';
export const checkOrder: CheckKey[] = ['bluetooth', 'permission', 'nearby', 'connect', 'battery', 'contact'];

export interface BandState {
  phase: BandPhase;
  /** the band this phone stays paired to, remembered across restarts */
  paired: FoundBand | null;
  scanning: boolean;
  found: FoundBand[];
  status: StatusPacket | null;
  battery: number | null;
  /** last time the band was heard from, ms */
  lastSeen: number | null;
  checks: Record<CheckKey, CheckResult> | null;
}

const STORAGE_KEY = 'neobridge.pairedBand';
const RETRY_SECONDS = [3, 10, 30, 60];
export const LOW_BATTERY = 20;
const GOOD_CONTACT = 60;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * Owns the Bluetooth link to the baby's band: pairing, staying connected
 * (automatic reconnect with backoff), live status and the troubleshooting
 * checks. Lives outside React; screens read it through useBand().
 */
class BandController {
  private transport: BandTransport = createBandClient();
  private listeners = new Set<() => void>();
  private linkSubs: (() => void)[] = [];
  private stopScan: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  private state: BandState = {
    phase: 'loading',
    paired: null,
    scanning: false,
    found: [],
    status: null,
    battery: null,
    lastSeen: null,
    checks: null,
  };

  constructor() {
    void this.restore();
  }

  getState = (): BandState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<BandState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private async restore() {
    const saved = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    if (!saved) return this.set({ phase: 'unpaired' });
    this.set({ paired: JSON.parse(saved) as FoundBand, phase: 'connecting' });
    void this.connect();
  }

  // ---- pairing ---------------------------------------------------------

  async startScan() {
    this.stopScan?.();
    await this.transport.requestPermissions();
    this.set({ scanning: true, found: [] });
    this.stopScan = this.transport.scan(
      (band) => {
        const others = this.state.found.filter((b) => b.id !== band.id);
        const found = [...others, band].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
        this.set({ found });
      },
      10_000,
      () => {
        this.stopScan = null;
        this.set({ scanning: false });
      },
    );
  }

  async pair(band: FoundBand) {
    this.stopScan?.();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(band)).catch(() => undefined);
    this.set({ paired: band, phase: 'connecting', found: [], checks: null });
    this.attempt = 0;
    void this.connect();
  }

  async forget() {
    const id = this.state.paired?.id;
    this.clearLink();
    if (id) await this.transport.disconnect(id);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    this.set({ paired: null, phase: 'unpaired', status: null, battery: null, lastSeen: null, checks: null });
  }

  // ---- staying connected ---------------------------------------------------

  private clearLink() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.linkSubs.forEach((unsub) => unsub());
    this.linkSubs = [];
  }

  private async connect() {
    const band = this.state.paired;
    if (!band) return;
    this.clearLink();
    try {
      await this.transport.connect(band.id);
      if (this.state.paired?.id !== band.id) return; // forgotten meanwhile
      this.attempt = 0;
      this.set({ phase: 'connected', lastSeen: Date.now() });
      this.linkSubs.push(
        this.transport.onStatus(band.id, (status) => this.set({ status, lastSeen: Date.now() })),
        this.transport.onDisconnected(band.id, () => this.lost()),
      );
      void this.refresh();
    } catch {
      this.lost();
    }
  }

  private lost() {
    if (!this.state.paired) return;
    this.clearLink();
    this.set({ phase: 'reconnecting' });
    const delay = RETRY_SECONDS[Math.min(this.attempt, RETRY_SECONDS.length - 1)];
    this.attempt += 1;
    this.retryTimer = setTimeout(() => void this.connect(), delay * 1000);
  }

  /** Reconnect now instead of waiting for the next retry. */
  reconnectNow() {
    if (this.state.phase === 'connected' || !this.state.paired) return;
    this.attempt = 0;
    this.set({ phase: 'connecting' });
    void this.connect();
  }

  private async refresh() {
    const id = this.state.paired?.id;
    if (!id) return;
    const [status, battery] = await Promise.allSettled([
      this.transport.readStatus(id),
      this.transport.readBattery(id),
    ]);
    this.set({
      status: status.status === 'fulfilled' ? status.value : this.state.status,
      battery: battery.status === 'fulfilled' ? battery.value : this.state.battery,
    });
  }

  // ---- troubleshooting -------------------------------------------------------

  async runChecks() {
    const checks = Object.fromEntries(checkOrder.map((k) => [k, 'pending'])) as Record<CheckKey, CheckResult>;
    const mark = (key: CheckKey, result: CheckResult) => {
      checks[key] = result;
      this.set({ checks: { ...checks } });
    };
    const skipRest = (from: CheckKey) => {
      checkOrder.slice(checkOrder.indexOf(from) + 1).forEach((k) => mark(k, 'skipped'));
    };

    const steps: [CheckKey, () => Promise<boolean>][] = [
      ['bluetooth', async () => (await this.transport.bluetoothState()) === 'on'],
      ['permission', () => this.transport.requestPermissions()],
      ['nearby', () => this.findPairedNearby()],
      ['connect', () => this.ensureConnected()],
      ['battery', async () => {
        const id = this.state.paired!.id;
        const battery = await this.transport.readBattery(id);
        this.set({ battery });
        return battery >= LOW_BATTERY;
      }],
      ['contact', async () => {
        const status = await this.transport.readStatus(this.state.paired!.id);
        this.set({ status, lastSeen: Date.now() });
        const loose = status.reason === StatusReason.LooseBand || status.reason === StatusReason.NoSkinContact;
        return !loose && status.contactPct >= GOOD_CONTACT;
      }],
    ];

    this.set({ checks: { ...checks } });
    for (const [key, run] of steps) {
      mark(key, 'checking');
      let ok = false;
      try {
        ok = await withTimeout(run(), 15_000);
      } catch {
        ok = false;
      }
      mark(key, ok ? 'pass' : 'fail');
      if (!ok) return skipRest(key);
    }
  }

  private async findPairedNearby(): Promise<boolean> {
    const paired = this.state.paired;
    if (!paired) return false;
    if (await this.transport.isConnected(paired.id).catch(() => false)) return true;
    return new Promise((resolve) => {
      let seen = false;
      const stop = this.transport.scan(
        (band) => {
          if (band.id === paired.id && !seen) {
            seen = true;
            stop();
          }
        },
        8_000,
        () => resolve(seen),
      );
    });
  }

  private async ensureConnected(): Promise<boolean> {
    const paired = this.state.paired;
    if (!paired) return false;
    if (this.state.phase === 'connected') return true;
    await this.connect();
    // connect() updates the state, so read it again rather than the narrowed value
    return this.getState().phase === 'connected';
  }
}

let controller: BandController | null = null;

/** One controller per app, created the first time a screen needs the band. */
export function getBandController(): BandController {
  controller ??= new BandController();
  return controller;
}
