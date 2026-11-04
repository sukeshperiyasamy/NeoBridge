import AsyncStorage from '@react-native-async-storage/async-storage';

import { addDays, istDate, istMidnight, type BabyDetail } from '@neobridge/domain';
import { t, type UiLanguage } from '@neobridge/i18n';

import { scheduleReminders, type ReminderNote } from '@/notify';

/**
 * M16, M17 reminders (PRD "Reminder types"). Local notifications, so they ring
 * offline. Times are placeholders until the clinical lead confirms them. The
 * family can change times and turn off any type except the danger-sign check.
 */

export type ReminderType = 'feeding' | 'kmcNudge' | 'dangerCheck' | 'chargeBand' | 'ashaVisit' | 'doctorFollowUp' | 'vaccines';
export const reminderTypes: ReminderType[] = ['feeding', 'kmcNudge', 'dangerCheck', 'chargeBand', 'ashaVisit', 'doctorFollowUp', 'vaccines'];

export interface ReminderSetting {
  enabled: boolean;
  /** 'HH:MM' for daily / day-before types; feeding uses everyHours */
  time: string;
  everyHours?: number;
}

export type ReminderSettings = Record<ReminderType, ReminderSetting>;

export const defaultReminders: ReminderSettings = {
  feeding: { enabled: true, time: '06:00', everyHours: 2 },
  kmcNudge: { enabled: true, time: '06:00' },
  dangerCheck: { enabled: true, time: '20:00' },
  chargeBand: { enabled: true, time: '09:00' },
  ashaVisit: { enabled: true, time: '18:00' },
  doctorFollowUp: { enabled: true, time: '18:00' },
  vaccines: { enabled: true, time: '09:00' },
};

/** The danger-sign check can't be turned off. */
export const alwaysOn: ReminderType[] = ['dangerCheck'];

export interface Occurrence {
  key: string;
  type: ReminderType;
  at: number;
}

const KEY = 'neobridge.reminders';
const DONE_KEY = 'neobridge.reminders.done';

const hm = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return { hour: h || 0, minute: m || 0 };
};
const at = (date: string, time: string) => {
  const { hour, minute } = hm(time);
  return istMidnight(date) + (hour * 60 + minute) * 60_000;
};

/** Every reminder from now until `days` ahead, sorted. */
export function occurrences(
  settings: ReminderSettings,
  ctx: { now: number; detail: BabyDetail | null; kmcLastEndedAt: number | null; days?: number },
): Occurrence[] {
  const out: Occurrence[] = [];
  const today = istDate(ctx.now);
  const days = ctx.days ?? 2;
  const push = (type: ReminderType, when: number) => {
    if (when >= ctx.now - 30 * 60_000) out.push({ key: `${type}-${when}`, type, at: when });
  };

  for (let d = 0; d < days; d++) {
    const date = addDays(today, d);
    for (const type of ['dangerCheck', 'chargeBand'] as const) {
      if (settings[type].enabled || alwaysOn.includes(type)) push(type, at(date, settings[type].time));
    }
    if (settings.feeding.enabled) {
      const every = settings.feeding.everyHours ?? 2;
      const first = at(date, settings.feeding.time) - istMidnight(date);
      for (let ms = first % (every * 3_600_000); ms < 86_400_000; ms += every * 3_600_000) push('feeding', istMidnight(date) + ms);
    }
  }

  // KMC nudge: 3 h after the last session, between 6 am and 10 pm
  if (settings.kmcNudge.enabled) {
    const base = ctx.kmcLastEndedAt ?? ctx.now;
    let when = Math.max(base + 3 * 3_600_000, ctx.now);
    const date = istDate(when);
    const minutes = (when - istMidnight(date)) / 60_000;
    if (minutes < 6 * 60) when = istMidnight(date) + 6 * 3_600_000;
    if (minutes > 22 * 60) when = istMidnight(addDays(date, 1)) + 6 * 3_600_000;
    push('kmcNudge', when);
  }

  const detail = ctx.detail;
  if (detail) {
    if (settings.ashaVisit.enabled) {
      for (const v of detail.visits) {
        if (!v.doneAt && v.kind === 'scheduled') push('ashaVisit', at(addDays(v.dueDate, -1), settings.ashaVisit.time));
      }
    }
    if (settings.doctorFollowUp.enabled) {
      for (const a of detail.advice) {
        if (a.followUpDate) push('doctorFollowUp', at(addDays(a.followUpDate, -1), settings.doctorFollowUp.time));
      }
    }
    if (settings.vaccines.enabled) {
      const day42 = addDays(istDate(Date.parse(detail.baby.bornAt)), 41);
      push('vaccines', at(day42, settings.vaccines.time));
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

class Reminders {
  private settings: ReminderSettings = defaultReminders;
  private done = new Set<string>();
  private snoozed = new Map<string, number>();
  private listeners = new Set<() => void>();
  private version = 0;

  constructor() {
    void Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(DONE_KEY)])
      .then(([s, d]) => {
        if (s) this.settings = { ...defaultReminders, ...(JSON.parse(s) as Partial<ReminderSettings>) };
        if (d) this.done = new Set(JSON.parse(d) as string[]);
        this.emit();
      })
      .catch(() => undefined);
  }

  getVersion = () => this.version;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private emit() {
    this.version += 1;
    this.listeners.forEach((l) => l());
  }

  getSettings() {
    return this.settings;
  }

  update(type: ReminderType, patch: Partial<ReminderSetting>) {
    if (alwaysOn.includes(type) && patch.enabled === false) return;
    this.settings = { ...this.settings, [type]: { ...this.settings[type], ...patch } };
    void AsyncStorage.setItem(KEY, JSON.stringify(this.settings)).catch(() => undefined);
    this.emit();
  }

  isDone(key: string) {
    return this.done.has(key);
  }
  markDone(key: string) {
    this.done.add(key);
    void AsyncStorage.setItem(DONE_KEY, JSON.stringify([...this.done].slice(-300))).catch(() => undefined);
    this.emit();
  }
  snoozedUntil(key: string) {
    return this.snoozed.get(key) ?? null;
  }
  snooze(key: string, ms = 15 * 60_000) {
    this.snoozed.set(key, Date.now() + ms);
    this.emit();
  }

  /** Re-schedule the phone's notifications from the current settings and data. */
  async reschedule(lang: UiLanguage, detail: BabyDetail | null, kmcLastEndedAt: number | null) {
    const now = Date.now();
    const list = occurrences(this.settings, { now, detail, kmcLastEndedAt, days: 3 });
    const notes: ReminderNote[] = [];
    for (const o of list.slice(0, 60)) {
      if (o.type === 'dangerCheck' || o.type === 'chargeBand') continue; // daily repeats below
      notes.push({ title: 'NeoBridge', body: t(lang, `rem.type.${o.type}`), at: o.at });
    }
    for (const type of ['dangerCheck', 'chargeBand'] as const) {
      if (this.settings[type].enabled || alwaysOn.includes(type)) {
        notes.push({ title: 'NeoBridge', body: t(lang, `rem.type.${type}`), daily: hm(this.settings[type].time) });
      }
    }
    for (const [key, until] of this.snoozed) {
      const type = key.split('-')[0] as ReminderType;
      if (until > now) notes.push({ title: 'NeoBridge', body: t(lang, `rem.type.${type}`), at: until });
    }
    await scheduleReminders(notes).catch(() => undefined);
  }
}

let reminders: Reminders | null = null;
export function getReminders(): Reminders {
  reminders ??= new Reminders();
  return reminders;
}
