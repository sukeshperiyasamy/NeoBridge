import type { IncomingMessage, ServerResponse } from "node:http";

import { handle } from "@hono/node-server/vercel";

import { createApp } from "./app.ts";
import { openDb } from "./db.ts";
import { defaultLimits } from "./rate-limit.ts";
import { seedIfEmpty } from "./seed.ts";

/**
 * The API as one Vercel serverless function (scripts/build-vercel.mjs bundles
 * this file). Same app as src/index.ts; DATABASE_URL points at Neon. The
 * site's routes send /v1/* and /health here as /api?__path=<path>.
 *
 * The database is opened on the first request that needs it, not when the
 * instance starts, so /health (uptime checks) never wakes Neon up.
 */
let ready: Promise<ReturnType<typeof handle>> | null = null;

async function start() {
  const db = await openDb();
  if (process.env.SEED !== "0") await seedIfEmpty(db);
  const app = createApp(db, {
    demoOtp: process.env.OTP_DEMO !== "0",
    demoLogin: process.env.DEMO_LOGIN !== "0",
    rateLimits: process.env.RATE_LIMIT === "0" ? undefined : defaultLimits,
    keepReadingsDays: Number(process.env.KEEP_READINGS_DAYS ?? 30),
  demoHistory: process.env.DEMO_HISTORY !== "0",
  });
  return handle(app);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.searchParams.get("__path");
  if (path !== null) {
    url.searchParams.delete("__path");
    const query = url.searchParams.toString();
    req.url = `/${path}${query ? `?${query}` : ""}`;
  }

  if (path === "health" && url.searchParams.get("db") !== "1") {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  ready ??= start().catch((e: unknown) => {
    ready = null; // try again on the next request (e.g. Neon was still waking up)
    throw e;
  });
  const hono = await ready;
  return hono(req, res);
}
