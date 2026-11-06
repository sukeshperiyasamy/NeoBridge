import * as Network from 'expo-network';

import type { SummaryRecord } from '@neobridge/ble-protocol';

import { getApiUrl, getToken } from '@/api/client';

import { createReadingStore } from './store';

const BATCH = 200;
const RETRY_SECONDS = [5, 30, 120, 300];
const KEEP_UPLOADED_DAYS = 7;
/**
 * Band readings go up in batches, not one a minute: every upload wakes the
 * database, and a phone uploading every minute would keep it awake all day
 * (Neon's free plan counts the hours it is awake). Alerts and status changes
 * don't wait for this; they go through the outbox at once.
 */
const UPLOAD_EVERY_MS = 15 * 60_000;

export interface SyncState {
  online: boolean;
  /** readings saved on the phone that the server doesn't have yet */
  pending: number;
  uploading: boolean;
  lastUploadAt: number | null;
  /** why the last upload didn't finish; cleared on the next success */
  problem: 'offline' | 'server' | null;
}

/**
 * Phone → server. Readings from the band are saved on the phone first
 * (save()), then uploaded whenever there is internet. If the upload fails or
 * the phone is offline they stay saved and are retried with backoff, and again
 * as soon as the network comes back. The server ignores duplicates, so a
 * batch that is re-sent after a dropped connection is harmless.
 */
class SyncEngine {
  private store = createReadingStore();
  private listeners = new Set<() => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private state: SyncState = { online: false, pending: 0, uploading: false, lastUploadAt: null, problem: null };

  constructor() {
    void Network.getNetworkStateAsync().then((s) => this.setOnline(s));
    Network.addNetworkStateListener((s) => this.setOnline(s));
    setInterval(() => {
      if (this.uploadDue()) void this.upload();
    }, 60_000);
    void this.refreshPending();
  }

  getState = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private setOnline(s: Network.NetworkState) {
    const online = s.isConnected !== false && s.isInternetReachable !== false;
    const cameBack = online && !this.state.online;
    this.set({ online, problem: online ? this.state.problem : 'offline' });
    if (cameBack) {
      this.attempt = 0;
      void this.upload();
    }
  }

  private uploadDue() {
    const last = this.state.lastUploadAt;
    return last === null || Date.now() - last >= UPLOAD_EVERY_MS;
  }

  private async refreshPending() {
    this.set({ pending: await this.store.pendingCount() });
  }

  /** Saves band readings on the phone, then tries to upload. Returns how many were new. */
  async save(bandId: string, records: SummaryRecord[]): Promise<number> {
    const added = await this.store.add(bandId, records);
    await this.refreshPending();
    if (added && this.uploadDue()) void this.upload();
    return added;
  }

  nextSeq(bandId: string): Promise<number> {
    return this.store.nextSeq(bandId);
  }

  /** Upload now, skipping any backoff wait. */
  uploadNow() {
    this.attempt = 0;
    void this.upload();
  }

  private async upload() {
    if (this.state.uploading) return;
    if (!this.state.online) return this.set({ problem: 'offline' });
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;

    this.set({ uploading: true });
    try {
      for (;;) {
        const batch = await this.store.pendingBatch(BATCH);
        if (!batch) break;
        await this.post(batch.bandId, batch.records);
        await this.store.markUploaded(batch.bandId, batch.records.map((r) => r.seq));
        await this.refreshPending();
      }
      this.attempt = 0;
      this.set({ lastUploadAt: Date.now(), problem: null });
      void this.store.prune(KEEP_UPLOADED_DAYS);
    } catch {
      this.set({ problem: this.state.online ? 'server' : 'offline' });
      const delay = RETRY_SECONDS[Math.min(this.attempt, RETRY_SECONDS.length - 1)];
      this.attempt += 1;
      this.retryTimer = setTimeout(() => void this.upload(), delay * 1000);
    } finally {
      this.set({ uploading: false });
      await this.refreshPending();
    }
  }

  private async post(bandId: string, records: SummaryRecord[]) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 20_000);
    const token = await getToken();
    if (!token) throw new Error('not signed in');
    try {
      const res = await fetch(`${await getApiUrl()}/v1/bands/${encodeURIComponent(bandId)}/summaries`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(records),
        signal: abort.signal,
      });
      if (res.status === 429) {
        // the server's per-minute limit: wait as long as it says
        const wait = Number(res.headers.get('retry-after') ?? 60);
        throw new Error(`rate limited, retry in ${wait} s`);
      }
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

let engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  engine ??= new SyncEngine();
  return engine;
}
