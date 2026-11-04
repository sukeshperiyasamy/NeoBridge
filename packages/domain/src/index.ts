/**
 * NeoBridge domain: the rules and shapes shared by the API and the app.
 * Pure TypeScript, no I/O. Dates that matter to families (day of life, when a
 * visit is due) are counted in India time, so server and phone agree.
 */

export type Role = 'mother' | 'asha' | 'doctor' | 'admin';
export type Specialisation = 'neonatology' | 'paediatrics' | 'obstetrics' | 'general';
export type Status = 'green' | 'yellow' | 'red' | 'grey';
export type FacilityLevel = 'SNCU' | 'NICU' | 'DH' | 'CHC' | 'PHC';
export type DeliveryPlace = 'home' | 'facility';
export type Sex = 'female' | 'male' | 'other';
export type KmcHolder = 'mother' | 'father' | 'grandmother' | 'other';
export type VisitOutcome = 'home_care' | 'refer';
export type AdviceKind = 'family' | 'clinical';

/** Which doctor dashboard a specialisation opens (PRD "Dashboards by doctor type"). */
export type DoctorDashboard = 'newborn' | 'postpartum' | 'catchment';
export function dashboardFor(s: Specialisation | null | undefined): DoctorDashboard {
  if (s === 'obstetrics') return 'postpartum';
  if (s === 'general') return 'catchment';
  return 'newborn';
}

// ---- dates ------------------------------------------------------------------

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** 'YYYY-MM-DD' of a moment, in India time. */
export function istDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight (India) of a 'YYYY-MM-DD', as ms. */
export function istMidnight(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b ('YYYY-MM-DD'). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Day of life: the day of birth is day 1 (HBNC counting). */
export function dayOfLife(bornAtMs: number, nowMs: number): number {
  return daysBetween(istDate(bornAtMs), istDate(nowMs)) + 1;
}

// ---- visit schedule (PRD "Visit schedule", HBNC) ---------------------------------

export const HBNC_DAYS = [3, 7, 14, 21, 28, 42] as const;

export interface ScheduledVisit {
  /** "Day 7"; day 1 is the day of birth (or of SNCU discharge) */
  day: number;
  dueDate: string;
  basis: 'birth' | 'discharge';
}

export interface ScheduleInput {
  deliveryPlace: DeliveryPlace;
  /** 'YYYY-MM-DD' (India) */
  birthDate: string;
  sncuAdmitted: boolean;
  dischargeDate?: string | null;
}

/**
 * Facility delivery: days 3, 7, 14, 21, 28, 42. Home delivery adds day 1.
 * SNCU discharge: the discharge day is day 1, the first visit is within 24
 * hours, then days 3…42 counted from discharge.
 */
export function visitSchedule(input: ScheduleInput): ScheduledVisit[] {
  if (input.sncuAdmitted && input.dischargeDate) {
    const d = input.dischargeDate;
    return [
      { day: 1, dueDate: addDays(d, 1), basis: 'discharge' },
      ...HBNC_DAYS.map((day) => ({ day, dueDate: addDays(d, day - 1), basis: 'discharge' as const })),
    ];
  }
  const days: number[] = input.deliveryPlace === 'home' ? [1, ...HBNC_DAYS] : [...HBNC_DAYS];
  return days.map((day) => ({ day, dueDate: addDays(input.birthDate, day - 1), basis: 'birth' }));
}

export type VisitState = 'done' | 'overdue' | 'due' | 'upcoming';

/** A visit is due on its day and overdue from the next day. */
export function visitState(dueDate: string, doneAt: number | null, today: string): VisitState {
  if (doneAt !== null) return 'done';
  if (today > dueDate) return 'overdue';
  if (today === dueDate) return 'due';
  return 'upcoming';
}

// ---- weight -----------------------------------------------------------------------

/** gain (g/kg/day) = (W2 − W1) / ((W1 / 1000) · d) */
export function weightGain(w1g: number, w2g: number, days: number): number | null {
  if (days <= 0 || w1g <= 0) return null;
  return Math.round(((w2g - w1g) / ((w1g / 1000) * days)) * 10) / 10;
}

export type WeightTrend = 'up' | 'flat' | 'down';

/** Arrow the mother sees next to the latest weight. */
export function weightTrend(weights: { at: string; grams: number }[]): WeightTrend | null {
  if (weights.length < 2) return null;
  const sorted = [...weights].sort((a, b) => a.at.localeCompare(b.at));
  const a = sorted[sorted.length - 2];
  const b = sorted[sorted.length - 1];
  const days = Math.max(1, daysBetween(a.at.slice(0, 10), b.at.slice(0, 10)));
  const gain = weightGain(a.grams, b.grams, days) ?? 0;
  // newborns are expected to gain; under ~5 g/kg/day is not gaining well
  if (gain >= 5) return 'up';
  if (gain >= 0) return 'flat';
  return 'down';
}

/** Not gaining weight: the latest two weights show under 5 g/kg/day, or a loss. */
export function notGaining(weights: { at: string; grams: number }[]): boolean {
  const t = weightTrend(weights);
  return t === 'flat' || t === 'down';
}

// ---- KMC --------------------------------------------------------------------------

export const KMC_TARGET_HOURS = 8;

export interface KmcSpan {
  startedAt: number;
  endedAt: number | null;
}

/** Hours of KMC on an India-time date, clipping sessions to that day. */
export function kmcHoursOn(date: string, sessions: KmcSpan[], nowMs: number): number {
  const start = istMidnight(date);
  const end = start + DAY_MS;
  let ms = 0;
  for (const s of sessions) {
    const a = Math.max(start, s.startedAt);
    const b = Math.min(end, s.endedAt ?? nowMs);
    if (b > a) ms += b - a;
  }
  return Math.round((ms / 3_600_000) * 10) / 10;
}

// ---- danger signs (M3, A9) ------------------------------------------------------------

export const dangerSigns = ['poorFeeding', 'limp', 'breathing', 'fits', 'yellowSkin'] as const;
export type DangerSign = (typeof dangerSigns)[number];
export type DangerAnswers = Partial<Record<DangerSign, boolean>>;

export function anyDangerSign(answers: DangerAnswers): boolean {
  return dangerSigns.some((k) => answers[k] === true);
}

// ---- advice templates (D8) --------------------------------------------------------------

export const adviceTemplates = ['kmc8h', 'feedMore', 'opd', 'sncuNow'] as const;
export type AdviceTemplate = (typeof adviceTemplates)[number];

/** What the family sees for a template, in Hindi and English. {date} is the follow-up date. */
export const adviceTemplateText: Record<AdviceTemplate, { en: string; hi: string }> = {
  kmc8h: {
    en: 'Keep doing KMC, at least 8 hours a day',
    hi: 'KMC जारी रखें, दिन में कम से कम 8 घंटे',
  },
  feedMore: { en: 'Feed the baby more often', hi: 'बच्चे को और बार-बार दूध पिलाएँ' },
  opd: { en: 'Come to the OPD on {date}', hi: '{date} को OPD में आएँ' },
  sncuNow: { en: 'Go to the SNCU now', hi: 'अभी SNCU जाएँ' },
};

// ---- axillary temperature lines (visit form) -----------------------------------------------

/** Placeholder axillary lines (°C) for pre-selecting "refer" on the visit form. */
export const axillaryLines = { low: 36.5, high: 37.5 } as const;
export function axillaryOutOfRange(c: number): boolean {
  return c < axillaryLines.low || c > axillaryLines.high;
}

// ---- triage order on A1 ----------------------------------------------------------------------

export interface TriageInput {
  status: Status;
  openEpisode: { staffAcknowledgedAt: number | null } | null;
  visitOverdue: boolean;
  visitDueToday: boolean;
}

/**
 * Red not yet acknowledged, red acknowledged, yellow, grey, visit overdue,
 * visit due today, then green. Lower sorts first.
 */
export function triageRank(b: TriageInput): number {
  const red = b.status === 'red' || b.openEpisode !== null;
  if (red && !b.openEpisode?.staffAcknowledgedAt) return 0;
  if (red) return 1;
  if (b.status === 'yellow') return 2;
  if (b.status === 'grey') return 3;
  if (b.visitOverdue) return 4;
  if (b.visitDueToday) return 5;
  return 6;
}

/** Unacknowledged red older than this is flagged on the MO's dashboard. */
export const ESCALATE_AFTER_MS = 15 * 60_000;

// ---- API shapes ---------------------------------------------------------------------------------

export interface Facility {
  id: string;
  name: string;
  level: FacilityLevel;
  phone: string | null;
}

export interface Village {
  id: string;
  name: string;
  nameHi: string;
}

export interface UserProfile {
  id: string;
  role: Role;
  name: string;
  phone: string;
  language: 'en' | 'hi';
  specialisation: Specialisation | null;
  facility: Facility | null;
  villages: Village[];
}

export interface MotherInfo {
  id: string;
  name: string;
  age: number;
  phone: string;
  village: Village | null;
  familyPhone: string | null;
  deliveryPlace: DeliveryPlace;
  deliveryFacility: Facility | null;
  deliveryDate: string;
  mcpNumber: string | null;
  language: 'en' | 'hi';
  consentAt: string | null;
  asha: { id: string; name: string; phone: string } | null;
}

export interface BabyInfo {
  id: string;
  motherId: string;
  name: string;
  sex: Sex;
  bornAt: string;
  birthWeightG: number;
  gestationWeeks: number;
  sncuAdmitted: boolean;
  dischargeDate: string | null;
  dischargeWeightG: number | null;
  bandId: string | null;
  /** °C the phone adds to this band's raw skin reading */
  calibrationOffsetC: number;
  facility: Facility | null;
  status: Status;
  statusReason: string | null;
  statusSince: string | null;
  lastSyncAt: string | null;
}

export interface EpisodeDto {
  id: string;
  babyId: string;
  kind: 'red' | 'yellow';
  trigger: string;
  startedAt: string;
  familyAcknowledgedAt: string | null;
  staffAcknowledgedAt: string | null;
  staffAcknowledgedBy: { id: string; name: string; role: Role } | null;
  closedAt: string | null;
  closedBy: { id: string; name: string; role: Role } | null;
  closeReason: string | null;
}

export interface VisitDto {
  id: string;
  babyId: string;
  day: number | null;
  dueDate: string;
  kind: 'scheduled' | 'extra';
  reason: string | null;
  doneAt: string | null;
  axillaryTempC: number | null;
  weightG: number | null;
  breastfeedingWell: boolean | null;
  kmcHours: number | null;
  dangerSigns: DangerAnswers;
  bandCheck: { fit: boolean; skin: boolean; battery: boolean } | null;
  outcome: VisitOutcome | null;
  notes: string | null;
  ashaName: string | null;
}

export interface ReferralDto {
  id: string;
  babyId: string;
  facility: Facility;
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface DangerCheckDto {
  id: string;
  at: string;
  answers: DangerAnswers;
  anyYes: boolean;
  byName: string;
}

export interface KmcSessionDto {
  id: string;
  holder: KmcHolder;
  startedAt: string;
  endedAt: string | null;
}

export interface AdviceDto {
  id: string;
  babyId: string;
  kind: AdviceKind;
  template: AdviceTemplate | null;
  body: string;
  followUpDate: string | null;
  createdAt: string;
  doctorName: string;
}

export interface StatusChangeDto {
  at: string;
  status: Status;
  reason: string | null;
}

/** One row on the ASHA's list and the doctor's patient list. */
export interface BabyListItem {
  baby: BabyInfo;
  mother: Pick<MotherInfo, 'id' | 'name' | 'phone' | 'village' | 'asha'>;
  dayOfLife: number;
  kmcHoursYesterday: number;
  openEpisode: EpisodeDto | null;
  nextVisit: { dueDate: string; day: number | null; state: VisitState } | null;
  notGaining: boolean;
  rank: number;
}

export interface BabyDetail {
  baby: BabyInfo;
  mother: MotherInfo;
  dayOfLife: number;
  visits: VisitDto[];
  episodes: EpisodeDto[];
  dangerChecks: DangerCheckDto[];
  advice: AdviceDto[];
  referrals: ReferralDto[];
  kmcSessions: KmcSessionDto[];
  /** last 7 days, oldest first */
  kmcByDay: { date: string; hours: number }[];
  statusChanges: StatusChangeDto[];
  weights: { at: string; grams: number; gainGPerKgDay: number | null }[];
}

export interface DoctorDashboardDto {
  kind: DoctorDashboard;
  tiles: { key: string; count: number; babyIds: string[] }[];
  /** red alerts nobody acknowledged within 15 minutes */
  escalations: { episode: EpisodeDto; babyName: string; motherName: string; minutes: number }[];
}
