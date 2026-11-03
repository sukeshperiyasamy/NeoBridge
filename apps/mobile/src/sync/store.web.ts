import type { SummaryRecord } from '@neobridge/ble-protocol';

import type { ReadingStore } from './types';

// Browser preview only: same behaviour as the SQLite store, kept in localStorage.
const KEY = 'neobridge.readings';

type Saved = Record<string, Record<string, SummaryRecord & { uploaded: boolean }>>;

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

function save(data: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full or blocked: readings stay in memory until reload
  }
}

export function createReadingStore(): ReadingStore {
  let data = load();
  const rows = (bandId: string) => Object.values(data[bandId] ?? {});

  return {
    async add(bandId, records) {
      const band = (data[bandId] ??= {});
      let added = 0;
      for (const r of records) {
        if (band[r.seq]) continue;
        band[r.seq] = { ...r, uploaded: false };
        added += 1;
      }
      save(data);
      return added;
    },

    async nextSeq(bandId) {
      const seqs = rows(bandId).map((r) => r.seq);
      return seqs.length ? Math.max(...seqs) + 1 : 1;
    },

    async pendingBatch(limit) {
      for (const bandId of Object.keys(data)) {
        const pending = rows(bandId)
          .filter((r) => !r.uploaded)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, limit)
          .map(({ uploaded: _u, ...r }) => r);
        if (pending.length) return { bandId, records: pending };
      }
      return null;
    },

    async markUploaded(bandId, seqs) {
      for (const seq of seqs) {
        const r = data[bandId]?.[seq];
        if (r) r.uploaded = true;
      }
      save(data);
    },

    async pendingCount() {
      return Object.keys(data).reduce((n, b) => n + rows(b).filter((r) => !r.uploaded).length, 0);
    },

    async prune(days) {
      const cutoff = Date.now() / 1000 - days * 86_400;
      for (const bandId of Object.keys(data)) {
        const newest = Math.max(...rows(bandId).map((r) => r.seq));
        for (const r of rows(bandId)) {
          if (r.uploaded && r.timestamp < cutoff && r.seq < newest) delete data[bandId][r.seq];
        }
      }
      save(data);
      data = load();
    },
  };
}
