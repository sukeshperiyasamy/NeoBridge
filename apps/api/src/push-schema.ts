// Brings DATABASE_URL (e.g. the Neon database) up to the current schema. Safe to re-run.
import { openDb } from "./db.ts";

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the Neon connection string first.");
  process.exit(1);
}

const db = await openDb();
console.log(`schema applied · ${db.label}`);
process.exit(0);
