import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  acknowledge,
  closeEpisode,
  defaultConfig,
  demoConfig,
  evaluate,
  initialState,
  median,
  type RuleReading,
  type RulesResult,
  type RulesState,
} from './index';

const STEP = 30_000; // the real band reports every 30 s

const reading = (at: number, skinTempC: number | null, extra: Partial<RuleReading> = {}): RuleReading => ({
  at,
  skinTempC,
  noContact: false,
  sensorError: false,
  batteryPct: 80,
  ...extra,
});

/**
 * Feeds one reading every 30 s from `temps` and runs the rules after each,
 * like the phone does. Returns every result.
 */
function run(
  temps: (number | null)[],
  opts: { state?: RulesState; start?: number; dangerSignAt?: number | null; offset?: number } = {},
): RulesResult[] {
  let state = opts.state ?? initialState;
  const start = opts.start ?? 1_000_000;
  const readings: RuleReading[] = [];
  return temps.map((t, i) => {
    const now = start + i * STEP;
    readings.push(reading(now, t));
    const r = evaluate(
      { now, readings, calibrationOffsetC: opts.offset ?? 0, dangerSignAt: opts.dangerSignAt ?? null },
      state,
    );
    state = r.state;
    return r;
  });
}

const last = <T>(xs: T[]) => xs[xs.length - 1];
const repeat = (t: number, n: number) => Array<number>(n).fill(t);

test('median of an even and odd count', () => {
  assert.equal(median([36, 35, 37, 38]), 36.5);
  assert.equal(median([36, 34, 35]), 35);
  assert.equal(median([]), null);
});

test('rule 8: a warm baby is green', () => {
  const r = last(run(repeat(36.5, 6)));
  assert.equal(r.status, 'green');
  assert.equal(r.rule, 8);
});

test('rule 3: no reading for 90 s is grey', () => {
  const now = 1_000_000;
  const r = evaluate(
    { now: now + 91_000, readings: [reading(now, 36.5)], calibrationOffsetC: 0, dangerSignAt: null },
    initialState,
  );
  assert.equal(r.status, 'grey');
  assert.equal(r.reason, 'noReading');
});

test('rule 3: contact lost, sensor error and low battery are grey', () => {
  const now = 1_000_000;
  const cases: [Partial<RuleReading>, string][] = [
    [{ noContact: true }, 'noContact'],
    [{ sensorError: true }, 'sensorError'],
    [{ batteryPct: 9 }, 'lowBattery'],
  ];
  for (const [extra, reason] of cases) {
    const r = evaluate(
      { now, readings: [reading(now, 36.5, extra)], calibrationOffsetC: 0, dangerSignAt: null },
      initialState,
    );
    assert.equal(r.status, 'grey');
    assert.equal(r.reason, reason);
  }
});

test('rule 7: cold for 2 minutes turns yellow, not before', () => {
  // the median of 4 crosses on the 3rd cold reading; 2 min later is 4 readings on
  const results = run([...repeat(36.5, 4), ...repeat(35.2, 7)]);
  assert.equal(results[9].status, 'green'); // not yet 2 min
  const y = results[10];
  assert.equal(y.status, 'yellow');
  assert.equal(y.reason, 'gettingCold');
  assert.ok(y.events.some((e) => e.type === 'yellowStarted'));
});

test('a single cold reading is smoothed out by the median', () => {
  const r = run([36.5, 36.5, 36.5, 33.0, 36.5, 36.5, 36.5, 36.5, 36.5]);
  assert.ok(r.every((x) => x.status === 'green'));
});

test('rule 4: very cold for 2 minutes goes straight to red', () => {
  const r = last(run([...repeat(36.5, 4), ...repeat(34.0, 8)]));
  assert.equal(r.status, 'red');
  assert.equal(r.reason, 'veryCold');
  assert.equal(r.state.episode?.trigger, 'veryCold');
});

test('rule 5: too warm for 2 minutes is red', () => {
  const r = last(run([...repeat(36.5, 4), ...repeat(38.2, 8)]));
  assert.equal(r.status, 'red');
  assert.equal(r.reason, 'tooWarm');
});

test('rule 6: still cold at the yellow re-check is red', () => {
  const start = 1_000_000;
  const yellow = last(run([...repeat(36.5, 4), ...repeat(35.2, 7)], { start }));
  assert.equal(yellow.status, 'yellow');
  const recheckAt = yellow.state.yellow!.recheckAt;

  // still cold, just before and at the re-check
  const now = recheckAt;
  const readings = [reading(now - 90_000, 35.2), reading(now - 60_000, 35.2), reading(now - 30_000, 35.2)];
  const before = evaluate(
    { now: now - 30_000, readings, calibrationOffsetC: 0, dangerSignAt: null },
    yellow.state,
  );
  assert.equal(before.status, 'yellow');
  const at = evaluate(
    { now, readings: [...readings, reading(now, 35.2)], calibrationOffsetC: 0, dangerSignAt: null },
    before.state,
  );
  assert.equal(at.status, 'red');
  assert.equal(at.reason, 'stillCold');
  assert.equal(at.state.yellow, null);
});

test('yellow closes to green when the baby is warm at the re-check', () => {
  const yellow = last(run([...repeat(36.5, 4), ...repeat(35.2, 7)]));
  const now = yellow.state.yellow!.recheckAt;
  const readings = [36.6, 36.6, 36.6, 36.6].map((t, i) => reading(now - (3 - i) * STEP, t));
  const r = evaluate({ now, readings, calibrationOffsetC: 0, dangerSignAt: null }, yellow.state);
  assert.equal(r.status, 'green');
  assert.ok(r.events.some((e) => e.type === 'yellowClosed'));
  assert.equal(r.state.yellow, null);
});

test('rule 2: a danger sign is red whatever the band shows, once per answer', () => {
  const answeredAt = 999_000;
  const r = run(repeat(36.5, 3), { dangerSignAt: answeredAt });
  assert.equal(r[0].status, 'red');
  assert.equal(r[0].reason, 'dangerSign');
  assert.equal(r[0].rule, 2);
  assert.equal(r[2].rule, 1); // held open by the episode

  const { state } = closeEpisode(r[2].state, 2_000_000, 'asha-1', 'visited, baby warm');
  const after = last(run(repeat(36.5, 2), { state, start: 2_000_000, dangerSignAt: answeredAt }));
  assert.equal(after.status, 'green'); // the same answer does not re-open red
});

test('rule 1: red stays red after warming up until closed; ack keeps it open', () => {
  const red = last(run([...repeat(36.5, 4), ...repeat(34.0, 8)]));
  const acked = acknowledge(red.state, 5_000_000);
  assert.equal(acked.episode?.acknowledgedAt, 5_000_000);

  const warm = last(run(repeat(36.6, 6), { state: acked, start: 5_000_000 }));
  assert.equal(warm.status, 'red');
  assert.equal(warm.rule, 1);

  const { state, closed } = closeEpisode(warm.state, 6_000_000, 'asha-1', 'phone check: baby warm, feeding');
  assert.equal(closed?.closedBy, 'asha-1');
  const green = last(run(repeat(36.6, 4), { state, start: 6_000_000 }));
  assert.equal(green.status, 'green');
});

test('red beats grey when an episode is open', () => {
  const red = last(run([...repeat(36.5, 4), ...repeat(34.0, 8)]));
  const now = 9_000_000;
  const r = evaluate({ now, readings: [], calibrationOffsetC: 0, dangerSignAt: null }, red.state);
  assert.equal(r.status, 'red');
});

test('the calibration offset is added before the lines', () => {
  // raw 35.2 reads as 36.0 with +0.8: not cold
  const r = run(repeat(35.2, 10), { offset: 0.8 });
  assert.ok(r.every((x) => x.status === 'green'));
  assert.equal(last(r).skinC, 36);
});

test('demo mode shortens 2 minutes to 10 seconds', () => {
  assert.equal(demoConfig.sustainMs, 10_000);
  assert.equal(demoConfig.recheckMs, 60_000);
  assert.equal(defaultConfig.sustainMs, 120_000);

  let state = initialState;
  const readings: RuleReading[] = [];
  let status = 'green';
  for (let i = 0; i < 8; i++) {
    const now = 1_000_000 + i * 5_000; // demo band: every 5 s
    readings.push(reading(now, 34.0));
    const r = evaluate({ now, readings, calibrationOffsetC: 0, dangerSignAt: null }, state, demoConfig);
    state = r.state;
    status = r.status;
  }
  assert.equal(status, 'red');
});
