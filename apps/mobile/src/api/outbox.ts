import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

import { ApiError, api } from './client';
import { invalidate } from './cache';

/**
 * Writes made on the phone (status, episodes, KMC, danger checks, visits…) go
 * into this queue first and are sent in order whenever there is internet.
 * Everything except sync works offline (PRD "Offline"). Every write carries its
 * own id, so the server ignores one that arrives twice.
 */

export interface OutboxItem {
  id: string;
  method: 'POST' | 'PATCH';
  path: string;
  body: unknown;
  /** what it is, for the sync banner and queue list */
  label: string;
  createdAt: number;
  attempts: number;
}

export interface OutboxState {
  online: boolean;
  pending: number;
  sending: boolean;
  lastSyncAt: number | null;
  /** queue paused: a mother's phone syncs nothing before consent (W1 step 5) */
  paused: boolean;
}

const KEY = 'neobridge.outbox';
const LAST_SYNC_KEY = 'neobridge.lastSync';
const RETRY_MS = [3_000, 10_000, 30_000, 60_000];

class Outbox {
  private items: OutboxItem[] = [];
  private listeners = new Set<() => void>();
  private loaded: Promise<void>;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private state: OutboxState = { online: true, pending: 0, sending: false, lastSyncAt: null, paused: false };

  constructor() {
    this.loaded = this.load();
    void Network.getNetworkStateAsync().then((s) => this.setOnline(s), () => undefined);
    Network.addNetworkStateListener((s) => this.setOnline(s));
    setInterval(() => void this.flush(), 20_000);
  }

  getState = () => this.state;
  getItems = () => this.items;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<OutboxState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private async load() {
    const [raw, last] = await Promise.all([
      AsyncStorage.getItem(KEY).catch(() => null),
      AsyncStorage.getItem(LAST_SYNC_KEY).catch(() => null),
    ]);
    this.items = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    this.set({ pending: this.items.length, lastSyncAt: last ? Number(last) : null });
  }

  private async save() {
    await AsyncStorage.setItem(KEY, JSON.stringify(this.items)).catch(() => undefined);
    this.set({ pending: this.items.length });
  }

  private setOnline(s: Network.NetworkState) {
    const online = s.isConnected !== false && s.isInternetReachable !== false;
    const back = online && !this.state.online;
    this.set({ online });
    if (back) {
      this.attempt = 0;
      void this.flush();
    }
  }

  setPaused(paused: boolean) {
    this.set({ paused });
    if (!paused) void this.flush();
  }

  /** Queue a write and try to send it now. */
  async push(item: Omit<OutboxItem, 'createdAt' | 'attempts'>) {
    await this.loaded;
    this.items.push({ ...item, createdAt: Date.now(), attempts: 0 });
    await this.save();
    void this.flush();
  }

  /** Drop everything queued (logout). */
  async clear() {
    await this.loaded;
    this.items = [];
    await this.save();
  }

  retryNow() {
    this.attempt = 0;
    void this.flush();
  }

  async flush() {
    await this.loaded;
    if (this.state.sending || this.state.paused || this.items.length === 0) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.set({ sending: true });
    try {
      while (this.items.length > 0) {
        const item = this.items[0];
        try {
          await api(item.method, item.path, item.body);
        } catch (e) {
          const err = e as ApiError;
          // the server rejected it for good (bad data, no permission): don't block the queue
          const permanent = err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status);
          if (!permanent) throw err;
          console.warn('outbox: dropped', item.label, err.code);
        }
        this.items.shift();
        await this.save();
        invalidate(item.path.split('/').slice(0, 3).join('/'));
      }
      this.attempt = 0;
      const now = Date.now();
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(now)).catch(() => undefined);
      this.set({ lastSyncAt: now, online: true });
      invalidate('');
    } catch (e) {
      if ((e as ApiError).offline) this.set({ online: false });
      const delay = RETRY_MS[Math.min(this.attempt, RETRY_MS.length - 1)];
      this.attempt += 1;
      this.retryTimer = setTimeout(() => void this.flush(), delay);
    } finally {
      this.set({ sending: false });
    }
  }

  /** A read succeeded: the server is reachable. */
  markSynced() {
    const now = Date.now();
    void AsyncStorage.setItem(LAST_SYNC_KEY, String(now)).catch(() => undefined);
    this.set({ lastSyncAt: now, online: true });
  }
}

let outbox: Outbox | null = null;
export function getOutbox(): Outbox {
  outbox ??= new Outbox();
  return outbox;
}
