// Wipes the demo data and seeds it again, so a demo can start fresh.
// Local PGlite (PGLITE_DIR) or DATABASE_URL — never run this against real families' data.
import { openDb } from "./db.ts";
import { seed } from "./seed.ts";

const db = await openDb();
const tables = [
  "ai_calls", "outbound_sms", "weight_logs", "advice_notes", "kmc_sessions", "danger_checks", "referrals", "visits", "episodes",
  "status_changes", "band_summaries", "bands", "babies", "mothers", "sessions", "otp_codes",
  "asha_villages", "users", "villages", "facilities",
];
for (const t of tables) await db.exec(`delete from ${t}`);
await seed(db);
console.log(`demo data reset · ${db.label}`);
process.exit(0);
