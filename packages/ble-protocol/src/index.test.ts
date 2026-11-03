import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BandStatus,
  CommandCode,
  StatusReason,
  decodeStatus,
  decodeSummaryPage,
  encodeCommand,
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

test("decodes a summary page and maps sentinels to null", () => {
  const bytes = new Uint8Array(32);
  const v = new DataView(bytes.buffer);
  // record 0: 35.40 °C skin, 19.60 °C room, HR 142
  v.setUint32(0, 100, true);
  v.setInt16(4, 3540, true);
  v.setInt16(6, 1960, true);
  v.setUint8(8, 96);
  v.setUint8(9, BandStatus.Yellow);
  v.setUint8(10, 142);
  v.setUint32(12, 7, true);
  // record 1: no skin reading, no heart rate
  v.setUint32(16, 160, true);
  v.setInt16(20, -32768, true);
  v.setInt16(22, 2000, true);
  v.setUint8(25, BandStatus.Grey);
  v.setUint32(28, 8, true);

  const [a, b] = decodeSummaryPage(bytes);
  assert.equal(a.skinTempC, 35.4);
  assert.equal(a.roomTempC, 19.6);
  assert.equal(a.heartRateBpm, 142);
  assert.equal(a.seq, 7);
  assert.equal(b.skinTempC, null);
  assert.equal(b.heartRateBpm, null);
  assert.equal(b.status, BandStatus.Grey);
});

test("encodes the summary cursor command", () => {
  assert.deepEqual([...encodeCommand(CommandCode.SetSummaryCursor, 258)], [0x03, 2, 1, 0, 0]);
});

test("base64 round trip", () => {
  const bytes = Uint8Array.of(0, 1, 254, 255);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});
