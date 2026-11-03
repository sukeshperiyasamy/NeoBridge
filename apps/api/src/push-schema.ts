// Applies db/schema.sql to DATABASE_URL (e.g. the Neon database). Safe to re-run.
import postgres from "postgres";

import { readSchema } from "./db.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to the Neon connection string first.");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1 });
await sql.unsafe(await readSchema());
await sql.end();
console.log("schema applied");
