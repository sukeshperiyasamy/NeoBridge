import * as SQLite from 'expo-sqlite';

import type { SummaryRecord } from '@neobridge/ble-protocol';

import type { ReadingStore } from './types';

const SCHEMA = `
  pragma journal_mode = wal;
  create table if not exists readings (
    band_id      text not null,
    seq          integer not null,
    recorded_at  integer not null,
    skin_temp_c  real,
    room_temp_c  real,
    contact_pct  integer not null,
    heart_rate   integer,
    hrv_rmssd_ms integer,
    hr_quality   integer not null,
    battery_pct  integer not null,
    status       integer not null,
    flags        integer not null,
    uploaded     integer not null default 0,
    primary key (band_id, seq)
  );
  create index if not exists readings_pending on readings (uploaded, band_id, seq);
`;

interface Row {
  band_id: string;
  seq: number;
  recorded_at: number;
  skin_temp_c: number | null;
  room_temp_c: number | null;
  contact_pct: number;
  heart_rate: number | null;
  hrv_rmssd_ms: number | null;
  hr_quality: number;
  battery_pct: number;
  status: number;
  flags: number;
}

const toRecord = (r: Row): SummaryRecord => ({
  seq: r.seq,
  timestamp: r.recorded_at,
  skinTempC: r.skin_temp_c,
  roomTempC: r.room_temp_c,
  contactPct: r.contact_pct,
  heartRateBpm: r.heart_rate,
  hrvRmssdMs: r.hrv_rmssd_ms,
  hrQuality: r.hr_quality,
  batteryPct: r.battery_pct,
  status: r.status,
  flags: r.flags,
});

/** SQLite on the phone (expo-sqlite). Survives restarts and days offline. */
export function createReadingStore(): ReadingStore {
  const ready = (async () => {
    const db = await SQLite.openDatabaseAsync('neobridge.db');
    await db.execAsync(SCHEMA);
    return db;
  })();

  return {
    async add(bandId, records) {
      const db = await ready;
      let added = 0;
      await db.withTransactionAsync(async () => {
        for (const r of records) {
          const result = await db.runAsync(
            `insert or ignore into readings
               (band_id, seq, recorded_at, skin_temp_c, room_temp_c, contact_pct, heart_rate,
                hrv_rmssd_ms, hr_quality, battery_pct, status, flags)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              bandId,
              r.seq,
              r.timestamp,
              r.skinTempC,
              r.roomTempC,
              r.contactPct,
              r.heartRateBpm,
              r.hrvRmssdMs,
              r.hrQuality,
              r.batteryPct,
              r.status,
              r.flags,
            ],
          );
          added += result.changes;
        }
      });
      return added;
    },

    async nextSeq(bandId) {
      const db = await ready;
      const row = await db.getFirstAsync<{ next: number | null }>(
        'select max(seq) + 1 as next from readings where band_id = ?',
        [bandId],
      );
      return row?.next ?? 1;
    },

    async pendingBatch(limit) {
      const db = await ready;
      const first = await db.getFirstAsync<{ band_id: string }>(
        'select band_id from readings where uploaded = 0 order by seq limit 1',
      );
      if (!first) return null;
      const rows = await db.getAllAsync<Row>(
        'select * from readings where uploaded = 0 and band_id = ? order by seq limit ?',
        [first.band_id, limit],
      );
      return { bandId: first.band_id, records: rows.map(toRecord) };
    },

    async markUploaded(bandId, seqs) {
      const db = await ready;
      await db.withTransactionAsync(async () => {
        for (const seq of seqs) {
          await db.runAsync('update readings set uploaded = 1 where band_id = ? and seq = ?', [bandId, seq]);
        }
      });
    },

    async pendingCount() {
      const db = await ready;
      const row = await db.getFirstAsync<{ n: number }>('select count(*) as n from readings where uploaded = 0');
      return row?.n ?? 0;
    },

    async prune(days) {
      const db = await ready;
      // keep the newest uploaded row per band, so nextSeq() still knows where to resume
      await db.runAsync(
        `delete from readings
          where uploaded = 1 and recorded_at < ?
            and seq < (select max(seq) from readings r where r.band_id = readings.band_id)`,
        [Math.floor(Date.now() / 1000) - days * 86_400],
      );
    },
  };
}
