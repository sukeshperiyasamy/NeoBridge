import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BandStatus,
  BootClock,
  PROTOCOL_VERSION,
  ReadingFlag,
  SerialCommand,
  StatusReason,
  parseSerialLine,
  type LiveReading,
  type SerialMessage,
  type StatusPacket,
  type SummaryRecord,
} from '@neobridge/ble-protocol';

import { getSyncEngine } from '@/sync/sync-engine';

import { BtSerial } from '../../modules/bt-serial';
import type { BandTransport, FoundBand } from './types';

/**
 * The ESP32 band sketch that talks Classic Bluetooth serial (Arduino
 * BluetoothSerial, text lines) instead of the NeoBridge BLE service. This
 * adapter makes it look like any other band to the controller:
 *
 *  - LIVE lines (every 2 s) become live readings, one every 5 s, for the rules.
 *    NTC 1 (GPIO 35) is the skin temperature; NTC 2 goes in as room temperature.
 *    One a minute is also saved on the phone for upload, so the time the band
 *    is connected never needs the SD card.
 *  - DATA lines (the SD card backlog) are only taken when history sync is on:
 *    saved on the phone, then acknowledged with ACK,<id>. Each ACK makes the
 *    sketch rewrite its whole pending file, which freezes it for seconds (about
 *    7 s with 10 000 rows), so commands like TEST ON wait. History sync is
 *    therefore off by default, and pauses itself unless the status is green.
 *  - Red on the phone plays the band's siren (TEST ON); anything else stops it.
 *
 * Saved rows use the minute as their sequence number, so a live reading and
 * the SD row for the same minute are stored and uploaded once.
 *
 * Firmware v2 (neovital_band_v2.ino) says HELLO,2 on connect. Then the phone
 * sets its clock (TIME), sends real status patterns (STATUS,<s> and SILENCE),
 * uses its battery and skin-contact fields, and syncs the SD backlog all the
 * time, because a v2 ACK costs the band nothing.
 *
 * What the sketch can't give yet: battery level (reported as 100 %), skin
 * contact (assumed while NTC 1 reads) and a real clock (worked out from the
 * live lines, see BootClock). Heart rate and SpO2 are simulated on the band,
 * so they only appear on the band test screen.
 */

export const SERIAL_PREFIX = 'serial:';
/** Band names the scan lists. The sketch's BT_NAME is "De De Padosan Ko". */
export const SERIAL_NAME = /padosan|neovital|neobridge|esp32/i;

export const isSerialBand = (id: string) => id.startsWith(SERIAL_PREFIX);
const addressOf = (id: string) => id.slice(SERIAL_PREFIX.length);
const idOf = (address: string) => SERIAL_PREFIX + address;

const LIVE_EVERY_MS = 5_000;
const LOG_LINES = 60;
const BOOTS_KEY = 'neobridge.serialBoots.';
const TEST_BUZZ_MS = 1_500;

export interface LogLine {
  at: number;
  dir: 'in' | 'out';
  text: string;
}

export interface SerialInfo {
  /** the band's newest LIVE line */
  live: Extract<SerialMessage, { kind: 'live' }> | null;
  liveAt: number | null;
  /** rows still on the band's SD card, from PENDING_COUNT */
  bandPending: number | null;
  /** SD rows saved on the phone for upload */
  saved: number;
  /** SD rows acknowledged but not kept (more than one in the same minute) */
  thinned: number;
  /** SD rows from a power-on the phone never saw live, so with no known time */
  noClock: number;
  /** live readings saved on the phone (one a minute) */
  liveSaved: number;
  /** the phone is taking (and acknowledging) the band's SD backlog */
  historySync: boolean;
  /** history sync is on but waiting, because the status isn't green */
  historyPaused: boolean;
  /** what the band said in HELLO; null for v1 firmware (no HELLO) */
  firmware: { version: number; name: string; simulatedVitals: boolean } | null;
  /** last few lines each way, newest last */
  log: LogLine[];
}

export interface SerialBand extends BandTransport {
  readonly available: boolean;
  /** Sends one raw command line (band test screen). */
  send(id: string, command: string): Promise<void>;
  /** Take the SD backlog (slows the band's replies to commands while it runs). */
  setHistorySync(on: boolean): void;
  getInfo(): SerialInfo;
  subscribe(listener: () => void): () => void;
}

export function createSerialBand(): SerialBand {
  const native = BtSerial;
  const listeners = new Set<() => void>();
  const readingListeners = new Map<string, Set<(r: LiveReading) => void>>();
  const disconnectListeners = new Map<string, Set<() => void>>();
  let info: SerialInfo = {
    live: null,
    liveAt: null,
    bandPending: null,
    saved: 0,
    thinned: 0,
    noClock: 0,
    liveSaved: 0,
    historySync: false,
    historyPaused: false,
    firmware: null,
    log: [],
  };

  // per connected band
  let clock = new BootClock();
  let currentBoot: number | null = null;
  let lastLiveSent = 0;
  let lastLiveMinute: number | null = null;
  let lastDataMinute: number | null = null;
  let told: BandStatus | null = null;
  /** the siren is on because of a red the phone sent (not a test buzz) */
  let sounding = false;
  /** the red the phone sent was acknowledged */
  let silencedNow = false;
  /** resolves the wait for HELLO in connect() */
  let helloWaiter: (() => void) | null = null;

  const isV2 = () => (info.firmware?.version ?? 1) >= 2;
  const statusWord = (status: BandStatus) =>
    status === BandStatus.Green ? 'GREEN' : status === BandStatus.Yellow ? 'YELLOW' : status === BandStatus.Red ? 'RED' : 'GREY';
  let queue: Promise<void> = Promise.resolve();

  const set = (patch: Partial<SerialInfo>) => {
    info = { ...info, ...patch };
    listeners.forEach((l) => l());
  };
  const log = (dir: LogLine['dir'], text: string) => {
    // dev builds: every line in `adb logcat -s ReactNativeJS`, for timing the band
    if (__DEV__) console.log(`[serial] ${dir === 'out' ? '->' : '<-'} ${text}`);
    set({ log: [...info.log, { at: Date.now(), dir, text }].slice(-LOG_LINES) });
  };

  const write = async (id: string, command: string) => {
    if (!native) throw new Error('Classic Bluetooth is not available');
    log('out', command);
    await native.write(addressOf(id), `${command}\n`);
  };

  const saveBoots = (id: string) => {
    void AsyncStorage.setItem(BOOTS_KEY + addressOf(id), JSON.stringify(clock.toJSON())).catch(() => undefined);
  };

  /** v1 sends no contact flag: assume contact while NTC 1 reads. */
  const touching = (ntc1C: number | null, contact: boolean | null) => ntc1C !== null && contact !== false;
  const flagsOf = (ntc1C: number | null, contact: boolean | null) =>
    ntc1C === null ? ReadingFlag.SensorError : contact === false ? ReadingFlag.NoContact : 0;

  // No battery divider (NA) or v1: report full, so the rules don't go grey for it.
  const toReading = (m: Extract<SerialMessage, { kind: 'live' }>, now: number): LiveReading => ({
    timestamp: Math.floor(now / 1000),
    skinTempC: m.ntc1C,
    roomTempC: m.ntc2C,
    contactPct: touching(m.ntc1C, m.contact) ? 100 : 0,
    heartRateBpm: null,
    batteryPct: m.batteryPct ?? 100,
    flags: flagsOf(m.ntc1C, m.contact),
  });

  const toRecord = (
    at: number,
    ntc1C: number | null,
    ntc2C: number | null,
    status: BandStatus,
    contact: boolean | null = null,
    batteryPct: number | null = null,
  ): SummaryRecord => ({
    timestamp: Math.floor(at / 1000),
    skinTempC: ntc1C,
    roomTempC: ntc2C,
    contactPct: touching(ntc1C, contact) ? 100 : 0,
    heartRateBpm: null,
    status,
    flags: flagsOf(ntc1C, contact),
    seq: Math.floor(at / 60_000),
    hrvRmssdMs: null,
    hrQuality: 0,
    batteryPct: batteryPct ?? 100,
  });

  /** One LIVE line a minute goes into the phone's history for upload. */
  const saveLive = async (id: string, m: Extract<SerialMessage, { kind: 'live' }>, now: number) => {
    const minute = Math.floor(now / 60_000);
    if (minute === lastLiveMinute) return;
    lastLiveMinute = minute;
    await getSyncEngine().save(id, [toRecord(now, m.ntc1C, m.ntc2C, told ?? BandStatus.Grey, m.contact, m.batteryPct)]);
    set({ liveSaved: info.liveSaved + 1 });
  };

  /**
   * v2: an ACK is cheap, so history syncs whenever it is on (on by default).
   * v1: each ACK freezes the band for seconds, so it waits while the status
   * is yellow, red or unknown, and alarms reach the band at once.
   */
  const historyAllowed = () => info.historySync && (isV2() || told === BandStatus.Green);

  /** The phone's status as a v2 pattern; SILENCE after an acknowledged red. */
  const sendStatusV2 = async (id: string) => {
    if (told === null) return;
    await write(id, SerialCommand.setStatus(statusWord(told)));
    if (told === BandStatus.Red && silencedNow) await write(id, SerialCommand.silence);
  };

  const onHello = async (id: string, m: Extract<SerialMessage, { kind: 'hello' }>) => {
    set({ firmware: { version: m.version, name: m.name, simulatedVitals: m.simulatedVitals }, historySync: m.version >= 2 });
    helloWaiter?.();
    helloWaiter = null;
    if (m.version < 2) return;
    // A TEST ON sent before HELLO would hold the siren on: clear it, then set the clock and status.
    await write(id, SerialCommand.alarmOff);
    await write(id, SerialCommand.time(Date.now() / 1000));
    await sendStatusV2(id);
  };

  /** One SD row: save it on the phone first, then let the band delete it. */
  const onData = async (id: string, m: Extract<SerialMessage, { kind: 'data' }>) => {
    // Not acknowledging is cheap: the band just offers the same row again in 10 s.
    if (!historyAllowed()) {
      if (info.historySync !== info.historyPaused) set({ historyPaused: info.historySync });
      return;
    }
    if (info.historyPaused) set({ historyPaused: false });
    // v2 rows carry real time once the phone has set the band's clock
    const at = m.unix !== null ? m.unix * 1000 : clock.timeOf(m.bootId, m.uptimeMs);
    if (at === null) {
      // This power-on's start isn't known until the first LIVE line; the band re-sends in 10 s.
      if (currentBoot === null || m.bootId === currentBoot) return;
      set({ noClock: info.noClock + 1 });
      return write(id, SerialCommand.ack(m.id));
    }
    const minute = Math.floor(at / 60_000);
    if (minute === lastDataMinute) {
      set({ thinned: info.thinned + 1 });
      return write(id, SerialCommand.ack(m.id));
    }
    const recent = Date.now() - at < 120_000;
    await getSyncEngine().save(id, [toRecord(at, m.ntc1C, m.ntc2C, recent && told !== null ? told : BandStatus.Grey)]);
    lastDataMinute = minute;
    set({ saved: info.saved + 1 });
    await write(id, SerialCommand.ack(m.id));
  };

  const onLine = (id: string, line: string) => {
    log('in', line);
    const m = parseSerialLine(line);
    const now = Date.now();
    switch (m.kind) {
      case 'live': {
        if (clock.learn(m.bootId, m.uptimeMs, now) || currentBoot !== m.bootId) saveBoots(id);
        currentBoot = m.bootId;
        set({ live: m, liveAt: now });
        queue = queue.then(() => saveLive(id, m, now)).catch(() => undefined);
        if (now - lastLiveSent >= LIVE_EVERY_MS) {
          lastLiveSent = now;
          const reading = toReading(m, now);
          readingListeners.get(id)?.forEach((l) => l(reading));
        }
        break;
      }
      case 'data':
        // one at a time, in order: the band waits for each ACK before the next row
        queue = queue.then(() => onData(id, m)).catch(() => undefined);
        break;
      case 'pendingCount':
        set({ bandPending: m.count });
        break;
      case 'hello':
        queue = queue.then(() => onHello(id, m)).catch(() => undefined);
        break;
      default:
        break;
    }
  };

  if (native) {
    // A dev reload re-runs this file while the native module lives on: drop the
    // old listeners first, or every line is handled (and acknowledged) twice.
    const g = globalThis as { __btSerialSubs?: { remove(): void }[] };
    g.__btSerialSubs?.forEach((sub) => sub.remove());
    g.__btSerialSubs = [
      native.addListener('onLine', ({ address, line }) => onLine(idOf(address), line)),
      native.addListener('onDisconnected', ({ address }) => {
        disconnectListeners.get(idOf(address))?.forEach((l) => l());
      }),
    ];
  }

  const addTo = <T>(map: Map<string, Set<T>>, id: string, listener: T) => {
    const set = map.get(id) ?? new Set<T>();
    set.add(listener);
    map.set(id, set);
    return () => void set.delete(listener);
  };

  return {
    available: native !== null && native.isAvailable(),

    async bluetoothState() {
      if (!native || !native.isAvailable()) return 'unsupported';
      return native.isEnabled() ? 'on' : 'off';
    },

    // The BLE client asks for the same Android permissions (scan + connect).
    async requestPermissions() {
      return true;
    },

    scan(onFound, timeoutMs, onDone) {
      if (!native) {
        onDone();
        return () => undefined;
      }
      const report = (address: string, name: string, rssi: number | null) => {
        if (SERIAL_NAME.test(name)) onFound({ id: idOf(address), name, rssi } satisfies FoundBand);
      };
      // Paired in Android's Bluetooth settings already: listed straight away.
      for (const d of native.bondedDevices()) report(d.address, d.name, null);

      let stopped = false;
      const subs = [
        native.addListener('onDeviceFound', (d) => report(d.address, d.name, d.rssi ?? null)),
        native.addListener('onDiscoveryFinished', () => stop()),
      ];
      const stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        subs.forEach((s) => s.remove());
        native.cancelDiscovery();
        onDone();
      };
      const timer = setTimeout(stop, Math.max(timeoutMs, 12_000));
      if (!native.startDiscovery()) stop();
      return stop;
    },

    async connect(id) {
      if (!native) throw new Error('Classic Bluetooth is not available');
      const saved = await AsyncStorage.getItem(BOOTS_KEY + addressOf(id)).catch(() => null);
      clock = new BootClock(saved ? (JSON.parse(saved) as Record<string, number>) : {});
      currentBoot = null;
      lastLiveSent = 0;
      lastLiveMinute = null;
      lastDataMinute = null;
      told = null;
      sounding = false;
      silencedNow = false;
      set({
        live: null,
        liveAt: null,
        bandPending: null,
        saved: 0,
        thinned: 0,
        noClock: 0,
        liveSaved: 0,
        historyPaused: false,
        firmware: null,
        historySync: false,
      });
      log('out', `(connecting to ${addressOf(id)})`);
      const hello = new Promise<void>((resolve) => {
        helloWaiter = resolve;
        setTimeout(resolve, 1_500); // v1 never says HELLO
      });
      await native.connect(addressOf(id));
      log('in', '(connected)');
      // v2 says HELLO at once; wait for it so the first status goes out the v2 way
      await hello;
      helloWaiter = null;
      // Ask for a LIVE line now, so the clock is known before the backlog arrives.
      // (Not SYNC_STATUS: counting the pending rows freezes the band for a moment.)
      await write(id, SerialCommand.status);
    },

    async isConnected(id) {
      return native?.isConnected(addressOf(id)) ?? false;
    },

    onDisconnected: (id, listener) => addTo(disconnectListeners, id, listener),

    // The sketch has no status packet; the phone's rules decide.
    onStatus: () => () => undefined,

    async readStatus(): Promise<StatusPacket> {
      return {
        version: PROTOCOL_VERSION,
        status: told ?? BandStatus.Grey,
        reason: StatusReason.None,
        contactPct: info.live && touching(info.live.ntc1C, info.live.contact) ? 100 : 0,
        timestamp: Math.floor(Date.now() / 1000),
      };
    },

    // v1 and bands with no battery divider report full.
    async readBattery() {
      return info.live?.batteryPct ?? 100;
    },

    // The backlog is pushed by the band (DATA lines) and saved as it arrives.
    async readSummaries() {
      return [];
    },

    onReading: (id, listener) => addTo(readingListeners, id, listener),

    async testBuzz(id) {
      await write(id, SerialCommand.alarmOn);
      await new Promise((r) => setTimeout(r, TEST_BUZZ_MS));
      // v2 goes back to the phone's pattern by itself after TEST OFF
      if (isV2() || !sounding) await write(id, SerialCommand.alarmOff);
    },

    // v2 keeps the time for its rows; v1 has no clock (times come from BootClock).
    async setTime(id, unixSeconds) {
      if (isV2()) await write(id, SerialCommand.time(unixSeconds));
    },

    async setStatus(id, status, silenced) {
      told = status;
      silencedNow = status === BandStatus.Red && !!silenced;
      sounding = status === BandStatus.Red && !silenced;
      if (isV2()) return sendStatusV2(id);
      await write(id, sounding ? SerialCommand.alarmOn : SerialCommand.alarmOff);
    },

    async ackRed(id) {
      sounding = false;
      if (told === BandStatus.Red) silencedNow = true;
      await write(id, isV2() ? SerialCommand.silence : SerialCommand.alarmOff);
    },

    async disconnect(id) {
      native?.disconnect(addressOf(id));
      log('in', '(disconnected)');
    },

    send: write,
    setHistorySync(on) {
      set({ historySync: on, historyPaused: false });
    },
    getInfo: () => info,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

let serialBand: SerialBand | null = null;

/** One serial adapter per app; the band controller and the band test screen share it. */
export function getSerialBand(): SerialBand {
  serialBand ??= createSerialBand();
  return serialBand;
}

/** The real bands: BLE NeoBridge bands and Classic serial ESP32 bands, scanned together. */
export function combineTransports(ble: BandTransport, serial: SerialBand): BandTransport {
  const pick = (id: string) => (isSerialBand(id) ? serial : ble);
  return {
    bluetoothState: () => ble.bluetoothState(),
    requestPermissions: () => ble.requestPermissions(),
    scan(onFound, timeoutMs, onDone) {
      let left = 2;
      const done = () => {
        left -= 1;
        if (left === 0) onDone();
      };
      const stopBle = ble.scan(onFound, timeoutMs, done);
      const stopSerial = serial.scan(onFound, timeoutMs, done);
      return () => {
        stopBle();
        stopSerial();
      };
    },
    connect: (id) => pick(id).connect(id),
    isConnected: (id) => pick(id).isConnected(id),
    onDisconnected: (id, l) => pick(id).onDisconnected(id, l),
    onStatus: (id, l) => pick(id).onStatus(id, l),
    readStatus: (id) => pick(id).readStatus(id),
    readBattery: (id) => pick(id).readBattery(id),
    readSummaries: (id, from) => pick(id).readSummaries(id, from),
    onReading: (id, l) => pick(id).onReading(id, l),
    testBuzz: (id) => pick(id).testBuzz(id),
    setTime: (id, t) => pick(id).setTime(id, t),
    setStatus: (id, s, silenced) => pick(id).setStatus(id, s, silenced),
    ackRed: (id) => pick(id).ackRed(id),
    disconnect: (id) => pick(id).disconnect(id),
  };
}
