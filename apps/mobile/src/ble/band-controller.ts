import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

import { BandStatus, ReadingFlag, type LiveReading, type StatusPacket } from '@neobridge/ble-protocol';
import {
  acknowledge,
  closeEpisode,
  defaultConfig,
  demoConfig,
  evaluate,
  initialState as initialRules,
  type Episode,
  type Reason,
  type RuleReading,
  type RulesState,
  type Status,
} from '@neobridge/rules';

import { getSyncEngine } from '@/sync/sync-engine';

import { createBandClient } from './band-client';
import { combineTransports, getSerialBand } from './serial-band';
import { SIM_BAND, createSimBand, type SimBand, type SimScenario } from './sim-band';
import type { BandTransport, FoundBand } from './types';

export type BandPhase = 'loading' | 'unpaired' | 'connecting' | 'connected' | 'reconnecting';

/**
 * The demo band (a simulated band) exists only in the browser, which has no
 * Bluetooth. On a phone the app talks to real bands only.
 */
export const DEMO_BAND_ALLOWED = Platform.OS === 'web';

export type CheckKey = 'bluetooth' | 'permission' | 'nearby' | 'connect' | 'battery' | 'contact';
export type CheckResult = 'pending' | 'checking' | 'pass' | 'fail' | 'skipped';
export const checkOrder: CheckKey[] = ['bluetooth', 'permission', 'nearby', 'connect', 'battery', 'contact'];

export interface RulesView {
  status: Status;
  reason: Reason;
  /** adjusted median skin temperature (staff only; families never see numbers) */
  skinC: number | null;
  /** rule 1–8 that matched */
  rule: number;
}

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
  /** the band's most recent live reading */
  lastReading: LiveReading | null;
  /** what the status rules say now; drives Home, the band's buzz and alerts */
  rules: RulesView;
  /** the open red episode, if any (stays open until the ASHA or a doctor closes it) */
  episode: Episode | null;
  /** when the yellow re-check is due, ms */
  recheckAt: number | null;
  /** when the open yellow started, ms */
  yellowStartedAt: number | null;
  /** shorter timings: 2 min → 10 s, 1 h → 1 min */
  demoMode: boolean;
  /** the scenario the demo band is acting out */
  scenario: SimScenario;
  /** why the last connection attempt failed, for the band screens */
  lastError: string | null;
  /** when the next automatic retry runs, ms */
  retryAt: number | null;
}

const rulesToBand: Record<Status, BandStatus> = {
  green: BandStatus.Green,
  yellow: BandStatus.Yellow,
  red: BandStatus.Red,
  grey: BandStatus.Grey,
};

/** Rules status → the BandStatus the band and StatusPanel use. */
export function bandStatusOf(status: Status): BandStatus {
  return rulesToBand[status];
}

const STORAGE_KEY = 'neobridge.pairedBand';
const RULES_KEY = 'neobridge.rulesState';
const DEMO_KEY = 'neobridge.demoMode';
const RETRY_SECONDS = [2, 5, 10, 20, 30];
export const LOW_BATTERY = 20;
const GOOD_CONTACT = 60;
/** How often to pull saved readings off the band while connected. */
const COLLECT_MS = Platform.OS === 'web' ? 10_000 : 60_000;
const PAGE = 12;
const MAX_PAGES_PER_COLLECT = 100;
/** Readings kept in memory: enough for the median and a short history. */
const KEEP_READINGS = 40;
/** The rules also run on a clock, so a band that goes quiet turns grey. */
const EVALUATE_MS = 5_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * Owns the link to the baby's band: pairing, staying connected (automatic
 * reconnect with backoff), live readings, the status rules and the
 * troubleshooting checks. Lives outside React; screens read it through useBand().
 *
 * Two transports: the real bands (BLE, or the Classic serial sketch) and a demo band (PRD #5). The demo
 * band is used when it is the paired one; in the browser it is the only one.
 */
class BandController {
  private sim: SimBand = createSimBand();
  /** NeoBridge BLE bands and the Classic serial ESP32 sketch, scanned and driven together. */
  private real: BandTransport = Platform.OS === 'web' ? this.sim : combineTransports(createBandClient(), getSerialBand());
  private listeners = new Set<() => void>();
  private linkSubs: (() => void)[] = [];
  private stopScan: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private collecting = false;
  private readings: LiveReading[] = [];
  private rulesState: RulesState = initialRules;
  /** last status sent to the band (and whether it was silenced), so only changes are sent */
  private toldBand: string | null = null;
  private dangerSignAt: number | null = null;
  private calibrationC = 0;

  private state: BandState = {
    phase: 'loading',
    paired: null,
    scanning: false,
    found: [],
    status: null,
    battery: null,
    lastSeen: null,
    checks: null,
    lastReading: null,
    rules: { status: 'grey', reason: 'noReading', skinC: null, rule: 3 },
    episode: null,
    recheckAt: null,
    yellowStartedAt: null,
    demoMode: false,
    scenario: 'normal',
    lastError: null,
    retryAt: null,
  };
  /** a connect() in flight, so taps and retries never open two links at once */
  private connecting: Promise<void> | null = null;

  constructor() {
    void this.restore();
    setInterval(() => this.runRules(), EVALUATE_MS);
    // Phones pause apps in the background (MIUI hibernates them). Coming back,
    // check the link and reconnect at once instead of waiting for the backoff.
    AppState.addEventListener('change', (next) => {
      if (next === 'active') void this.checkLink();
    });
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

  private get transport(): BandTransport {
    return this.isDemoBand() ? this.sim : this.real;
  }

  isDemoBand(): boolean {
    return DEMO_BAND_ALLOWED && this.state.paired?.id === SIM_BAND.id;
  }

  private async restore() {
    const [saved, rules, demo] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY).catch(() => null),
      AsyncStorage.getItem(RULES_KEY).catch(() => null),
      AsyncStorage.getItem(DEMO_KEY).catch(() => null),
    ]);
    if (rules) this.rulesState = { ...initialRules, ...(JSON.parse(rules) as RulesState) };
    this.set({ demoMode: DEMO_BAND_ALLOWED && demo === '1' });
    this.runRules();
    const band = saved ? (JSON.parse(saved) as FoundBand) : null;
    // a demo band paired by an older build: drop it, so the real band can be paired
    if (band && band.id === SIM_BAND.id && !DEMO_BAND_ALLOWED) {
      await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
      return this.set({ phase: 'unpaired' });
    }
    if (!band) return this.set({ phase: 'unpaired' });
    this.set({ paired: band, phase: 'connecting' });
    void this.connect();
  }

  // ---- pairing ---------------------------------------------------------

  async startScan() {
    this.stopScan?.();
    await this.real.requestPermissions();
    this.set({ scanning: true, found: [] });
    this.stopScan = this.real.scan(
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
    const old = this.state.paired;
    if (old && old.id !== band.id) {
      this.clearLink();
      await this.transport.disconnect(old.id).catch(() => undefined);
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(band)).catch(() => undefined);
    this.readings = [];
    this.set({ paired: band, phase: 'connecting', found: [], checks: null, lastReading: null, lastError: null });
    this.attempt = 0;
    void this.connect();
  }

  /** Pair the built-in demo band (browser only, where there is no Bluetooth). Turns demo timings on. */
  async useDemoBand() {
    if (!DEMO_BAND_ALLOWED) return;
    await this.pair({ ...SIM_BAND });
    if (!this.state.demoMode) await this.setDemoMode(true);
  }

  async forget() {
    const id = this.state.paired?.id;
    const transport = this.transport;
    this.stopScan?.();
    this.clearLink();
    this.attempt = 0;
    // forget first, so a connect still in flight sees the band is gone
    this.set({ paired: null, phase: 'unpaired' });
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    if (id) await transport.disconnect(id).catch(() => undefined);
    this.readings = [];
    this.set({
      paired: null,
      phase: 'unpaired',
      lastError: null,
      retryAt: null,
      found: [],
      status: null,
      battery: null,
      lastSeen: null,
      checks: null,
      lastReading: null,
    });
    this.runRules();
  }

  // ---- demo --------------------------------------------------------------

  async setDemoMode(on: boolean) {
    if (on && !DEMO_BAND_ALLOWED) return;
    await AsyncStorage.setItem(DEMO_KEY, on ? '1' : '0').catch(() => undefined);
    this.set({ demoMode: on });
    this.runRules();
  }

  /** Make the demo band act out a scenario (getting cold, very cold, off the baby…). */
  setScenario(scenario: SimScenario) {
    this.sim.setScenario(scenario);
    this.set({ scenario });
  }

  // ---- setup -------------------------------------------------------------

  /** Android 12+ Bluetooth permissions (asked from the permissions primer). */
  requestPermissions(): Promise<boolean> {
    return this.real.requestPermissions();
  }

  /** The band's calibration offset from its assignment on the server (°C). */
  setCalibration(offsetC: number) {
    if (this.calibrationC === offsetC) return;
    this.calibrationC = offsetC;
    this.runRules();
  }

  // ---- band actions ------------------------------------------------------

  /** Buzz once so the family can tell which band is theirs. */
  async testBuzz(): Promise<boolean> {
    const id = this.state.paired?.id;
    if (!id || this.state.phase !== 'connected') return false;
    return this.transport.testBuzz(id).then(
      () => true,
      () => false,
    );
  }

  // ---- status rules ------------------------------------------------------

  /** The family answered yes to a danger sign: red now, whatever the band shows. */
  reportDangerSign(at = Date.now()) {
    this.dangerSignAt = at;
    this.runRules();
  }

  /** "I've seen it": the band stops buzzing; the episode stays open until closed. */
  async acknowledgeRed() {
    this.rulesState = acknowledge(this.rulesState, Date.now());
    this.saveRules();
    this.set({ episode: this.rulesState.episode });
    this.runRules(); // sends the silenced red to the band
  }

  /** The ASHA or a doctor closes the red episode after a visit or a phone check. */
  closeRed(closedBy: string, reason: string): Episode | null {
    const { state, closed } = closeEpisode(this.rulesState, Date.now(), closedBy, reason);
    this.rulesState = state;
    this.saveRules();
    this.runRules();
    return closed;
  }

  private onReading(reading: LiveReading) {
    this.readings = [...this.readings, reading].slice(-KEEP_READINGS);
    this.set({ lastReading: reading, lastSeen: Date.now(), battery: reading.batteryPct });
    this.runRules();
  }

  private runRules() {
    const now = Date.now();
    const readings: RuleReading[] = this.readings.map((r) => ({
      // a band clock ahead of the phone (before setTime lands) must not hide a gap
      at: Math.min(r.timestamp * 1000, now),
      skinTempC: r.skinTempC,
      noContact: (r.flags & ReadingFlag.NoContact) !== 0,
      sensorError: (r.flags & ReadingFlag.SensorError) !== 0,
      batteryPct: r.batteryPct,
    }));
    const prev = this.rulesState;
    const result = evaluate(
      { now, readings, calibrationOffsetC: this.calibrationC, dangerSignAt: this.dangerSignAt },
      prev,
      this.state.demoMode ? demoConfig : defaultConfig,
    );
    this.rulesState = result.state;
    if (result.events.length > 0 || prev.episode !== result.state.episode) this.saveRules();

    const view: RulesView = { status: result.status, reason: result.reason, skinC: result.skinC, rule: result.rule };
    const recheckAt = result.state.yellow?.recheckAt ?? null;
    const yellowStartedAt = result.state.yellow?.startedAt ?? null;
    const r = this.state.rules;
    if (
      r.status !== view.status ||
      r.reason !== view.reason ||
      r.skinC !== view.skinC ||
      r.rule !== view.rule ||
      this.state.episode !== result.state.episode ||
      this.state.recheckAt !== recheckAt
    ) {
      this.set({ rules: view, episode: result.state.episode, recheckAt, yellowStartedAt });
    }
    void this.tellBand(bandStatusOf(result.status));
  }

  /**
   * The band plays the phone's status pattern (buzz, light). Only changes are
   * sent. A red that someone acknowledged stays silent, also after a reconnect.
   */
  private async tellBand(status: BandStatus) {
    const id = this.state.paired?.id;
    const silenced = status === BandStatus.Red && !!this.rulesState.episode?.acknowledgedAt;
    const key = `${status}${silenced ? ':silenced' : ''}`;
    if (!id || this.state.phase !== 'connected' || this.toldBand === key) return;
    this.toldBand = key;
    try {
      await this.transport.setStatus(id, status, silenced);
      if (silenced) await this.transport.ackRed(id);
    } catch {
      this.toldBand = null; // try again on the next evaluation
    }
  }

  private saveRules() {
    void AsyncStorage.setItem(RULES_KEY, JSON.stringify(this.rulesState)).catch(() => undefined);
  }

  // ---- staying connected ---------------------------------------------------

  private clearLink() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.linkSubs.forEach((unsub) => unsub());
    this.linkSubs = [];
    this.toldBand = null;
  }

  private connect(): Promise<void> {
    this.connecting ??= this.openLink().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async openLink() {
    const band = this.state.paired;
    if (!band) return;
    this.clearLink();
    const transport = this.transport;
    try {
      await withTimeout(transport.connect(band.id), 30_000);
      if (this.state.paired?.id !== band.id) {
        // forgotten or replaced meanwhile: close the link that just opened
        await transport.disconnect(band.id).catch(() => undefined);
        return;
      }
      this.attempt = 0;
      this.set({ phase: 'connected', lastSeen: Date.now(), lastError: null, retryAt: null });
      const collectTimer = setInterval(() => void this.collect(), COLLECT_MS);
      this.linkSubs.push(
        transport.onStatus(band.id, (status) => this.set({ status, lastSeen: Date.now() })),
        transport.onReading(band.id, (reading) => this.onReading(reading)),
        transport.onDisconnected(band.id, () => this.lost()),
        () => clearInterval(collectTimer),
      );
      void transport.setTime(band.id, Math.floor(Date.now() / 1000)).catch(() => undefined);
      void this.refresh();
      void this.collect();
      this.runRules();
    } catch (e) {
      if (this.state.paired?.id !== band.id) return;
      await transport.disconnect(band.id).catch(() => undefined);
      this.lost(e instanceof Error ? e.message : String(e));
    }
  }

  /** The link failed or dropped: retry with backoff (2, 5, 10, 20, then every 30 s), forever. */
  private lost(error: string | null = null) {
    if (!this.state.paired) return;
    this.clearLink();
    const delay = RETRY_SECONDS[Math.min(this.attempt, RETRY_SECONDS.length - 1)];
    this.attempt += 1;
    const retryAt = Date.now() + delay * 1000;
    this.set({ phase: 'reconnecting', retryAt, ...(error !== null && { lastError: error }) });
    this.retryTimer = setTimeout(() => void this.connect(), delay * 1000);
  }

  /** Reconnect now instead of waiting for the next retry. */
  reconnectNow() {
    if (this.state.phase === 'connected' || !this.state.paired) return;
    this.clearLink();
    this.attempt = 0;
    this.set({ phase: 'connecting', retryAt: null });
    void this.connect();
  }

  /** Back in the foreground: make sure the link is really up, or reconnect now. */
  private async checkLink() {
    const band = this.state.paired;
    if (!band || this.connecting) return;
    if (this.state.phase !== 'connected') return this.reconnectNow();
    const up = await this.transport.isConnected(band.id).catch(() => false);
    if (!up && this.state.paired?.id === band.id && this.state.phase === 'connected') {
      this.attempt = 0;
      this.lost('The link closed while the app was in the background');
    }
  }

  /**
   * Band → phone: reads every saved minute reading since the last one stored on
   * the phone, a page at a time, and saves it locally for upload.
   * TODO: once the firmware persists its log and seq in flash, detect a band
   * whose seq went backwards (factory reset) and restart from 1.
   */
  private async collect() {
    const id = this.state.paired?.id;
    if (!id || this.state.phase !== 'connected' || this.collecting) return;
    this.collecting = true;
    const sync = getSyncEngine();
    try {
      let from = await sync.nextSeq(id);
      for (let i = 0; i < MAX_PAGES_PER_COLLECT; i++) {
        const page = await this.transport.readSummaries(id, from);
        if (page.length === 0) break;
        await sync.save(id, page);
        from = page[page.length - 1].seq + 1;
        this.set({ lastSeen: Date.now(), battery: page[page.length - 1].batteryPct || this.state.battery });
        if (page.length < PAGE) break;
      }
    } catch {
      // link dropped mid-read: what was saved stays saved, the rest comes next time
    } finally {
      this.collecting = false;
    }
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
      [
        'battery',
        async () => {
          const id = this.state.paired!.id;
          const battery = await this.transport.readBattery(id);
          this.set({ battery });
          return battery >= LOW_BATTERY;
        },
      ],
      ['contact', () => this.contactGood()],
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

  /**
   * Judged from the live readings: the newest must be fresh, touching skin and
   * reading a temperature. Waits for the next one if none is fresh.
   */
  private async contactGood(): Promise<boolean> {
    const fresh = (r: LiveReading | null): r is LiveReading =>
      r !== null && this.state.lastSeen !== null && Date.now() - this.state.lastSeen < 90_000;
    let r = this.state.lastReading;
    if (!fresh(r)) {
      const id = this.state.paired!.id;
      r = await new Promise<LiveReading>((resolve) => {
        const unsub = this.transport.onReading(id, (reading) => {
          unsub();
          resolve(reading);
        });
      });
      this.onReading(r);
    }
    return (
      (r.flags & (ReadingFlag.NoContact | ReadingFlag.SensorError)) === 0 &&
      r.skinTempC !== null &&
      r.contactPct >= GOOD_CONTACT
    );
  }

  private async findPairedNearby(): Promise<boolean> {
    const paired = this.state.paired;
    if (!paired) return false;
    if (this.isDemoBand()) return true;
    if (await this.real.isConnected(paired.id).catch(() => false)) return true;
    return new Promise((resolve) => {
      let seen = false;
      const stop = this.real.scan(
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
    this.clearLink();
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
