import { randomBytes, randomInt } from "node:crypto";

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

import { BandStatus } from "@neobridge/ble-protocol";
import {
  ESCALATE_AFTER_MS,
  KMC_TARGET_HOURS,
  adviceTemplateText,
  adviceTemplates,
  anyDangerSign,
  dangerSigns,
  dashboardFor,
  istDate,
  visitSchedule,
  type DoctorDashboardDto,
} from "@neobridge/domain";

import {
  babiesOfMother,
  babyDetail,
  babyList,
  canSee,
  episodeById,
  episodesFor,
  facilities,
  motherById,
  motherForUser,
  profile,
  scopedBabyIds,
  villages,
  type AuthUser,
  type Row,
} from "./data.ts";
import type { Db } from "./db.ts";

/**
 * NeoBridge API. Phone-OTP login gives a bearer token; every route below
 * /v1 (except auth) needs it, and every read is scoped to what the role may
 * see (PRD "Permissions"). Writes from phones carry their own ids, so a
 * request replayed from the phone's offline queue is always safe.
 */

export interface AppOptions {
  /** Return the OTP in the response so the demo works without an SMS gateway. */
  demoOtp?: boolean;
  /** Called for every message the server would send by SMS. */
  onSms?: (phone: string, body: string) => void;
  now?: () => number;
}

type Env = { Variables: { user: AuthUser } };

const OTP_TTL_MS = 10 * 60_000;
const OTP_RESEND_MS = 30_000;
const OTP_MAX_ATTEMPTS = 5;

export const normalisePhone = (p: string) => p.replace(/\D/g, "").slice(-10);
const phoneSchema = z.string().transform(normalisePhone).pipe(z.string().regex(/^[6-9]\d{9}$/, "10-digit mobile"));
const optionalPhone = z
  .string()
  .optional()
  .nullable()
  .transform((p) => (p ? normalisePhone(p) : null))
  .pipe(z.string().regex(/^\d{10}$/).nullable());
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const statusSchema = z.enum(["green", "yellow", "red", "grey"]);
const dangerSchema = z.object(Object.fromEntries(dangerSigns.map((k) => [k, z.boolean().optional()]))).strict();

const summarySchema = z.object({
  seq: z.number().int().positive(),
  timestamp: z.number().int(),
  skinTempC: z.number().nullable(),
  roomTempC: z.number().nullable(),
  contactPct: z.number().int().min(0).max(100),
  heartRateBpm: z.number().int().nullable(),
  hrvRmssdMs: z.number().int().nullable(),
  hrQuality: z.number().int().min(0).max(100),
  batteryPct: z.number().int().min(0).max(100),
  status: z.nativeEnum(BandStatus),
});

/** Builds "($1,$2,...),($n,...)" for a multi-row insert. */
function values(rows: unknown[][]): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const sql = rows.map((row) => `(${row.map((v) => (params.push(v), `$${params.length}`)).join(",")})`).join(",");
  return { sql, params };
}

async function parse<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T> | null> {
  const body = await c.req.json().catch(() => null);
  const r = schema.safeParse(body);
  return r.success ? r.data : null;
}

const bad = (c: Context, error: string, status: 400 | 403 | 404 | 409 | 429 = 400, extra: object = {}) =>
  c.json({ error, ...extra }, status);

export function createApp(db: Db, opts: AppOptions = {}) {
  const now = opts.now ?? Date.now;
  const sms = async (phone: string, body: string) => {
    await db.query("insert into outbound_sms (phone, body) values ($1, $2)", [phone, body]);
    (opts.onSms ?? ((p, b) => console.log(`[sms → ${p}] ${b}`)))(phone, body);
  };

  const app = new Hono<Env>();
  app.use("*", cors());

  app.get("/health", async (c) => {
    await db.query("select 1");
    return c.json({ ok: true, db: db.label });
  });

  // ---- auth (C3, C4, C5) ---------------------------------------------------------

  app.post("/v1/auth/otp/start", async (c) => {
    const body = await parse(c, z.object({ phone: phoneSchema }));
    if (!body) return bad(c, "invalid_phone");
    const [user] = await db.query<Row>("select id, role from users where phone = $1", [body.phone]);
    if (!user) return bad(c, "not_registered", 404);

    const [prev] = await db.query<Row>("select sent_at from otp_codes where phone = $1", [body.phone]);
    const since = prev ? now() - Date.parse(new Date(prev.sent_at as string).toISOString()) : Infinity;
    if (since < OTP_RESEND_MS) return bad(c, "wait", 429, { retryInSeconds: Math.ceil((OTP_RESEND_MS - since) / 1000) });

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.query(
      `insert into otp_codes (phone, code, expires_at, attempts, sent_at) values ($1, $2, $3, 0, $4)
       on conflict (phone) do update set code = $2, expires_at = $3, attempts = 0, sent_at = $4`,
      [body.phone, code, new Date(now() + OTP_TTL_MS).toISOString(), new Date(now()).toISOString()],
    );
    await sms(body.phone, `NeoBridge code: ${code}. It expires in 10 minutes.`);
    return c.json({ sent: true, resendInSeconds: OTP_RESEND_MS / 1000, ...(opts.demoOtp ? { demoCode: code } : {}) });
  });

  app.post("/v1/auth/otp/verify", async (c) => {
    const body = await parse(c, z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }));
    if (!body) return bad(c, "invalid_code");
    const [otp] = await db.query<Row>("select code, expires_at, attempts from otp_codes where phone = $1", [body.phone]);
    if (!otp || Date.parse(new Date(otp.expires_at as string).toISOString()) < now()) return bad(c, "expired");
    if (Number(otp.attempts) >= OTP_MAX_ATTEMPTS) return bad(c, "too_many_attempts", 429);
    if (otp.code !== body.code) {
      await db.query("update otp_codes set attempts = attempts + 1 where phone = $1", [body.phone]);
      return bad(c, "wrong_code");
    }
    await db.query("delete from otp_codes where phone = $1", [body.phone]);
    const [u] = await db.query<Row>("select id from users where phone = $1", [body.phone]);
    const token = randomBytes(24).toString("base64url");
    await db.query("insert into sessions (token, user_id) values ($1, $2)", [token, u.id]);
    const user = await loadUser(db, String(u.id));
    return c.json({ token, profile: await profile(db, user!) });
  });

  // everything else needs a session
  app.use("/v1/*", async (c, next) => {
    if (c.req.path.startsWith("/v1/auth/otp/")) return next();
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return c.json({ error: "unauthorised" }, 401);
    const [s] = await db.query<Row>("select user_id from sessions where token = $1", [token]);
    const user = s ? await loadUser(db, String(s.user_id)) : null;
    if (!user) return c.json({ error: "unauthorised" }, 401);
    c.set("user", user);
    await next();
  });

  const role = (c: Context<Env>, ...roles: AuthUser["role"][]) => roles.includes(c.get("user").role);

  app.post("/v1/auth/logout", async (c) => {
    const token = c.req.header("authorization")!.replace(/^Bearer\s+/i, "");
    await db.query("delete from sessions where token = $1", [token]);
    return c.json({ ok: true });
  });

  // ---- profile ----------------------------------------------------------------------

  app.get("/v1/me", async (c) => {
    const user = c.get("user");
    const me = await profile(db, user);
    if (user.role !== "mother") return c.json({ profile: me });
    const mother = await motherForUser(db, user.id);
    const babies = mother ? await babiesOfMother(db, mother.id) : [];
    return c.json({ profile: me, mother, babies });
  });

  app.patch("/v1/me", async (c) => {
    const body = await parse(c, z.object({ language: z.enum(["en", "hi"]) }));
    if (!body) return bad(c, "invalid");
    await db.query("update users set language = $1 where id = $2", [body.language, c.get("user").id]);
    return c.json({ ok: true });
  });

  app.get("/v1/facilities", async (c) => c.json({ facilities: [...(await facilities(db)).values()] }));

  app.get("/v1/villages", async (c) => {
    const user = c.get("user");
    const all = [...(await villages(db)).values()];
    if (user.role !== "asha") return c.json({ villages: all });
    return c.json({ villages: (await profile(db, user)).villages });
  });

  // ---- registration (A4, A5, A6, M8) ------------------------------------------------

  app.post("/v1/mothers", async (c) => {
    if (!role(c, "asha")) return bad(c, "forbidden", 403);
    const asha = c.get("user");
    const body = await parse(
      c,
      z.object({
        name: z.string().trim().min(2).max(80),
        age: z.number().int().min(12).max(60),
        phone: phoneSchema,
        villageId: z.string(),
        familyPhone: optionalPhone,
        deliveryPlace: z.enum(["home", "facility"]),
        deliveryFacilityId: z.string().nullable().optional(),
        deliveryDate: dateSchema,
        mcpNumber: z.string().trim().max(40).nullable().optional(),
        language: z.enum(["en", "hi"]),
      }),
    );
    if (!body) return bad(c, "invalid");
    if (body.deliveryPlace === "facility" && !body.deliveryFacilityId) return bad(c, "facility_required");
    const mine = (await profile(db, asha)).villages.map((v) => v.id);
    if (!mine.includes(body.villageId)) return bad(c, "not_your_village", 403);
    const [taken] = await db.query("select 1 from users where phone = $1", [body.phone]);
    if (taken) return bad(c, "phone_taken", 409);

    const [u] = await db.query<Row>(
      "insert into users (phone, role, name, language) values ($1, 'mother', $2, $3) returning id",
      [body.phone, body.name, body.language],
    );
    const [m] = await db.query<Row>(
      `insert into mothers (user_id, asha_id, name, age, village_id, family_phone, delivery_place,
                            delivery_facility_id, delivery_date, mcp_number, language)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [
        u.id,
        asha.id,
        body.name,
        body.age,
        body.villageId,
        body.familyPhone,
        body.deliveryPlace,
        body.deliveryPlace === "facility" ? body.deliveryFacilityId : null,
        body.deliveryDate,
        body.mcpNumber ?? null,
        body.language,
      ],
    );
    await sms(
      body.phone,
      body.language === "hi"
        ? `नमस्ते ${body.name}, आपकी आशा ${asha.name} ने आपको NeoBridge में जोड़ा है। ऐप खोलें और इसी नंबर से लॉग इन करें।`
        : `Hello ${body.name}, your ASHA ${asha.name} has added you to NeoBridge. Open the app and log in with this number.`,
    );
    return c.json({ mother: await motherById(db, String(m.id)) }, 201);
  });

  app.post("/v1/babies", async (c) => {
    if (!role(c, "asha")) return bad(c, "forbidden", 403);
    const body = await parse(
      c,
      z.object({
        motherId: z.string().uuid(),
        name: z.string().trim().max(80).nullable().optional(),
        sex: z.enum(["female", "male", "other"]),
        bornAt: z.string().datetime({ offset: true }),
        birthWeightG: z.number().int().min(400).max(6000),
        gestationWeeks: z.number().int().min(22).max(44),
        sncuAdmitted: z.boolean(),
        dischargeDate: dateSchema.nullable().optional(),
        dischargeWeightG: z.number().int().min(400).max(6000).nullable().optional(),
        bandId: z.string().min(1).max(64).nullable().optional(),
      }),
    );
    if (!body) return bad(c, "invalid");
    if (body.sncuAdmitted && (!body.dischargeDate || !body.dischargeWeightG)) return bad(c, "discharge_required");
    const mother = await motherById(db, body.motherId);
    if (!mother || mother.asha?.id !== c.get("user").id) return bad(c, "not_found", 404);

    // doctors at the delivery facility see the baby; a home birth goes to the village's PHC
    const [v] = await db.query<Row>("select facility_id from villages where id = $1", [mother.village?.id ?? ""]);
    const facilityId = mother.deliveryFacility?.id ?? (v?.facility_id as string | undefined) ?? null;
    const name = body.name?.trim() || `Baby of ${mother.name}`;
    const [b] = await db.query<Row>(
      `insert into babies (mother_id, name, sex, born_at, birth_weight_g, gestation_weeks, sncu_admitted,
                           discharge_date, discharge_weight_g, facility_id, status, status_since)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'grey',$11) returning id`,
      [
        mother.id,
        name,
        body.sex,
        body.bornAt,
        body.birthWeightG,
        body.gestationWeeks,
        body.sncuAdmitted,
        body.sncuAdmitted ? body.dischargeDate : null,
        body.sncuAdmitted ? body.dischargeWeightG : null,
        facilityId,
        new Date(now()).toISOString(),
      ],
    );
    const babyId = String(b.id);
    for (const visit of visitSchedule({
      deliveryPlace: mother.deliveryPlace,
      birthDate: istDate(Date.parse(body.bornAt)),
      sncuAdmitted: body.sncuAdmitted,
      dischargeDate: body.dischargeDate,
    })) {
      await db.query("insert into visits (baby_id, day, due_date, kind) values ($1, $2, $3, 'scheduled')", [
        babyId,
        visit.day,
        visit.dueDate,
      ]);
    }
    if (body.bandId) await assignBand(db, babyId, body.bandId);
    return c.json({ baby: (await babyDetail(db, babyId, c.get("user"), now()))!.baby }, 201);
  });

  app.post("/v1/babies/:id/band", async (c) => {
    const id = c.req.param("id");
    if (!role(c, "asha", "mother") || !(await canSee(db, c.get("user"), id))) return bad(c, "forbidden", 403);
    const body = await parse(c, z.object({ bandId: z.string().min(1).max(64), serial: z.string().max(64).optional() }));
    if (!body) return bad(c, "invalid");
    await assignBand(db, id, body.bandId, body.serial);
    return c.json({ ok: true });
  });

  app.post("/v1/mothers/:id/consent", async (c) => {
    const user = c.get("user");
    const mother = await motherById(db, c.req.param("id"));
    if (!mother) return bad(c, "not_found", 404);
    const own = user.role === "mother" && (await motherForUser(db, user.id))?.id === mother.id;
    const asha = user.role === "asha" && mother.asha?.id === user.id;
    if (!own && !asha) return bad(c, "forbidden", 403);
    const body = await parse(c, z.object({ witnessed: z.literal(true) }));
    if (!body) return bad(c, "witness_required");
    await db.query("update mothers set consent_at = coalesce(consent_at, now()), consent_witness_id = $2 where id = $1", [
      mother.id,
      mother.asha?.id ?? null,
    ]);
    return c.json({ mother: await motherById(db, mother.id) });
  });

  // ---- babies (A1, A8, D4, D5, M10…) ----------------------------------------------------

  app.get("/v1/babies", async (c) => {
    const ids = await scopedBabyIds(db, c.get("user"));
    return c.json({ babies: await babyList(db, ids, now()) });
  });

  app.get("/v1/babies/:id", async (c) => {
    const id = c.req.param("id");
    if (!(await canSee(db, c.get("user"), id))) return bad(c, "not_found", 404);
    const detail = await babyDetail(db, id, c.get("user"), now());
    return detail ? c.json(detail) : bad(c, "not_found", 404);
  });

  /** Skin temperature medians for the D5 chart: ?hours=24|168 */
  app.get("/v1/babies/:id/temps", async (c) => {
    const id = c.req.param("id");
    if (c.get("user").role === "mother" || !(await canSee(db, c.get("user"), id))) return bad(c, "not_found", 404);
    const hours = Math.min(Number(c.req.query("hours") ?? 24), 168);
    const bucket = hours > 24 ? 30 : 5;
    const rows = await db.query<Row>(
      `select extract(epoch from date_bin($3::interval, s.recorded_at, timestamptz '2000-01-01'))::bigint as t,
              (percentile_cont(0.5) within group (order by s.skin_temp_c) + max(bd.calibration_offset_c))::float as skin
         from band_summaries s join bands bd on bd.id = s.band_id
        where bd.baby_id = $1 and s.recorded_at >= $2 and s.skin_temp_c is not null
        group by 1 order by 1`,
      [id, new Date(now() - hours * 3_600_000).toISOString(), `${bucket} minutes`],
    );
    return c.json({
      bucketMinutes: bucket,
      points: rows.map((r) => ({ t: Number(r.t) * 1000, skinC: Math.round(Number(r.skin) * 100) / 100 })),
    });
  });

  /** The mother's phone reports what the status rules say. */
  app.post("/v1/babies/:id/status", async (c) => {
    const id = c.req.param("id");
    if (!role(c, "mother") || !(await canSee(db, c.get("user"), id))) return bad(c, "forbidden", 403);
    const body = await parse(c, z.object({ status: statusSchema, reason: z.string().max(40).nullable(), at: z.number().int() }));
    if (!body) return bad(c, "invalid");
    const at = new Date(Math.min(body.at, now())).toISOString();
    const [cur] = await db.query<Row>("select status, status_reason from babies where id = $1", [id]);
    if (cur.status !== body.status || cur.status_reason !== body.reason) {
      await db.query("update babies set status = $2, status_reason = $3, status_since = $4 where id = $1", [
        id,
        body.status,
        body.reason,
        at,
      ]);
      await db.query(
        "insert into status_changes (baby_id, at, status, reason) values ($1, $2, $3, $4) on conflict do nothing",
        [id, at, body.status, body.reason],
      );
    }
    await db.query("update babies set last_sync_at = $2 where id = $1", [id, new Date(now()).toISOString()]);
    return c.json({ ok: true });
  });

  // ---- episodes (W3, M2, A12, A13, D6) ------------------------------------------------

  /** From the mother's phone: a red or yellow episode started (or a yellow one ended). */
  app.post("/v1/episodes", async (c) => {
    const user = c.get("user");
    const body = await parse(
      c,
      z.object({
        id: z.string().min(4).max(64),
        babyId: z.string().uuid(),
        kind: z.enum(["red", "yellow"]),
        trigger: z.string().max(40),
        startedAt: z.number().int(),
        familyAcknowledgedAt: z.number().int().nullable().optional(),
        endedAt: z.number().int().nullable().optional(),
      }),
    );
    if (!body) return bad(c, "invalid");
    if (!role(c, "mother") || !(await canSee(db, user, body.babyId))) return bad(c, "forbidden", 403);
    const ts = (v: number | null | undefined) => (v ? new Date(v).toISOString() : null);
    const inserted = await db.query<Row>(
      `insert into episodes (id, baby_id, kind, trigger, started_at, family_ack_at) values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set family_ack_at = coalesce(episodes.family_ack_at, excluded.family_ack_at)
       returning (xmax = 0) as is_new`,
      [body.id, body.babyId, body.kind, body.trigger, ts(body.startedAt), ts(body.familyAcknowledgedAt)],
    );
    // only the family's phone may end a yellow; a red is closed by staff
    if (body.kind === "yellow" && body.endedAt) {
      await db.query("update episodes set closed_at = coalesce(closed_at, $2), close_reason = coalesce(close_reason, 'warm again') where id = $1", [
        body.id,
        ts(body.endedAt),
      ]);
    }
    if (body.kind === "red" && inserted[0]?.is_new) await onNewRed(body.babyId, body.trigger, body.startedAt);
    return c.json({ episode: await episodeById(db, body.id) });
  });

  /** New red: an extra visit for the ASHA and an SMS to her (the gateway is P1; logged now). */
  async function onNewRed(babyId: string, trigger: string, startedAt: number) {
    await db.query(
      "insert into visits (baby_id, due_date, kind, reason) values ($1, $2, 'extra', $3)",
      [babyId, istDate(startedAt), `red:${trigger}`],
    );
    const [r] = await db.query<Row>(
      `select b.name as baby, m.name as mother, v.name as village, a.phone as asha_phone, b.status
         from babies b join mothers m on m.id = b.mother_id
         left join villages v on v.id = m.village_id join users a on a.id = m.asha_id where b.id = $1`,
      [babyId],
    );
    await db.query("update babies set status = 'red', status_reason = $2, status_since = $3 where id = $1", [
      babyId,
      trigger,
      new Date(startedAt).toISOString(),
    ]);
    if (r) await sms(String(r.asha_phone), `NeoBridge RED: ${r.baby} (${r.mother}, ${r.village}) needs help now. Open the app.`);
  }

  app.get("/v1/episodes", async (c) => {
    const ids = await scopedBabyIds(db, c.get("user"));
    const open = c.req.query("open") === "1";
    const episodes = await episodesFor(db, ids, { openOnly: open, kind: c.req.query("kind") === "red" ? "red" : undefined });
    const list = ids.length ? await babyList(db, [...new Set(episodes.map((e) => e.babyId))], now()) : [];
    const names = new Map(list.map((b) => [b.baby.id, b]));
    return c.json({
      episodes: episodes.map((e) => {
        const b = names.get(e.babyId);
        return {
          ...e,
          babyName: b?.baby.name ?? "",
          motherName: b?.mother.name ?? "",
          motherPhone: b?.mother.phone ?? "",
          village: b?.mother.village ?? null,
          dayOfLife: b?.dayOfLife ?? null,
        };
      }),
    });
  });

  app.get("/v1/episodes/:id", async (c) => {
    const e = await episodeById(db, c.req.param("id"));
    if (!e || !(await canSee(db, c.get("user"), e.babyId))) return bad(c, "not_found", 404);
    return c.json({ episode: e });
  });

  app.post("/v1/episodes/:id/ack", async (c) => {
    const user = c.get("user");
    const e = await episodeById(db, c.req.param("id"));
    if (!e || !(await canSee(db, user, e.babyId))) return bad(c, "not_found", 404);
    const at = new Date(now()).toISOString();
    if (user.role === "mother") {
      await db.query("update episodes set family_ack_at = coalesce(family_ack_at, $2) where id = $1", [e.id, at]);
    } else {
      await db.query(
        "update episodes set staff_ack_at = coalesce(staff_ack_at, $2), staff_ack_by = coalesce(staff_ack_by, $3) where id = $1",
        [e.id, at, user.id],
      );
    }
    return c.json({ episode: await episodeById(db, e.id) });
  });

  /**
   * ASHA (assigned) or doctor (facility) closes a red episode: after a visit with
   * an axillary reading, or a phone check with a written reason.
   */
  app.post("/v1/episodes/:id/close", async (c) => {
    const user = c.get("user");
    if (!role(c, "asha", "doctor")) return bad(c, "forbidden", 403);
    const e = await episodeById(db, c.req.param("id"));
    if (!e || !(await canSee(db, user, e.babyId))) return bad(c, "not_found", 404);
    const body = await parse(c, z.object({ reason: z.string().trim().max(500).optional(), visitId: z.string().uuid().optional() }));
    if (!body) return bad(c, "invalid");
    if (body.visitId) {
      const [v] = await db.query<Row>("select axillary_temp_c from visits where id = $1 and baby_id = $2 and done_at is not null", [
        body.visitId,
        e.babyId,
      ]);
      if (!v || v.axillary_temp_c === null) return bad(c, "visit_needs_reading");
    } else if (!body.reason || body.reason.length < 5) {
      return bad(c, "reason_required");
    }
    await closeEpisodes(db, e.babyId, user.id, body.reason || "visit", body.visitId ?? null, e.id);
    return c.json({ episode: await episodeById(db, e.id) });
  });

  // ---- visits and referrals (A2, A9, A10) ------------------------------------------------

  app.get("/v1/visits", async (c) => {
    const ids = await scopedBabyIds(db, c.get("user"));
    const list = await babyList(db, ids, now());
    const byBaby = new Map(list.map((b) => [b.baby.id, b]));
    const today = istDate(now());
    const rows = ids.length
      ? await db.query<Row>(
          `select v.id, v.baby_id, v.day, v.due_date::text as due_date, v.kind, v.reason
             from visits v where v.baby_id = any($1::uuid[]) and v.done_at is null and v.due_date <= $2::date + 7
            order by v.due_date, v.kind desc`,
          [ids, today],
        )
      : [];
    return c.json({
      today,
      visits: rows.map((r) => {
        const b = byBaby.get(String(r.baby_id))!;
        const due = String(r.due_date);
        return {
          id: String(r.id),
          babyId: String(r.baby_id),
          day: r.day === null ? null : Number(r.day),
          dueDate: due,
          kind: r.kind,
          reason: r.reason ?? null,
          state: due < today ? "overdue" : due === today ? "due" : "upcoming",
          babyName: b.baby.name,
          motherName: b.mother.name,
          motherPhone: b.mother.phone,
          village: b.mother.village,
          status: b.baby.status,
          dayOfLife: b.dayOfLife,
        };
      }),
    });
  });

  app.post("/v1/visits", async (c) => {
    const user = c.get("user");
    if (!role(c, "asha")) return bad(c, "forbidden", 403);
    const body = await parse(
      c,
      z.object({
        clientId: z.string().min(4).max(64),
        babyId: z.string().uuid(),
        visitId: z.string().uuid().nullable().optional(),
        doneAt: z.number().int().optional(),
        axillaryTempC: z.number().min(30).max(43),
        weightG: z.number().int().min(400).max(8000).nullable().optional(),
        breastfeedingWell: z.boolean().nullable().optional(),
        kmcHours: z.number().min(0).max(24).nullable().optional(),
        dangerSigns: dangerSchema,
        bandCheck: z.object({ fit: z.boolean(), skin: z.boolean(), battery: z.boolean() }).nullable().optional(),
        outcome: z.enum(["home_care", "refer"]),
        notes: z.string().max(1000).nullable().optional(),
      }),
    );
    if (!body) return bad(c, "invalid");
    if (!(await canSee(db, user, body.babyId))) return bad(c, "not_found", 404);

    const [dup] = await db.query<Row>("select id from visits where client_id = $1", [body.clientId]);
    if (dup) return c.json({ visitId: String(dup.id), duplicate: true });

    const doneAt = new Date(Math.min(body.doneAt ?? now(), now())).toISOString();
    const today = istDate(now());
    // fill the scheduled/extra visit this is for; else the oldest due one; else a new extra visit
    let visitId = body.visitId ?? null;
    let scheduled = false;
    if (visitId) {
      const [v] = await db.query<Row>("select kind from visits where id = $1 and baby_id = $2 and done_at is null", [visitId, body.babyId]);
      if (!v) visitId = null;
      else scheduled = v.kind === "scheduled";
    }
    if (!visitId) {
      const [v] = await db.query<Row>(
        `select id, kind from visits where baby_id = $1 and done_at is null and due_date <= $2
          order by (kind = 'extra') desc, due_date limit 1`,
        [body.babyId, today],
      );
      if (v) {
        visitId = String(v.id);
        scheduled = v.kind === "scheduled";
      }
    }
    if (scheduled && !body.weightG) return bad(c, "weight_required");

    const fields = [
      body.clientId,
      doneAt,
      user.id,
      body.axillaryTempC,
      body.weightG ?? null,
      body.breastfeedingWell ?? null,
      body.kmcHours ?? null,
      JSON.stringify(body.dangerSigns),
      body.bandCheck ? JSON.stringify(body.bandCheck) : null,
      body.outcome,
      body.notes ?? null,
    ];
    if (visitId) {
      await db.query(
        `update visits set client_id=$2, done_at=$3, asha_id=$4, axillary_temp_c=$5, weight_g=$6, breastfeeding_well=$7,
                kmc_hours=$8, danger_signs=$9::jsonb, band_check=$10::jsonb, outcome=$11, notes=$12 where id = $1`,
        [visitId, ...fields],
      );
    } else {
      const [v] = await db.query<Row>(
        `insert into visits (baby_id, due_date, kind, reason, client_id, done_at, asha_id, axillary_temp_c, weight_g,
                             breastfeeding_well, kmc_hours, danger_signs, band_check, outcome, notes)
         values ($1, $2, 'extra', 'unscheduled', $3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13) returning id`,
        [body.babyId, today, ...fields],
      );
      visitId = String(v.id);
    }
    // home care closes any open red episode (W5)
    if (body.outcome === "home_care") await closeEpisodes(db, body.babyId, user.id, "visit", visitId);
    return c.json({ visitId }, 201);
  });

  app.post("/v1/referrals", async (c) => {
    const user = c.get("user");
    if (!role(c, "asha", "doctor")) return bad(c, "forbidden", 403);
    const body = await parse(
      c,
      z.object({
        clientId: z.string().min(4).max(64),
        babyId: z.string().uuid(),
        visitId: z.string().uuid().nullable().optional(),
        facilityId: z.string(),
        reason: z.string().trim().min(2).max(500),
      }),
    );
    if (!body) return bad(c, "invalid");
    if (!(await canSee(db, user, body.babyId))) return bad(c, "not_found", 404);
    if (!(await facilities(db)).has(body.facilityId)) return bad(c, "invalid_facility");
    const [r] = await db.query<Row>(
      `insert into referrals (client_id, baby_id, visit_id, facility_id, reason, created_by)
       values ($1,$2,$3,$4,$5,$6) on conflict (client_id) do update set reason = referrals.reason returning id`,
      [body.clientId, body.babyId, body.visitId ?? null, body.facilityId, body.reason, user.id],
    );
    return c.json({ referralId: String(r.id) }, 201);
  });

  // ---- family logs: danger checks, KMC (M3, M12) ----------------------------------------

  app.post("/v1/danger-checks", async (c) => {
    const user = c.get("user");
    if (!role(c, "mother", "asha")) return bad(c, "forbidden", 403);
    const body = await parse(
      c,
      z.object({ id: z.string().min(4).max(64), babyId: z.string().uuid(), at: z.number().int(), answers: dangerSchema }),
    );
    if (!body) return bad(c, "invalid");
    if (!(await canSee(db, user, body.babyId))) return bad(c, "not_found", 404);
    await db.query(
      `insert into danger_checks (id, baby_id, by_user, at, answers, any_yes) values ($1,$2,$3,$4,$5::jsonb,$6)
       on conflict (id) do nothing`,
      [body.id, body.babyId, user.id, new Date(Math.min(body.at, now())).toISOString(), JSON.stringify(body.answers), anyDangerSign(body.answers)],
    );
    return c.json({ ok: true, anyYes: anyDangerSign(body.answers) });
  });

  app.post("/v1/kmc-sessions", async (c) => {
    const user = c.get("user");
    if (!role(c, "mother", "asha")) return bad(c, "forbidden", 403);
    const body = await parse(
      c,
      z.object({
        id: z.string().min(4).max(64),
        babyId: z.string().uuid(),
        holder: z.enum(["mother", "father", "grandmother", "other"]),
        startedAt: z.number().int(),
        endedAt: z.number().int().nullable(),
      }),
    );
    if (!body) return bad(c, "invalid");
    if (!(await canSee(db, user, body.babyId))) return bad(c, "not_found", 404);
    const ts = (v: number | null) => (v ? new Date(v).toISOString() : null);
    await db.query(
      `insert into kmc_sessions (id, baby_id, holder, started_at, ended_at) values ($1,$2,$3,$4,$5)
       on conflict (id) do update set holder = excluded.holder, ended_at = excluded.ended_at`,
      [body.id, body.babyId, body.holder, ts(body.startedAt), ts(body.endedAt)],
    );
    return c.json({ ok: true });
  });

  // ---- advice (D8, M18) --------------------------------------------------------------

  app.post("/v1/advice", async (c) => {
    const user = c.get("user");
    if (!role(c, "doctor")) return bad(c, "forbidden", 403);
    const body = await parse(
      c,
      z.object({
        babyId: z.string().uuid(),
        kind: z.enum(["family", "clinical"]),
        template: z.enum(adviceTemplates).nullable().optional(),
        body: z.string().trim().max(2000).optional(),
        followUpDate: dateSchema.nullable().optional(),
      }),
    );
    if (!body) return bad(c, "invalid");
    if (!(await canSee(db, user, body.babyId))) return bad(c, "not_found", 404);
    const text = body.body || (body.template ? adviceTemplateText[body.template].en : "");
    if (!text) return bad(c, "text_required");
    if (body.template === "opd" && !body.followUpDate) return bad(c, "date_required");
    const [a] = await db.query<Row>(
      `insert into advice_notes (baby_id, doctor_id, kind, template, body, follow_up_date)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [body.babyId, user.id, body.kind, body.template ?? null, text, body.followUpDate ?? null],
    );
    // a follow-up date adds a visit to the ASHA's list (the mother's phone adds the reminder)
    if (body.followUpDate) {
      await db.query("insert into visits (baby_id, due_date, kind, reason) values ($1, $2, 'extra', 'doctor')", [
        body.babyId,
        body.followUpDate,
      ]);
    }
    return c.json({ adviceId: String(a.id) }, 201);
  });

  app.get("/v1/advice", async (c) => {
    const user = c.get("user");
    if (!role(c, "doctor")) return bad(c, "forbidden", 403);
    const rows = await db.query<Row>(
      `select a.id, a.baby_id, a.kind, a.template, a.body, a.follow_up_date::text as follow_up_date, a.created_at,
              b.name as baby_name, m.name as mother_name
         from advice_notes a join babies b on b.id = a.baby_id join mothers m on m.id = b.mother_id
        where a.doctor_id = $1 order by a.created_at desc limit 100`,
      [user.id],
    );
    return c.json({
      notes: rows.map((r) => ({
        id: String(r.id),
        babyId: String(r.baby_id),
        kind: r.kind,
        template: r.template ?? null,
        body: String(r.body),
        followUpDate: r.follow_up_date ?? null,
        createdAt: new Date(r.created_at as string).toISOString(),
        babyName: String(r.baby_name),
        motherName: String(r.mother_name),
      })),
    });
  });

  // ---- doctor dashboard (D1–D3) --------------------------------------------------------

  app.get("/v1/dashboard", async (c) => {
    const user = c.get("user");
    if (!role(c, "doctor", "admin")) return bad(c, "forbidden", 403);
    const ids = await scopedBabyIds(db, user);
    const list = await babyList(db, ids, now());
    const pick = (f: (b: (typeof list)[number]) => boolean) => {
      const babyIds = list.filter(f).map((b) => b.baby.id);
      return { count: babyIds.length, babyIds };
    };
    const kind = dashboardFor(user.specialisation as never);
    const redYellow = pick((b) => b.baby.status === "red" || b.baby.status === "yellow");
    const overdue = pick((b) => b.nextVisit?.state === "overdue");
    const tiles: DoctorDashboardDto["tiles"] =
      kind === "newborn"
        ? [
            { key: "redYellow", ...redYellow },
            { key: "kmcUnder8", ...pick((b) => b.kmcHoursYesterday < KMC_TARGET_HOURS) },
            { key: "notGaining", ...pick((b) => b.notGaining) },
            { key: "visitsOverdue", ...overdue },
          ]
        : kind === "postpartum"
          ? [
              { key: "mothersInWindow", ...pick((b) => b.dayOfLife <= 42) },
              { key: "redYellow", ...redYellow },
              { key: "visitsOverdue", ...overdue },
            ]
          : [
              { key: "redYellow", ...redYellow },
              { key: "greyBands", ...pick((b) => b.baby.status === "grey") },
              { key: "visitsOverdue", ...overdue },
            ];
    const open = await episodesFor(db, ids, { openOnly: true, kind: "red" });
    const escalations = open
      .filter((e) => !e.staffAcknowledgedAt && now() - Date.parse(e.startedAt) > ESCALATE_AFTER_MS)
      .map((e) => {
        const b = list.find((x) => x.baby.id === e.babyId);
        return {
          episode: e,
          babyName: b?.baby.name ?? "",
          motherName: b?.mother.name ?? "",
          minutes: Math.floor((now() - Date.parse(e.startedAt)) / 60_000),
        };
      });
    return c.json({ kind, tiles, escalations } satisfies DoctorDashboardDto);
  });

  // ---- band uploads ------------------------------------------------------------------------

  app.post("/v1/bands/:bandId/summaries", async (c) => {
    const bandId = z.string().min(1).max(64).safeParse(c.req.param("bandId"));
    const body = z.array(summarySchema).min(1).max(500).safeParse(await c.req.json().catch(() => null));
    if (!bandId.success || !body.success) return c.json({ error: "invalid upload" }, 400);
    await db.query(
      `insert into bands (id, last_upload) values ($1, now()) on conflict (id) do update set last_upload = now()`,
      [bandId.data],
    );
    const { sql, params } = values(
      body.data.map((r) => [
        bandId.data,
        r.seq,
        new Date(r.timestamp * 1000).toISOString(),
        r.skinTempC,
        r.roomTempC,
        r.contactPct,
        r.heartRateBpm,
        r.hrvRmssdMs,
        r.hrQuality,
        r.batteryPct,
        r.status,
      ]),
    );
    const inserted = await db.query(
      `insert into band_summaries
         (band_id, seq, recorded_at, skin_temp_c, room_temp_c, contact_pct, heart_rate, hrv_rmssd_ms, hr_quality, battery_pct, status)
       values ${sql} on conflict (band_id, seq) do nothing returning seq`,
      params,
    );
    await db.query("update babies set last_sync_at = now() where band_id = $1", [bandId.data]);
    return c.json({ accepted: body.data.length, inserted: inserted.length });
  });

  app.get("/v1/bands/:bandId/summaries", async (c) => {
    const bandId = c.req.param("bandId");
    const [band] = await db.query<Row>("select baby_id from bands where id = $1", [bandId]);
    if (!band?.baby_id || !(await canSee(db, c.get("user"), String(band.baby_id)))) return bad(c, "not_found", 404);
    const since = Number(c.req.query("since") ?? 0);
    const until = Number(c.req.query("until") ?? now() / 1000);
    const limit = Math.min(Number(c.req.query("limit") ?? 1440), 10_080);
    const rows = await db.query(
      `select seq, extract(epoch from recorded_at)::bigint as timestamp,
              skin_temp_c::float as "skinTempC", room_temp_c::float as "roomTempC",
              contact_pct as "contactPct", heart_rate as "heartRateBpm",
              hrv_rmssd_ms as "hrvRmssdMs", hr_quality as "hrQuality",
              battery_pct as "batteryPct", status
         from band_summaries
        where band_id = $1 and recorded_at >= to_timestamp($2) and recorded_at <= to_timestamp($3)
        order by recorded_at desc limit $4`,
      [bandId, since, until, limit],
    );
    return c.json({ bandId, count: rows.length, summaries: rows.reverse() });
  });

  /** Demo: messages the server would have sent by SMS, newest first. */
  app.get("/v1/sms-log", async (c) => {
    const user = c.get("user");
    const rows = await db.query<Row>(
      "select phone, body, created_at from outbound_sms where phone = $1 or $2 order by created_at desc limit 50",
      [user.phone, user.role === "admin"],
    );
    return c.json({ messages: rows.map((r) => ({ phone: r.phone, body: r.body, at: new Date(r.created_at as string).toISOString() })) });
  });

  return app;
}

// ---- helpers ------------------------------------------------------------------------------

export async function loadUser(db: Db, id: string): Promise<AuthUser | null> {
  const [u] = await db.query<Row>(
    "select id, role, name, phone, facility_id, specialisation, language from users where id = $1",
    [id],
  );
  if (!u) return null;
  return {
    id: String(u.id),
    role: u.role as AuthUser["role"],
    name: String(u.name),
    phone: String(u.phone),
    facilityId: (u.facility_id as string) ?? null,
    specialisation: (u.specialisation as string) ?? null,
    language: String(u.language),
  };
}

async function assignBand(db: Db, babyId: string, bandId: string, serial?: string) {
  await db.query("update babies set band_id = null where band_id = $1 and id <> $2", [bandId, babyId]);
  await db.query("update bands set baby_id = null where baby_id = $1 and id <> $2", [babyId, bandId]);
  await db.query(
    `insert into bands (id, serial, baby_id, paired_at) values ($1, $2, $3, now())
     on conflict (id) do update set baby_id = $3, serial = coalesce($2, bands.serial), paired_at = now()`,
    [bandId, serial ?? null, babyId],
  );
  await db.query("update babies set band_id = $2 where id = $1", [babyId, bandId]);
}

async function closeEpisodes(
  db: Db,
  babyId: string,
  by: string,
  reason: string,
  visitId: string | null,
  onlyId?: string,
) {
  await db.query(
    `update episodes set closed_at = now(), closed_by = $2, close_reason = $3, close_visit_id = $4,
            staff_ack_at = coalesce(staff_ack_at, now()), staff_ack_by = coalesce(staff_ack_by, $2)
      where baby_id = $1 and closed_at is null and kind = 'red' ${onlyId ? "and id = $5" : ""}`,
    onlyId ? [babyId, by, reason, visitId, onlyId] : [babyId, by, reason, visitId],
  );
  const [open] = await db.query("select 1 from episodes where baby_id = $1 and closed_at is null and kind = 'red'", [babyId]);
  if (!open) {
    await db.query("update babies set status = 'green', status_reason = null, status_since = now() where id = $1 and status = 'red'", [
      babyId,
    ]);
  }
}
