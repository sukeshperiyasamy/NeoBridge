/**
 * Text protocol of the Arduino band sketch ("NEOVITAL ESP32"), which talks
 * Classic Bluetooth serial (BluetoothSerial) instead of the BLE service in
 * index.ts. Every message is one line of comma-separated text.
 *
 * Band → phone (v1 fields first; v2 adds fields at the end of a line)
 *   HELLO,<version>,<name>,<simVitals 0|1>                                    v2, on connect
 *   LIVE,<boot>,<uptimeMs>,<hr>,<spo2>,<ntc1C|NA>,<ntc2C|NA>,<ALARM|NORMAL>   every 2 s
 *        v2 adds ,<unix|0>,<battery%|NA>,<contact 0|1>,<pattern>
 *   DATA,<id>,<boot>,<uptimeMs>,<hr>,<spo2>,<ntc1C|NA>,<ntc2C|NA>            one saved SD row, oldest first
 *        v2 adds ,<unix|0>
 *   ACK_OK,<id> · PENDING_COUNT,<n> · TIME_OK · STATUS_OK,<s> · CONNECTED · SYNC_COMPLETE · …
 *
 * Phone → band (each ends with a newline)
 *   STATUS · TEST ON · TEST OFF · SYNC · SYNC_STATUS · ACK,<id> · SIM HR <n> · SIM SPO2 <n> · SIM RESET
 *   v2: STATUS,<GREEN|YELLOW|RED|GREY> · SILENCE · TIME,<unix> · PING
 *
 * v1 has no real clock: times are milliseconds since power-on, plus a boot
 * number that goes up on every power-on. BootClock turns them into real times
 * from what the phone saw while connected. v2 rows carry unix time once the
 * phone has sent TIME.
 *
 * Heart rate and SpO2 are simulated in the sketch until the MAX30102 is
 * fitted, so the app shows them only on the band test screen.
 */

export interface SerialSample {
  bootId: number;
  uptimeMs: number;
  heartRate: number | null;
  spo2: number | null;
  /** NTC on GPIO 35 (10k): the skin sensor */
  ntc1C: number | null;
  /** NTC on GPIO 32 (5k) */
  ntc2C: number | null;
  /** unix seconds (v2, once the phone set the time); null when unknown */
  unix: number | null;
}

export type SerialMessage =
  | ({
      kind: "live";
      alarm: boolean;
      /** v2: battery %, null when not measured */
      batteryPct: number | null;
      /** v2: skin contact; null on v1 (unknown) */
      contact: boolean | null;
      /** v2: what the band is playing: OFF, YELLOW, RED, SILENCED, TEST, LOCAL_YELLOW, LOCAL_RED */
      pattern: string | null;
    } & SerialSample)
  | ({ kind: "data"; id: number } & SerialSample)
  | { kind: "hello"; version: number; name: string; simulatedVitals: boolean }
  | { kind: "ackOk"; id: number }
  | { kind: "pendingCount"; count: number }
  | { kind: "timeOk" }
  /** any other line: CONNECTED, SYNC_COMPLETE, ALARM_STARTED, UNKNOWN_COMMAND… */
  | { kind: "notice"; text: string };

export const SerialCommand = {
  status: "STATUS",
  alarmOn: "TEST ON",
  alarmOff: "TEST OFF",
  sync: "SYNC",
  syncStatus: "SYNC_STATUS",
  simReset: "SIM RESET",
  ack: (id: number) => `ACK,${id}`,
  simHeartRate: (bpm: number) => `SIM HR ${Math.round(bpm)}`,
  simSpo2: (pct: number) => `SIM SPO2 ${Math.round(pct)}`,
  /** v2: the phone's status; the band plays its pattern */
  setStatus: (status: "GREEN" | "YELLOW" | "RED" | "GREY") => `STATUS,${status}`,
  /** v2: acknowledged red, no sound */
  silence: "SILENCE",
  /** v2: unix seconds */
  time: (unixSeconds: number) => `TIME,${Math.floor(unixSeconds)}`,
  ping: "PING",
} as const;

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === "" || t.toUpperCase() === "NA") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function int(s: string | undefined): number | null {
  const n = num(s);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}

function sample(f: string[], at: number): SerialSample | null {
  const bootId = int(f[at]);
  const uptimeMs = int(f[at + 1]);
  if (bootId === null || uptimeMs === null) return null;
  return {
    bootId,
    uptimeMs,
    heartRate: num(f[at + 2]),
    spo2: num(f[at + 3]),
    ntc1C: num(f[at + 4]),
    ntc2C: num(f[at + 5]),
    unix: null,
  };
}

/** 0 or missing means the band doesn't know the time yet. */
function unixAt(f: string[], i: number): number | null {
  const n = int(f[i]);
  return n !== null && n > 0 ? n : null;
}

/** Parses one line from the band. Malformed LIVE / DATA lines come back as notices. */
export function parseSerialLine(line: string): SerialMessage {
  const text = line.trim();
  const f = text.split(",");
  const head = f[0]?.toUpperCase();
  if (head === "LIVE" && f.length >= 8) {
    const s = sample(f, 1);
    if (s) {
      const contact = f[10]?.trim();
      return {
        kind: "live",
        ...s,
        unix: unixAt(f, 8),
        alarm: f[7].trim().toUpperCase() === "ALARM",
        batteryPct: num(f[9]),
        contact: contact === "1" ? true : contact === "0" ? false : null,
        pattern: f[11]?.trim().toUpperCase() || null,
      };
    }
  } else if (head === "DATA" && f.length >= 8) {
    const id = int(f[1]);
    const s = sample(f, 2);
    if (id !== null && s) return { kind: "data", id, ...s, unix: unixAt(f, 8) };
  } else if (head === "HELLO" && f.length >= 2) {
    const version = int(f[1]);
    if (version !== null) {
      return { kind: "hello", version, name: f[2]?.trim() ?? "", simulatedVitals: f[3]?.trim() === "1" };
    }
  } else if (head === "TIME_OK") {
    return { kind: "timeOk" };
  } else if (head === "ACK_OK" && f.length >= 2) {
    const id = int(f[1]);
    if (id !== null) return { kind: "ackOk", id };
  } else if (head === "PENDING_COUNT" && f.length >= 2) {
    const count = int(f[1]);
    if (count !== null) return { kind: "pendingCount", count };
  }
  return { kind: "notice", text };
}

/**
 * Maps the sketch's (boot, uptime) pairs to real time. Each live line seen
 * while connected teaches the phone when that boot started; rows saved during
 * a boot the phone never saw live have no known time.
 */
export class BootClock {
  private starts = new Map<number, number>();

  constructor(known: Record<string, number> = {}) {
    for (const [boot, start] of Object.entries(known)) this.starts.set(Number(boot), start);
  }

  /** Records that `uptimeMs` on boot `bootId` is `nowMs` on the phone. Returns true when it is a new boot. */
  learn(bootId: number, uptimeMs: number, nowMs: number): boolean {
    const isNew = !this.starts.has(bootId);
    // Keep the latest estimate: the band's crystal and the phone drift apart slowly.
    this.starts.set(bootId, nowMs - uptimeMs);
    return isNew;
  }

  knows(bootId: number): boolean {
    return this.starts.has(bootId);
  }

  /** Real time in ms, or null when the boot was never seen live. */
  timeOf(bootId: number, uptimeMs: number): number | null {
    const start = this.starts.get(bootId);
    return start === undefined ? null : start + uptimeMs;
  }

  /** For saving: the most recent boots only. */
  toJSON(keep = 20): Record<string, number> {
    const boots = [...this.starts.keys()].sort((a, b) => b - a).slice(0, keep);
    return Object.fromEntries(boots.map((b) => [String(b), this.starts.get(b)!]));
  }
}
