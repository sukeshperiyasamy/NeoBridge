import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BandStatus,
  CommandCode,
  StatusReason,
  decodeStatus,
  ReadingFlag,
  decodeReading,
  decodeSummaryPage,
  encodeCommand,
  encodeReading,
  encodeSummary,
  type SummaryRecord,
  fromBase64,
  toBase64,
} from "./index";

test("decodes a status packet", () => {
  const bytes = new Uint8Array(8);
  const v = new DataView(bytes.buffer);
  v.setUint8(0, 1);
  v.setUint8(1, BandStatus.Red);
  v.setUint8(2, StatusReason.StillColdAtRecheck);
  v.setUint8(3, 95);
  v.setUint32(4, 1_792_000_000, true);

  assert.deepEqual(decodeStatus(bytes), {
    version: 1,
    status: BandStatus.Red,
    reason: StatusReason.StillColdAtRecheck,
    contactPct: 95,
    timestamp: 1_792_000_000,
  });
});

const sample: SummaryRecord = {
  timestamp: 100,
  skinTempC: 35.4,
  roomTempC: 19.6,
  contactPct: 96,
  heartRateBpm: 142,
  status: BandStatus.Yellow,
  flags: 0,
  seq: 7,
  hrvRmssdMs: 31,
  hrQuality: 80,
  batteryPct: 74,
};

test("summary record is 20 bytes with fields at fixed offsets", () => {
  const bytes = encodeSummary(sample);
  const v = new DataView(bytes.buffer);
  assert.equal(bytes.byteLength, 20);
  assert.equal(v.getInt16(4, true), 3540); // skin, centi-°C
  assert.equal(v.getUint32(12, true), 7); // seq
  assert.equal(v.getUint16(16, true), 31); // HRV
  assert.equal(v.getUint8(19), 74); // battery
});

test("decodes a summary page and maps sentinels to null", () => {
  const missing: SummaryRecord = {
    ...sample,
    seq: 8,
    timestamp: 160,
    skinTempC: null,
    heartRateBpm: null,
    hrvRmssdMs: null,
    status: BandStatus.Grey,
  };
  const page = new Uint8Array([...encodeSummary(sample), ...encodeSummary(missing)]);

  const [a, b] = decodeSummaryPage(page);
  assert.deepEqual(a, sample);
  assert.equal(b.skinTempC, null);
  assert.equal(b.heartRateBpm, null);
  assert.equal(b.hrvRmssdMs, null);
  assert.equal(b.status, BandStatus.Grey);
});

test("live reading round trip at fixed offsets", () => {
  const r = {
    timestamp: 1_792_000_000,
    skinTempC: 35.2,
    roomTempC: null,
    contactPct: 88,
    heartRateBpm: 144,
    batteryPct: 61,
    flags: ReadingFlag.NoContact,
  };
  const bytes = encodeReading(r);
  assert.equal(bytes.byteLength, 12);
  assert.equal(new DataView(bytes.buffer).getInt16(4, true), 3520);
  assert.deepEqual(decodeReading(bytes), r);
});

test("encodes set-time and set-status commands", () => {
  assert.deepEqual([...encodeCommand(CommandCode.SetTime, 1)], [0x06, 1, 0, 0, 0]);
  assert.deepEqual([...encodeCommand(CommandCode.SetStatus, BandStatus.Red)], [0x07, 2]);
});

test("encodes the summary cursor command", () => {
  assert.deepEqual([...encodeCommand(CommandCode.SetSummaryCursor, 258)], [0x03, 2, 1, 0, 0]);
});

test("base64 round trip", () => {
  const bytes = Uint8Array.of(0, 1, 254, 255);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});
