import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

/** The one thing routes need: run SQL with $1-style parameters, get rows back. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs several statements with no parameters (schema). */
  exec(text: string): Promise<void>;
  label: string;
}

const SCHEMA_VERSION = "2";
const V1_TABLES = ["alerts", "visits", "band_summaries", "bands", "babies", "ashas"];

const schemaPath = new URL("../db/schema.sql", import.meta.url);

export async function readSchema(): Promise<string> {
  return readFile(schemaPath, "utf8");
}

/**
 * Brings any database up to the current schema. The v1 tables (before roles,
 * mothers and episodes) had a different shape, so they are dropped once.
 */
export async function migrate(db: Db): Promise<void> {
  await db.exec("create table if not exists meta (key text primary key, value text not null)");
  const [row] = await db.query<{ value: string }>("select value from meta where key = 'schema'");
  if (row?.value !== SCHEMA_VERSION) {
    for (const t of V1_TABLES) await db.exec(`drop table if exists ${t} cascade`);
  }
  await db.exec(await readSchema());
  await db.query(
    "insert into meta (key, value) values ('schema', $1) on conflict (key) do update set value = $1",
    [SCHEMA_VERSION],
  );
}

/**
 * DATABASE_URL set → that Postgres (Neon in production).
 * Not set → PGlite, a real Postgres running inside this process. Data lives in
 * PGLITE_DIR, or memory if unset (or `memory` is passed, for tests).
 */
export async function openDb(opts: { memory?: boolean } = {}): Promise<Db> {
  const url = opts.memory ? undefined : process.env.DATABASE_URL;
  let db: Db;

  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { ssl: "require", max: 5, idle_timeout: 20, onnotice: () => undefined });
    db = {
      label: `postgres (${new URL(url).host})`,
      query: async <T>(text: string, params: unknown[] = []) =>
        (await sql.unsafe(text, params as never[])) as unknown as T[],
      exec: async (text: string) => {
        await sql.unsafe(text);
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = opts.memory ? undefined : process.env.PGLITE_DIR;
    // PGlite creates the data folder itself, but not its parents
    if (dir) await mkdir(dirname(dir), { recursive: true });
    const pg = new PGlite(dir);
    db = {
      label: dir ? `pglite (${dir})` : "pglite (in memory)",
      query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
      exec: async (text: string) => {
        await pg.exec(text);
      },
    };
  }

  await migrate(db);
  return db;
}
