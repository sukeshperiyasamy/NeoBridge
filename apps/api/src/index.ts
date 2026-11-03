import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

import { BandStatus } from "@neobridge/ble-protocol";

import { openDb, type Db } from "./db.ts";

/**
 * The phone uploads small summaries and alert events, never raw sensor streams.
 * Uploads are queued on the phone while offline and replayed in order, so every
 * write is idempotent on (bandId, seq): re-sending a batch is always safe.
 *
 * Still to build: phone-OTP auth (anyone can upload today), push + SMS fan-out
 * for red alerts, and linking bands to babies at ASHA setup.
 */

const statusEnum = z.nativeEnum(BandStatus);

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
  status: statusEnum,
});

const alertSchema = z.object({
  seq: z.number().int().positive(),
  timestamp: z.number().int(),
  from: statusEnum,
  to: statusEnum,
  reason: z.number().int(),
});

const bandIdSchema = z.string().min(1).max(64);

/** Builds "($1,$2,...),($n,...)" for a multi-row insert. */
function values(rows: unknown[][]): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const sql = rows
    .map((row) => `(${row.map((v) => (params.push(v), `$${params.length}`)).join(",")})`)
    .join(",");
  return { sql, params };
}

async function ensureBand(db: Db, bandId: string) {
  await db.query(
    `insert into bands (id, last_upload) values ($1, now())
     on conflict (id) do update set last_upload = now()`,
    [bandId],
  );
}

export function createApp(db: Db) {
  const app = new Hono();
  app.use("*", cors());

  app.get("/health", async (c) => {
    await db.query("select 1");
    return c.json({ ok: true, db: db.label });
  });

  app.post("/v1/bands/:bandId/summaries", async (c) => {
    const bandId = bandIdSchema.safeParse(c.req.param("bandId"));
    const body = z.array(summarySchema).min(1).max(500).safeParse(await c.req.json().catch(() => null));
    if (!bandId.success || !body.success) return c.json({ error: "invalid upload" }, 400);

    await ensureBand(db, bandId.data);
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
    const inserted = await db.query<{ seq: string }>(
      `insert into band_summaries
         (band_id, seq, recorded_at, skin_temp_c, room_temp_c, contact_pct,
          heart_rate, hrv_rmssd_ms, hr_quality, battery_pct, status)
       values ${sql}
       on conflict (band_id, seq) do nothing
       returning seq`,
      params,
    );
    // Duplicates count as accepted: the phone may mark them all as uploaded.
    return c.json({ accepted: body.data.length, inserted: inserted.length });
  });

  app.post("/v1/bands/:bandId/alerts", async (c) => {
    const bandId = bandIdSchema.safeParse(c.req.param("bandId"));
    const body = z.array(alertSchema).min(1).max(200).safeParse(await c.req.json().catch(() => null));
    if (!bandId.success || !body.success) return c.json({ error: "invalid upload" }, 400);

    await ensureBand(db, bandId.data);
    const { sql, params } = values(
      body.data.map((a) => [bandId.data, a.seq, new Date(a.timestamp * 1000).toISOString(), a.from, a.to, a.reason]),
    );
    const inserted = await db.query(
      `insert into alerts (band_id, seq, raised_at, from_status, to_status, reason)
       values ${sql}
       on conflict (band_id, seq) do nothing
       returning seq`,
      params,
    );
    // TODO: for new red alerts, push + SMS the ASHA and escalate to the ANM if unacknowledged
    return c.json({ accepted: body.data.length, inserted: inserted.length });
  });

  /** Trend data for the ASHA and doctor views: ?since=<unix s>&until=<unix s>&limit= */
  app.get("/v1/bands/:bandId/summaries", async (c) => {
    const bandId = bandIdSchema.safeParse(c.req.param("bandId"));
    if (!bandId.success) return c.json({ error: "invalid band" }, 400);
    const since = Number(c.req.query("since") ?? 0);
    const until = Number(c.req.query("until") ?? Date.now() / 1000);
    const limit = Math.min(Number(c.req.query("limit") ?? 1440), 10_080);

    const rows = await db.query(
      `select seq, extract(epoch from recorded_at)::bigint as timestamp,
              skin_temp_c::float as "skinTempC", room_temp_c::float as "roomTempC",
              contact_pct as "contactPct", heart_rate as "heartRateBpm",
              hrv_rmssd_ms as "hrvRmssdMs", hr_quality as "hrQuality",
              battery_pct as "batteryPct", status
         from band_summaries
        where band_id = $1 and recorded_at >= to_timestamp($2) and recorded_at <= to_timestamp($3)
        order by recorded_at desc
        limit $4`,
      [bandId.data, since, until, limit],
    );
    return c.json({ bandId: bandId.data, count: rows.length, summaries: rows.reverse() });
  });

  return app;
}

const db = await openDb();
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp(db).fetch, port }, () => {
  console.log(`api listening on http://localhost:${port} · db: ${db.label}`);
});
