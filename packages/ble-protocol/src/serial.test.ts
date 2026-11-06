import { test } from "node:test";
import assert from "node:assert/strict";

import { BootClock, SerialCommand, parseSerialLine } from "./serial";

test("parses a LIVE line from the sketch", () => {
  const m = parseSerialLine("LIVE,7,123456,141,98,36.52,NA,NORMAL\r");
  assert.deepEqual(m, {
    kind: "live",
    bootId: 7,
    uptimeMs: 123456,
    heartRate: 141,
    spo2: 98,
    ntc1C: 36.52,
    ntc2C: null,
    unix: null,
    alarm: false,
    batteryPct: null,
    contact: null,
    pattern: null,
  });
  assert.equal((parseSerialLine("LIVE,7,1,140,98,NA,NA,ALARM") as { alarm: boolean }).alarm, true);
});

test("parses a DATA row from the SD card", () => {
  const m = parseSerialLine("DATA,42,3,60000,140,97,35.10,34.90");
  assert.deepEqual(m, {
    kind: "data",
    id: 42,
    bootId: 3,
    uptimeMs: 60000,
    heartRate: 140,
    spo2: 97,
    ntc1C: 35.1,
    ntc2C: 34.9,
    unix: null,
  });
});

test("parses the v2 fields added at the end of LIVE and DATA", () => {
  const live = parseSerialLine("LIVE,8,5000,140,98,36.10,28.40,NORMAL,1793916000,76,1,YELLOW");
  assert.equal(live.kind, "live");
  if (live.kind !== "live") return;
  assert.equal(live.unix, 1793916000);
  assert.equal(live.batteryPct, 76);
  assert.equal(live.contact, true);
  assert.equal(live.pattern, "YELLOW");
  // no time yet, no battery divider
  const early = parseSerialLine("LIVE,8,5000,NA,NA,NA,NA,NORMAL,0,NA,0,OFF");
  if (early.kind !== "live") return assert.fail();
  assert.equal(early.unix, null);
  assert.equal(early.batteryPct, null);
  assert.equal(early.contact, false);
  assert.equal(early.heartRate, null);

  const data = parseSerialLine("DATA,12,8,60000,140,97,35.10,34.90,1793916060");
  if (data.kind !== "data") return assert.fail();
  assert.equal(data.unix, 1793916060);
  assert.equal(data.id, 12);
});

test("parses HELLO and the v2 commands", () => {
  assert.deepEqual(parseSerialLine("HELLO,2,NeoBridge-54DA,1"), {
    kind: "hello",
    version: 2,
    name: "NeoBridge-54DA",
    simulatedVitals: true,
  });
  assert.deepEqual(parseSerialLine("TIME_OK"), { kind: "timeOk" });
  assert.equal(SerialCommand.setStatus("RED"), "STATUS,RED");
  assert.equal(SerialCommand.time(1793916000.7), "TIME,1793916000");
  assert.equal(SerialCommand.silence, "SILENCE");
});

test("parses short replies and keeps everything else as a notice", () => {
  assert.deepEqual(parseSerialLine("ACK_OK,42"), { kind: "ackOk", id: 42 });
  assert.deepEqual(parseSerialLine("PENDING_COUNT,1500"), { kind: "pendingCount", count: 1500 });
  assert.deepEqual(parseSerialLine("SYNC_COMPLETE"), { kind: "notice", text: "SYNC_COMPLETE" });
  // a malformed LIVE line must not turn into a reading
  assert.equal(parseSerialLine("LIVE,x,1,140,98,36,36,NORMAL").kind, "notice");
  assert.equal(parseSerialLine("DATA,5,3").kind, "notice");
});

test("commands match the sketch's processCommand()", () => {
  assert.equal(SerialCommand.ack(9), "ACK,9");
  assert.equal(SerialCommand.simHeartRate(180.4), "SIM HR 180");
  assert.equal(SerialCommand.alarmOn, "TEST ON");
});

test("BootClock places rows from boots the phone saw live", () => {
  const clock = new BootClock();
  assert.equal(clock.learn(4, 10_000, 1_000_000), true);
  assert.equal(clock.learn(4, 12_000, 1_002_000), false);
  assert.equal(clock.timeOf(4, 5_000), 995_000);
  assert.equal(clock.timeOf(3, 5_000), null);
  const restored = new BootClock(clock.toJSON());
  assert.equal(restored.timeOf(4, 0), 990_000);
});
