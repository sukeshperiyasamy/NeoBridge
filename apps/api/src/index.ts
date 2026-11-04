import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";
import { openDb } from "./db.ts";
import { demoNumbers, seedIfEmpty } from "./seed.ts";

const db = await openDb();
if (process.env.SEED !== "0" && (await seedIfEmpty(db))) {
  console.log("seeded demo data · logins:", demoNumbers);
}

const port = Number(process.env.PORT ?? 8787);
// Demo: OTP codes are returned to the app (and logged) until the SMS gateway (P1).
const demoOtp = process.env.OTP_DEMO !== "0";

serve({ fetch: createApp(db, { demoOtp }).fetch, port, hostname: process.env.HOST ?? "0.0.0.0" }, () => {
  console.log(`api listening on http://localhost:${port} · db: ${db.label} · demo OTP ${demoOtp ? "on" : "off"}`);
});
