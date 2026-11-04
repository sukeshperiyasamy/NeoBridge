import type { EpisodeDto } from '@neobridge/domain';
import { t, type Key, type UiLanguage } from '@neobridge/i18n';

import { api } from '@/api/client';
import { getOutbox } from '@/api/outbox';
import { getBandController, type BandState } from '@/ble/band-controller';
import { alarmNow } from '@/notify';

/**
 * Mother's phone ↔ server (W2, W3). Watches the band controller and:
 * - reports every status change (the ASHA's list and the doctor see it)
 * - sends red and yellow episodes as they start and end, and the family's ack
 * - rings the alarm channel on a new red (it rings even on silent)
 * - while a red is open, asks the server every 15 s whether the ASHA has
 *   acknowledged ("ASHA is coming") or closed it; a close clears red here too.
 * Everything goes through the outbox, so it works offline and catches up later.
 */

export interface BridgeState {
  /** the ASHA (or a doctor) has acknowledged the open red */
  staffAck: { name: string; at: string } | null;
}

const POLL_MS = 15_000;

class MotherBridge {
  private babyId: string | null = null;
  private lang: UiLanguage = 'hi';
  private unsub: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private prev: BandState | null = null;
  private listeners = new Set<() => void>();
  private state: BridgeState = { staffAck: null };

  getState = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private set(patch: Partial<BridgeState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  start(babyId: string, lang: UiLanguage) {
    this.lang = lang;
    if (this.babyId === babyId && this.unsub) return;
    this.stop();
    this.babyId = babyId;
    const band = getBandController();
    this.prev = null;
    this.onChange(band.getState());
    this.unsub = band.subscribe(() => this.onChange(band.getState()));
    this.poll = setInterval(() => void this.checkEpisode(), POLL_MS);
    void this.checkEpisode();
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    this.babyId = null;
    this.set({ staffAck: null });
  }

  setLanguage(lang: UiLanguage) {
    this.lang = lang;
  }

  private queue(label: string, path: string, body: unknown) {
    void getOutbox().push({ id: `${path}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, method: 'POST', path, body, label });
  }

  private onChange(s: BandState) {
    const babyId = this.babyId;
    if (!babyId) return;
    const p = this.prev;
    this.prev = s;

    // status changes (skip the very first grey while the band connects)
    if (!p || p.rules.status !== s.rules.status || p.rules.reason !== s.rules.reason) {
      if (p || s.rules.status !== 'grey') {
        this.queue('Status', `/v1/babies/${babyId}/status`, { status: s.rules.status, reason: s.rules.reason, at: Date.now() });
      }
    }

    // red episode
    const ep = s.episode;
    const prevEp = p?.episode ?? null;
    if (ep && (!prevEp || prevEp.id !== ep.id)) {
      const isNew = !p || Date.now() - ep.startedAt < 60_000;
      this.queue('Red alert', '/v1/episodes', {
        id: ep.id,
        babyId,
        kind: 'red',
        trigger: ep.trigger,
        startedAt: ep.startedAt,
        familyAcknowledgedAt: ep.acknowledgedAt,
      });
      if (isNew && !ep.acknowledgedAt) {
        void alarmNow(t(this.lang, 'red.title'), t(this.lang, `red.reason.${ep.trigger}` as Key)).catch(() => undefined);
      }
      this.set({ staffAck: null });
      void this.checkEpisode();
    }
    if (ep && prevEp?.id === ep.id && ep.acknowledgedAt && !prevEp.acknowledgedAt) {
      this.queue('Seen', '/v1/episodes', {
        id: ep.id,
        babyId,
        kind: 'red',
        trigger: ep.trigger,
        startedAt: ep.startedAt,
        familyAcknowledgedAt: ep.acknowledgedAt,
      });
    }
    if (!ep && prevEp) this.set({ staffAck: null });

    // yellow episode: starts with a re-check time, ends when it clears
    const yStart = s.yellowStartedAt;
    const pyStart = p?.yellowStartedAt ?? null;
    if (yStart && yStart !== pyStart) {
      this.queue('Yellow', '/v1/episodes', { id: `y-${babyId.slice(0, 8)}-${yStart}`, babyId, kind: 'yellow', trigger: 'gettingCold', startedAt: yStart });
    }
    if (pyStart && pyStart !== yStart) {
      this.queue('Yellow ended', '/v1/episodes', {
        id: `y-${babyId.slice(0, 8)}-${pyStart}`,
        babyId,
        kind: 'yellow',
        trigger: 'gettingCold',
        startedAt: pyStart,
        endedAt: Date.now(),
      });
    }
  }

  /** Ask the server about the open red: acknowledged by the ASHA? closed? */
  private async checkEpisode() {
    const band = getBandController();
    const ep = band.getState().episode;
    if (!ep || !this.babyId) return;
    try {
      const res = await api<{ episode: EpisodeDto }>('GET', `/v1/episodes/${encodeURIComponent(ep.id)}`);
      const e = res.episode;
      if (e.closedAt) {
        band.closeRed(e.closedBy?.name ?? 'staff', e.closeReason ?? '');
        this.set({ staffAck: null });
        return;
      }
      if (e.staffAcknowledgedAt && e.staffAcknowledgedBy) {
        this.set({ staffAck: { name: e.staffAcknowledgedBy.name, at: e.staffAcknowledgedAt } });
      }
    } catch {
      // offline, or the episode hasn't reached the server yet: try again next time
    }
  }
}

let bridge: MotherBridge | null = null;
export function getMotherBridge(): MotherBridge {
  bridge ??= new MotherBridge();
  return bridge;
}
