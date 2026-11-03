import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";

import { BandStatus } from "@neobridge/ble-protocol";

/**
 * The phone uploads small summaries and alert events, never raw sensor streams.
 * Uploads are queued on the phone while offline and replayed in order, so every
 * write must be idempotent on (bandId, seq).
 *
 * Still to build: phone-OTP auth, Postgres (db/schema.sql), push + SMS fan-out
 * for red alerts, and the clinician summary endpoint the web app reads.
 */

const statusEnum = z.nativeEnum(BandStatus);

const summarySchema = z.object({
  seq: z.number().int().nonnegative(),
  timestamp: z.number().int(),
  skinTempC: z.number().nullable(),
  roomTempC: z.number().nullable(),
  contactPct: z.number().int().min(0).max(100),
  heartRateBpm: z.number().int().nullable(),
  status: statusEnum,
});

const alertSchema = z.object({
  seq: z.number().int().nonnegative(),
  timestamp: z.number().int(),
  from: statusEnum,
  to: statusEnum,
  reason: z.number().int(),
});

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.post("/v1/bands/:bandId/summaries", async (c) => {
  const body = z.array(summarySchema).max(500).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  // TODO: upsert into band_summaries ON CONFLICT (band_id, seq) DO NOTHING
  return c.json({ accepted: body.data.length });
});

app.post("/v1/bands/:bandId/alerts", async (c) => {
  const body = alertSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  // TODO: store, then for red: push + SMS to the ASHA, escalate to the ANM if unacknowledged
  return c.json({ accepted: true });
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`api listening on http://localhost:${port}`);
});
