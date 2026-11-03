/**
 * Bluetooth LE contract between the ESP32 band and the apps.
 *
 * Keep this file and firmware/main/band_protocol.h in step: UUIDs, packet
 * layouts and enum values must match byte for byte. All multi-byte fields are
 * little-endian (the ESP32's native order).
 */

export const PROTOCOL_VERSION = 2;

/** Custom "Infant Band" GATT service and its characteristics. */
export const UUID = {
  service: "6e1b0001-8f3a-4c1e-9b2a-3d5f7a1c0b00",
  /** read + notify · StatusPacket */
  status: "6e1b0002-8f3a-4c1e-9b2a-3d5f7a1c0b00",
  /** read · SummaryRecord pages, selected by writing a cursor to `command` */
  summary: "6e1b0003-8f3a-4c1e-9b2a-3d5f7a1c0b00",
  /** notify · AlertEvent */
  alert: "6e1b0004-8f3a-4c1e-9b2a-3d5f7a1c0b00",
  /** write · Command */
  command: "6e1b0005-8f3a-4c1e-9b2a-3d5f7a1c0b00",

  // Standard Bluetooth SIG services the band also exposes
  batteryService: "0000180f-0000-1000-8000-00805f9b34fb",
  batteryLevel: "00002a19-0000-1000-8000-00805f9b34fb",
  deviceInfoService: "0000180a-0000-1000-8000-00805f9b34fb",
  currentTimeService: "00001805-0000-1000-8000-00805f9b34fb",
  currentTime: "00002a2b-0000-1000-8000-00805f9b34fb",
} as const;

/** The four family-facing states. The band decides these, not the phone. */
export enum BandStatus {
  Green = 0,
  Yellow = 1,
  Red = 2,
  Grey = 3,
}

/** Why the band is in its current state. */
export enum StatusReason {
  None = 0,
  Cold = 1,
  TooWarm = 2,
  StillColdAtRecheck = 3,
  VeryCold = 4,
  StillWarmAfterCooling = 5,
  LooseBand = 10,
  NoSkinContact = 11,
  PoorSignal = 12,
  LowBattery = 13,
}

export enum CommandCode {
  /** Ask the band to re-run its rules now. */
  Recheck = 0x01,
  /** Caregiver or ASHA acknowledged a red alert (the alarm keeps sounding until then). */
  AcknowledgeRed = 0x02,
  /** Set the summary read cursor: u32 sequence number follows. */
  SetSummaryCursor = 0x03,
  /** Family reported a danger sign from the daily check (always red). */
  ReportDangerSign = 0x04,
}

/** 8 bytes */
export interface StatusPacket {
  version: number;
  status: BandStatus;
  reason: StatusReason;
  /** 0–100, share of the last window with good skin contact */
  contactPct: number;
  /** Unix seconds from the band's clock */
  timestamp: number;
}

/**
 * 20 bytes, one per minute. Summaries only — the band never streams raw
 * sensor data. The band keeps them in flash until the phone has read them.
 */
export interface SummaryRecord {
  timestamp: number;
  /** °C, or null when the band had no usable reading */
  skinTempC: number | null;
  roomTempC: number | null;
  contactPct: number;
  /** Trend only; never changes the family's status in version 1 */
  heartRateBpm: number | null;
  status: BandStatus;
  flags: number;
  seq: number;
  /** HRV as RMSSD over the minute, ms; null when the signal was too poor. Trend only. */
  hrvRmssdMs: number | null;
  /** 0–100 confidence in the heart-rate / HRV values */
  hrQuality: number;
  /** 0–100 */
  batteryPct: number;
}

/** 12 bytes */
export interface AlertEvent {
  seq: number;
  timestamp: number;
  from: BandStatus;
  to: BandStatus;
  reason: StatusReason;
}

export const STATUS_PACKET_SIZE = 8;
export const SUMMARY_RECORD_SIZE = 20;
export const ALERT_EVENT_SIZE = 12;

/** Sentinel the firmware writes for "no reading" in i16 temperature fields. */
const NO_TEMP = -32768;

function view(bytes: Uint8Array, expected: number, name: string): DataView {
  if (bytes.byteLength < expected) {
    throw new RangeError(`${name}: expected ${expected} bytes, got ${bytes.byteLength}`);
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function centiDegrees(raw: number): number | null {
  return raw === NO_TEMP ? null : raw / 100;
}

export function decodeStatus(bytes: Uint8Array): StatusPacket {
  const v = view(bytes, STATUS_PACKET_SIZE, "StatusPacket");
  return {
    version: v.getUint8(0),
    status: v.getUint8(1),
    reason: v.getUint8(2),
    contactPct: v.getUint8(3),
    timestamp: v.getUint32(4, true),
  };
}

export function decodeSummary(bytes: Uint8Array): SummaryRecord {
  const v = view(bytes, SUMMARY_RECORD_SIZE, "SummaryRecord");
  const hr = v.getUint8(10);
  return {
    timestamp: v.getUint32(0, true),
    skinTempC: centiDegrees(v.getInt16(4, true)),
    roomTempC: centiDegrees(v.getInt16(6, true)),
    contactPct: v.getUint8(8),
    status: v.getUint8(9),
    heartRateBpm: hr === 0 ? null : hr,
    flags: v.getUint8(11),
    seq: v.getUint32(12, true),
    hrvRmssdMs: v.getUint16(16, true) || null,
    hrQuality: v.getUint8(18),
    batteryPct: v.getUint8(19),
  };
}

/** Inverse of decodeSummary. Used by the simulated band and tests. */
export function encodeSummary(r: SummaryRecord): Uint8Array {
  const out = new Uint8Array(SUMMARY_RECORD_SIZE);
  const v = new DataView(out.buffer);
  const temp = (c: number | null) => (c === null ? NO_TEMP : Math.round(c * 100));
  v.setUint32(0, r.timestamp, true);
  v.setInt16(4, temp(r.skinTempC), true);
  v.setInt16(6, temp(r.roomTempC), true);
  v.setUint8(8, r.contactPct);
  v.setUint8(9, r.status);
  v.setUint8(10, r.heartRateBpm ?? 0);
  v.setUint8(11, r.flags);
  v.setUint32(12, r.seq, true);
  v.setUint16(16, r.hrvRmssdMs ?? 0, true);
  v.setUint8(18, r.hrQuality);
  v.setUint8(19, r.batteryPct);
  return out;
}

/** A summary characteristic read returns a page of back-to-back records. */
export function decodeSummaryPage(bytes: Uint8Array): SummaryRecord[] {
  const records: SummaryRecord[] = [];
  for (let off = 0; off + SUMMARY_RECORD_SIZE <= bytes.byteLength; off += SUMMARY_RECORD_SIZE) {
    records.push(decodeSummary(bytes.subarray(off, off + SUMMARY_RECORD_SIZE)));
  }
  return records;
}

export function decodeAlert(bytes: Uint8Array): AlertEvent {
  const v = view(bytes, ALERT_EVENT_SIZE, "AlertEvent");
  return {
    seq: v.getUint32(0, true),
    timestamp: v.getUint32(4, true),
    from: v.getUint8(8),
    to: v.getUint8(9),
    reason: v.getUint8(10),
  };
}

export function encodeCommand(code: CommandCode, arg?: number): Uint8Array {
  if (code === CommandCode.SetSummaryCursor) {
    const out = new Uint8Array(5);
    out[0] = code;
    new DataView(out.buffer).setUint32(1, arg ?? 0, true);
    return out;
  }
  if (code === CommandCode.ReportDangerSign) {
    return Uint8Array.of(code, arg ?? 0);
  }
  return Uint8Array.of(code);
}

/** react-native-ble-plx passes characteristic values as base64. */
export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
