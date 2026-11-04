// Loaders: database rows → the shapes in @neobridge/domain that the app shows.

import {
  dayOfLife,
  istDate,
  kmcHoursOn,
  notGaining,
  triageRank,
  visitState,
  weightGain,
  addDays,
  type AdviceDto,
  type BabyDetail,
  type BabyInfo,
  type BabyListItem,
  type DangerCheckDto,
  type EpisodeDto,
  type Facility,
  type KmcSessionDto,
  type MotherInfo,
  type ReferralDto,
  type Role,
  type StatusChangeDto,
  type UserProfile,
  type Village,
  type VisitDto,
} from "@neobridge/domain";

import type { Db } from "./db.ts";

export type Row = Record<string, unknown>;

export const iso = (v: unknown): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
const ms = (v: unknown): number | null => (v === null || v === undefined ? null : Date.parse(iso(v)!));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  phone: string;
  facilityId: string | null;
  specialisation: string | null;
  language: string;
}

// ---- reference data ------------------------------------------------------------

export async function facilities(db: Db): Promise<Map<string, Facility>> {
  const rows = await db.query<Row>("select id, name, level, phone from facilities order by name");
  return new Map(
    rows.map((r) => [String(r.id), { id: String(r.id), name: String(r.name), level: r.level as Facility["level"], phone: str(r.phone) }]),
  );
}

export async function villages(db: Db): Promise<Map<string, Village>> {
  const rows = await db.query<Row>("select id, name, name_hi from villages order by name");
  return new Map(rows.map((r) => [String(r.id), { id: String(r.id), name: String(r.name), nameHi: String(r.name_hi) }]));
}

export async function profile(db: Db, user: AuthUser): Promise<UserProfile> {
  const fac = await facilities(db);
  const vil = await villages(db);
  let villageIds: string[] = [];
  if (user.role === "asha") {
    villageIds = (await db.query<Row>("select village_id from asha_villages where asha_id = $1", [user.id])).map((r) =>
      String(r.village_id),
    );
  } else if (user.role === "doctor" && user.facilityId) {
    villageIds = (await db.query<Row>("select id from villages where facility_id = $1", [user.facilityId])).map((r) =>
      String(r.id),
    );
  }
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    language: user.language === "en" ? "en" : "hi",
    specialisation: (user.specialisation as UserProfile["specialisation"]) ?? null,
    facility: user.facilityId ? fac.get(user.facilityId) ?? null : null,
    villages: villageIds.map((id) => vil.get(id)).filter((v): v is Village => !!v),
  };
}

// ---- scope ---------------------------------------------------------------------------

/**
 * Babies this user may see. Mother: her own. ASHA: households assigned to her.
 * Doctor: babies at their facility, referred there, or from villages under it.
 */
export async function scopedBabyIds(db: Db, user: AuthUser): Promise<string[]> {
  let rows: Row[] = [];
  if (user.role === "mother") {
    rows = await db.query("select b.id from babies b join mothers m on m.id = b.mother_id where m.user_id = $1", [user.id]);
  } else if (user.role === "asha") {
    rows = await db.query("select b.id from babies b join mothers m on m.id = b.mother_id where m.asha_id = $1", [user.id]);
  } else if (user.role === "doctor" || user.role === "admin") {
    if (user.role === "admin") rows = await db.query("select id from babies");
    else
      rows = await db.query(
        `select b.id from babies b
           join mothers m on m.id = b.mother_id
           left join villages v on v.id = m.village_id
          where b.facility_id = $1
             or m.delivery_facility_id = $1
             or v.facility_id = $1
             or exists (select 1 from referrals r where r.baby_id = b.id and r.facility_id = $1)`,
        [user.facilityId],
      );
  }
  return rows.map((r) => String(r.id));
}

export async function canSee(db: Db, user: AuthUser, babyId: string): Promise<boolean> {
  return (await scopedBabyIds(db, user)).includes(babyId);
}

// ---- rows → DTOs -------------------------------------------------------------------------

const BABY_COLUMNS = `b.id, b.mother_id, b.name, b.sex, b.born_at, b.birth_weight_g, b.gestation_weeks,
  b.sncu_admitted, b.discharge_date::text as discharge_date, b.discharge_weight_g, b.facility_id,
  b.band_id, coalesce(bd.calibration_offset_c, 0)::float as calibration_offset_c,
  b.status, b.status_reason, b.status_since, b.last_sync_at`;

function babyFrom(r: Row, fac: Map<string, Facility>): BabyInfo {
  return {
    id: String(r.id),
    motherId: String(r.mother_id),
    name: String(r.name),
    sex: r.sex as BabyInfo["sex"],
    bornAt: iso(r.born_at)!,
    birthWeightG: Number(r.birth_weight_g),
    gestationWeeks: Number(r.gestation_weeks),
    sncuAdmitted: Boolean(r.sncu_admitted),
    dischargeDate: str(r.discharge_date),
    dischargeWeightG: num(r.discharge_weight_g),
    bandId: str(r.band_id),
    calibrationOffsetC: Number(r.calibration_offset_c ?? 0),
    facility: r.facility_id ? fac.get(String(r.facility_id)) ?? null : null,
    status: (r.status as BabyInfo["status"]) ?? "grey",
    statusReason: str(r.status_reason),
    statusSince: iso(r.status_since),
    lastSyncAt: iso(r.last_sync_at),
  };
}

const MOTHER_COLUMNS = `m.id, m.name, m.age, u.phone, m.village_id, m.family_phone, m.delivery_place,
  m.delivery_facility_id, m.delivery_date::text as delivery_date, m.mcp_number, m.language, m.consent_at,
  m.asha_id, a.name as asha_name, a.phone as asha_phone`;

function motherFrom(r: Row, fac: Map<string, Facility>, vil: Map<string, Village>): MotherInfo {
  return {
    id: String(r.id),
    name: String(r.name),
    age: Number(r.age),
    phone: String(r.phone),
    village: r.village_id ? vil.get(String(r.village_id)) ?? null : null,
    familyPhone: str(r.family_phone),
    deliveryPlace: r.delivery_place as MotherInfo["deliveryPlace"],
    deliveryFacility: r.delivery_facility_id ? fac.get(String(r.delivery_facility_id)) ?? null : null,
    deliveryDate: String(r.delivery_date),
    mcpNumber: str(r.mcp_number),
    language: r.language === "en" ? "en" : "hi",
    consentAt: iso(r.consent_at),
    asha: r.asha_id ? { id: String(r.asha_id), name: String(r.asha_name), phone: String(r.asha_phone) } : null,
  };
}

const EPISODE_SELECT = `select e.*, sa.name as ack_name, sa.role as ack_role, cb.name as close_name, cb.role as close_role
  from episodes e
  left join users sa on sa.id = e.staff_ack_by
  left join users cb on cb.id = e.closed_by`;

export function episodeFrom(r: Row): EpisodeDto {
  return {
    id: String(r.id),
    babyId: String(r.baby_id),
    kind: r.kind as EpisodeDto["kind"],
    trigger: String(r.trigger),
    startedAt: iso(r.started_at)!,
    familyAcknowledgedAt: iso(r.family_ack_at),
    staffAcknowledgedAt: iso(r.staff_ack_at),
    staffAcknowledgedBy: r.staff_ack_by
      ? { id: String(r.staff_ack_by), name: String(r.ack_name), role: r.ack_role as Role }
      : null,
    closedAt: iso(r.closed_at),
    closedBy: r.closed_by ? { id: String(r.closed_by), name: String(r.close_name), role: r.close_role as Role } : null,
    closeReason: str(r.close_reason),
  };
}

export async function episodesFor(db: Db, babyIds: string[], opts: { openOnly?: boolean; kind?: "red" } = {}) {
  if (babyIds.length === 0) return [];
  const rows = await db.query<Row>(
    `${EPISODE_SELECT}
      where e.baby_id = any($1::uuid[])
        ${opts.openOnly ? "and e.closed_at is null" : ""}
        ${opts.kind ? "and e.kind = 'red'" : ""}
      order by e.started_at desc`,
    [babyIds],
  );
  return rows.map(episodeFrom);
}

export async function episodeById(db: Db, id: string): Promise<EpisodeDto | null> {
  const [r] = await db.query<Row>(`${EPISODE_SELECT} where e.id = $1`, [id]);
  return r ? episodeFrom(r) : null;
}

function visitFrom(r: Row): VisitDto {
  return {
    id: String(r.id),
    babyId: String(r.baby_id),
    day: num(r.day),
    dueDate: String(r.due_date),
    kind: r.kind as VisitDto["kind"],
    reason: str(r.reason),
    doneAt: iso(r.done_at),
    axillaryTempC: num(r.axillary_temp_c),
    weightG: num(r.weight_g),
    breastfeedingWell: r.breastfeeding_well === null || r.breastfeeding_well === undefined ? null : Boolean(r.breastfeeding_well),
    kmcHours: num(r.kmc_hours),
    dangerSigns: (r.danger_signs as VisitDto["dangerSigns"]) ?? {},
    bandCheck: (r.band_check as VisitDto["bandCheck"]) ?? null,
    outcome: (r.outcome as VisitDto["outcome"]) ?? null,
    notes: str(r.notes),
    ashaName: str(r.asha_name),
  };
}

async function visitsFor(db: Db, babyIds: string[]): Promise<VisitDto[]> {
  if (babyIds.length === 0) return [];
  const rows = await db.query<Row>(
    `select v.id, v.baby_id, v.day, v.due_date::text as due_date, v.kind, v.reason, v.done_at,
            v.axillary_temp_c::float as axillary_temp_c, v.weight_g, v.breastfeeding_well,
            v.kmc_hours::float as kmc_hours, v.danger_signs, v.band_check, v.outcome, v.notes,
            u.name as asha_name
       from visits v left join users u on u.id = v.asha_id
      where v.baby_id = any($1::uuid[])
      order by v.due_date, v.day nulls last`,
    [babyIds],
  );
  return rows.map(visitFrom);
}

async function kmcFor(db: Db, babyIds: string[], sinceMs: number) {
  if (babyIds.length === 0) return [];
  const rows = await db.query<Row>(
    `select id, baby_id, holder, started_at, ended_at from kmc_sessions
      where baby_id = any($1::uuid[]) and coalesce(ended_at, now()) >= $2
      order by started_at`,
    [babyIds, new Date(sinceMs).toISOString()],
  );
  return rows.map((r) => ({
    babyId: String(r.baby_id),
    dto: {
      id: String(r.id),
      holder: r.holder as KmcSessionDto["holder"],
      startedAt: iso(r.started_at)!,
      endedAt: iso(r.ended_at),
    } satisfies KmcSessionDto,
  }));
}

/** Weights: birth weight, SNCU discharge weight, then every visit weight. */
function weightsOf(baby: BabyInfo, visits: VisitDto[]) {
  const points: { at: string; grams: number }[] = [{ at: baby.bornAt.slice(0, 10), grams: baby.birthWeightG }];
  if (baby.dischargeDate && baby.dischargeWeightG) points.push({ at: baby.dischargeDate, grams: baby.dischargeWeightG });
  for (const v of visits) if (v.doneAt && v.weightG) points.push({ at: v.doneAt.slice(0, 10), grams: v.weightG });
  points.sort((a, b) => a.at.localeCompare(b.at));
  return points.map((p, i) => {
    const prev = points[i - 1];
    const days = prev ? Math.round((Date.parse(p.at) - Date.parse(prev.at)) / 86_400_000) : 0;
    return { ...p, gainGPerKgDay: prev ? weightGain(prev.grams, p.grams, days) : null };
  });
}

async function babiesRows(db: Db, ids: string[]) {
  if (ids.length === 0) return [];
  return db.query<Row>(
    `select ${BABY_COLUMNS} from babies b left join bands bd on bd.id = b.band_id where b.id = any($1::uuid[])`,
    [ids],
  );
}

async function mothersRows(db: Db, ids: string[]) {
  if (ids.length === 0) return [];
  return db.query<Row>(
    `select ${MOTHER_COLUMNS} from mothers m join users u on u.id = m.user_id
       left join users a on a.id = m.asha_id where m.id = any($1::uuid[])`,
    [ids],
  );
}

export async function babyList(db: Db, ids: string[], now = Date.now()): Promise<BabyListItem[]> {
  const [fac, vil] = [await facilities(db), await villages(db)];
  const babies = (await babiesRows(db, ids)).map((r) => babyFrom(r, fac));
  const mothers = new Map(
    (await mothersRows(db, babies.map((b) => b.motherId))).map((r) => {
      const m = motherFrom(r, fac, vil);
      return [m.id, m];
    }),
  );
  const open = await episodesFor(db, ids, { openOnly: true, kind: "red" });
  const visits = await visitsFor(db, ids);
  const today = istDate(now);
  const yesterday = addDays(today, -1);
  const kmc = await kmcFor(db, ids, now - 2 * 86_400_000);

  const items = babies.map((baby): BabyListItem => {
    const m = mothers.get(baby.motherId)!;
    const openEpisode = open.find((e) => e.babyId === baby.id) ?? null;
    const mine = visits.filter((v) => v.babyId === baby.id);
    const pending = mine.filter((v) => !v.doneAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const next = pending[0] ?? null;
    const nextState = next ? visitState(next.dueDate, null, today) : null;
    const sessions = kmc
      .filter((k) => k.babyId === baby.id)
      .map((k) => ({ startedAt: Date.parse(k.dto.startedAt), endedAt: k.dto.endedAt ? Date.parse(k.dto.endedAt) : null }));
    const status = openEpisode ? "red" : baby.status;
    const item: BabyListItem = {
      baby: { ...baby, status },
      mother: { id: m.id, name: m.name, phone: m.phone, village: m.village, asha: m.asha },
      dayOfLife: dayOfLife(Date.parse(baby.bornAt), now),
      kmcHoursYesterday: kmcHoursOn(yesterday, sessions, now),
      openEpisode,
      nextVisit: next ? { dueDate: next.dueDate, day: next.day, state: nextState! } : null,
      notGaining: notGaining(weightsOf(baby, mine)),
      rank: 0,
    };
    item.rank = triageRank({
      status,
      openEpisode: openEpisode ? { staffAcknowledgedAt: ms(openEpisode.staffAcknowledgedAt) } : null,
      visitOverdue: nextState === "overdue",
      visitDueToday: nextState === "due",
    });
    return item;
  });
  return items.sort((a, b) => a.rank - b.rank || a.mother.name.localeCompare(b.mother.name));
}

export async function babyDetail(db: Db, id: string, viewer: AuthUser, now = Date.now()): Promise<BabyDetail | null> {
  const [fac, vil] = [await facilities(db), await villages(db)];
  const [row] = await babiesRows(db, [id]);
  if (!row) return null;
  const baby = babyFrom(row, fac);
  const [mrow] = await mothersRows(db, [baby.motherId]);
  const mother = motherFrom(mrow, fac, vil);
  const visits = await visitsFor(db, [id]);
  const episodes = await episodesFor(db, [id]);
  const open = episodes.find((e) => e.kind === "red" && !e.closedAt);
  if (open) baby.status = "red";

  const dangerChecks: DangerCheckDto[] = (
    await db.query<Row>(
      `select d.id, d.at, d.answers, d.any_yes, u.name from danger_checks d join users u on u.id = d.by_user
        where d.baby_id = $1 order by d.at desc limit 30`,
      [id],
    )
  ).map((r) => ({
    id: String(r.id),
    at: iso(r.at)!,
    answers: r.answers as DangerCheckDto["answers"],
    anyYes: Boolean(r.any_yes),
    byName: String(r.name),
  }));

  const advice: AdviceDto[] = (
    await db.query<Row>(
      `select a.id, a.baby_id, a.kind, a.template, a.body, a.follow_up_date::text as follow_up_date, a.created_at, u.name
         from advice_notes a join users u on u.id = a.doctor_id
        where a.baby_id = $1 ${viewer.role === "mother" ? "and a.kind = 'family'" : ""}
        order by a.created_at desc`,
      [id],
    )
  ).map((r) => ({
    id: String(r.id),
    babyId: String(r.baby_id),
    kind: r.kind as AdviceDto["kind"],
    template: (r.template as AdviceDto["template"]) ?? null,
    body: String(r.body),
    followUpDate: str(r.follow_up_date),
    createdAt: iso(r.created_at)!,
    doctorName: String(r.name),
  }));

  const referrals: ReferralDto[] = (
    await db.query<Row>(
      `select r.id, r.baby_id, r.facility_id, r.reason, r.created_at, u.name
         from referrals r join users u on u.id = r.created_by where r.baby_id = $1 order by r.created_at desc`,
      [id],
    )
  ).map((r) => ({
    id: String(r.id),
    babyId: String(r.baby_id),
    facility: fac.get(String(r.facility_id))!,
    reason: String(r.reason),
    createdAt: iso(r.created_at)!,
    createdBy: String(r.name),
  }));

  const kmc = (await kmcFor(db, [id], now - 8 * 86_400_000)).map((k) => k.dto);
  const spans = kmc.map((k) => ({ startedAt: Date.parse(k.startedAt), endedAt: k.endedAt ? Date.parse(k.endedAt) : null }));
  const today = istDate(now);
  const kmcByDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, hours: kmcHoursOn(date, spans, now) };
  });

  const statusChanges: StatusChangeDto[] = (
    await db.query<Row>(
      "select at, status, reason from status_changes where baby_id = $1 and at >= $2 order by at",
      [id, new Date(now - 7 * 86_400_000).toISOString()],
    )
  ).map((r) => ({ at: iso(r.at)!, status: r.status as StatusChangeDto["status"], reason: str(r.reason) }));

  return {
    baby,
    mother,
    dayOfLife: dayOfLife(Date.parse(baby.bornAt), now),
    visits,
    episodes,
    dangerChecks,
    advice,
    referrals,
    kmcSessions: kmc,
    kmcByDay,
    statusChanges,
    weights: weightsOf(baby, visits),
  };
}

export async function motherForUser(db: Db, userId: string): Promise<MotherInfo | null> {
  const [fac, vil] = [await facilities(db), await villages(db)];
  const [r] = await db.query<Row>(
    `select ${MOTHER_COLUMNS} from mothers m join users u on u.id = m.user_id
       left join users a on a.id = m.asha_id where m.user_id = $1`,
    [userId],
  );
  return r ? motherFrom(r, fac, vil) : null;
}

export async function motherById(db: Db, id: string): Promise<MotherInfo | null> {
  const [fac, vil] = [await facilities(db), await villages(db)];
  const [r] = await mothersRows(db, [id]);
  return r ? motherFrom(r, fac, vil) : null;
}

export async function babiesOfMother(db: Db, motherId: string): Promise<BabyInfo[]> {
  const fac = await facilities(db);
  const rows = await db.query<Row>(
    `select ${BABY_COLUMNS} from babies b left join bands bd on bd.id = b.band_id where b.mother_id = $1 order by b.born_at`,
    [motherId],
  );
  return rows.map((r) => babyFrom(r, fac));
}
