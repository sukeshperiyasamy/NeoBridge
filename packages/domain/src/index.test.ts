import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dashboardFor,
  dayOfLife,
  istDate,
  istMidnight,
  kmcHoursOn,
  notGaining,
  triageRank,
  visitSchedule,
  visitState,
  weightGain,
  weightTrend,
} from './index';

test('facility delivery: visits on days 3, 7, 14, 21, 28, 42', () => {
  const s = visitSchedule({ deliveryPlace: 'facility', birthDate: '2026-11-01', sncuAdmitted: false });
  assert.deepEqual(
    s.map((v) => [v.day, v.dueDate]),
    [
      [3, '2026-11-03'],
      [7, '2026-11-07'],
      [14, '2026-11-14'],
      [21, '2026-11-21'],
      [28, '2026-11-28'],
      [42, '2026-12-12'],
    ],
  );
});

test('home delivery adds a day-1 visit', () => {
  const s = visitSchedule({ deliveryPlace: 'home', birthDate: '2026-11-01', sncuAdmitted: false });
  assert.deepEqual(s[0], { day: 1, dueDate: '2026-11-01', basis: 'birth' });
  assert.equal(s.length, 7);
});

test('SNCU discharge: first visit within 24 h, then counted from discharge', () => {
  const s = visitSchedule({
    deliveryPlace: 'facility',
    birthDate: '2026-10-20',
    sncuAdmitted: true,
    dischargeDate: '2026-11-02',
  });
  assert.equal(s[0].dueDate, '2026-11-03');
  assert.equal(s[1].day, 3);
  assert.equal(s[1].dueDate, '2026-11-04');
  assert.ok(s.every((v) => v.basis === 'discharge'));
});

test('a visit is due on its day and overdue from the next', () => {
  assert.equal(visitState('2026-11-07', null, '2026-11-06'), 'upcoming');
  assert.equal(visitState('2026-11-07', null, '2026-11-07'), 'due');
  assert.equal(visitState('2026-11-07', null, '2026-11-08'), 'overdue');
  assert.equal(visitState('2026-11-07', 1, '2026-11-08'), 'done');
});

test('day of life counts the birth day as day 1, in India time', () => {
  const born = Date.parse('2026-11-01T20:00:00Z'); // 2 Nov 01:30 IST
  assert.equal(istDate(born), '2026-11-02');
  assert.equal(dayOfLife(born, Date.parse('2026-11-02T10:00:00Z')), 1);
  assert.equal(dayOfLife(born, Date.parse('2026-11-08T10:00:00Z')), 7);
});

test('weight gain in g/kg/day', () => {
  assert.equal(weightGain(2000, 2150, 5), 15);
  assert.equal(weightGain(2000, 1950, 5), -5);
  assert.equal(weightGain(2000, 2100, 0), null);
});

test('weight trend arrow and not gaining', () => {
  const up = [
    { at: '2026-11-01', grams: 2000 },
    { at: '2026-11-08', grams: 2150 },
  ];
  assert.equal(weightTrend(up), 'up');
  assert.equal(notGaining(up), false);
  const flat = [
    { at: '2026-11-01', grams: 2000 },
    { at: '2026-11-08', grams: 2020 },
  ];
  assert.equal(weightTrend(flat), 'flat');
  assert.equal(notGaining(flat), true);
  assert.equal(weightTrend([{ at: '2026-11-01', grams: 2000 }]), null);
});

test('KMC hours are clipped to the day', () => {
  const day = '2026-11-04';
  const start = istMidnight(day);
  const h = 3_600_000;
  const hours = kmcHoursOn(
    day,
    [
      { startedAt: start - 2 * h, endedAt: start + 1 * h }, // 1 h inside
      { startedAt: start + 5 * h, endedAt: start + 8 * h }, // 3 h
      { startedAt: start + 23 * h, endedAt: null }, // running: 30 min by "now"
    ],
    start + 23.5 * h,
  );
  assert.equal(hours, 4.5);
});

test('A1 order: red unacked, red acked, yellow, grey, overdue, due today, green', () => {
  const base = { status: 'green' as const, openEpisode: null, visitOverdue: false, visitDueToday: false };
  const ranks = [
    triageRank({ ...base, status: 'red', openEpisode: { staffAcknowledgedAt: null } }),
    triageRank({ ...base, status: 'red', openEpisode: { staffAcknowledgedAt: 1 } }),
    triageRank({ ...base, status: 'yellow' }),
    triageRank({ ...base, status: 'grey' }),
    triageRank({ ...base, visitOverdue: true }),
    triageRank({ ...base, visitDueToday: true }),
    triageRank(base),
  ];
  assert.deepEqual(ranks, [0, 1, 2, 3, 4, 5, 6]);
});

test('specialisation picks the dashboard', () => {
  assert.equal(dashboardFor('neonatology'), 'newborn');
  assert.equal(dashboardFor('paediatrics'), 'newborn');
  assert.equal(dashboardFor('obstetrics'), 'postpartum');
  assert.equal(dashboardFor('general'), 'catchment');
});
