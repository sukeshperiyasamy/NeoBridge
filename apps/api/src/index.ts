import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";
import { defaultLimits } from "./rate-limit.ts";
import { openDb } from "./db.ts";
import { demoNumbers, seedIfEmpty } from "./seed.ts";

const db = await openDb();
if (process.env.SEED !== "0" && (await seedIfEmpty(db))) {
  console.log("seeded demo data · logins:", demoNumbers);
}

const port = Number(process.env.PORT ?? 8787);
// Demo: OTP codes are returned to the app (and logged) until the SMS gateway (P1).
const demoOtp = process.env.OTP_DEMO !== "0";
// Demo: user ID + password logins for the seeded accounts. Set DEMO_LOGIN=0 to turn off.
const demoLogin = process.env.DEMO_LOGIN !== "0";

const app = createApp(db, {
  demoOtp,
  demoLogin,
  // limits are off locally unless RATE_LIMIT=1 (the dev app polls a lot)
  rateLimits: process.env.RATE_LIMIT === "1" ? defaultLimits : undefined,
  keepReadingsDays: Number(process.env.KEEP_READINGS_DAYS ?? 30),
  demoHistory: process.env.DEMO_HISTORY !== "0",
});

serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? "0.0.0.0" }, () => {
  console.log(`api listening on http://localhost:${port} · db: ${db.label} · demo OTP ${demoOtp ? "on" : "off"} · demo password login ${demoLogin ? "on" : "off"}`);
});
