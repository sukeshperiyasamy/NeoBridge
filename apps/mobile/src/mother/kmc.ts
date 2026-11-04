import AsyncStorage from '@react-native-async-storage/async-storage';

import { istDate, kmcHoursOn, type KmcHolder } from '@neobridge/domain';

import { clientId } from '@/api/client';
import { getOutbox } from '@/api/outbox';

/**
 * M12: KMC sessions started and stopped by the family on Home. Kept on the
 * phone (Baby's day works offline) and sent to the server as each one ends.
 */

export interface KmcSession {
  id: string;
  babyId: string;
  holder: KmcHolder;
  startedAt: number;
  endedAt: number | null;
}

export interface KmcState {
  running: KmcSession | null;
  /** last 8 days, finished sessions */
  sessions: KmcSession[];
  /** "Are you doing KMC now?" was answered no; don't ask again until then */
  askSnoozedUntil: number;
}

const KEY = 'neobridge.kmc';
const KEEP_MS = 8 * 86_400_000;

class KmcStore {
  private state: KmcState = { running: null, sessions: [], askSnoozedUntil: 0 };
  private listeners = new Set<() => void>();

  constructor() {
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) this.set(JSON.parse(raw) as KmcState, false);
      })
      .catch(() => undefined);
  }

  getState = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(next: KmcState, persist = true) {
    this.state = next;
    if (persist) void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
    this.listeners.forEach((l) => l());
  }

  start(babyId: string, holder: KmcHolder) {
    if (this.state.running) return;
    const running: KmcSession = { id: clientId('kmc'), babyId, holder, startedAt: Date.now(), endedAt: null };
    this.set({ ...this.state, running });
    void getOutbox().push({ id: running.id + '-start', method: 'POST', path: '/v1/kmc-sessions', body: running, label: 'KMC' });
  }

  stop() {
    const r = this.state.running;
    if (!r) return;
    const done = { ...r, endedAt: Date.now() };
    const sessions = [...this.state.sessions, done].filter((s) => Date.now() - (s.endedAt ?? 0) < KEEP_MS);
    this.set({ ...this.state, running: null, sessions });
    void getOutbox().push({ id: done.id + '-end', method: 'POST', path: '/v1/kmc-sessions', body: done, label: 'KMC' });
  }

  setHolder(holder: KmcHolder) {
    if (!this.state.running) return;
    this.set({ ...this.state, running: { ...this.state.running, holder } });
  }

  snoozeAsk(ms = 60 * 60_000) {
    this.set({ ...this.state, askSnoozedUntil: Date.now() + ms });
  }

  /** Hours of KMC on a day (India time), including the running session. */
  hoursOn(date: string, now = Date.now()): number {
    const all = [...this.state.sessions, ...(this.state.running ? [this.state.running] : [])];
    return kmcHoursOn(date, all, now);
  }

  todayHours(now = Date.now()) {
    return this.hoursOn(istDate(now), now);
  }

  /** When the last session ended (for the KMC nudge reminder). */
  lastEndedAt(): number | null {
    if (this.state.running) return Date.now();
    const ends = this.state.sessions.map((s) => s.endedAt ?? 0);
    return ends.length ? Math.max(...ends) : null;
  }
}

let store: KmcStore | null = null;
export function getKmc(): KmcStore {
  store ??= new KmcStore();
  return store;
}
