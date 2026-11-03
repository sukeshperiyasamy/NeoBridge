import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

/** The one thing routes need: run SQL with $1-style parameters, get rows back. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  label: string;
}

const schemaPath = new URL("../db/schema.sql", import.meta.url);

export async function readSchema(): Promise<string> {
  return readFile(schemaPath, "utf8");
}

/**
 * DATABASE_URL set → that Postgres (Neon in production).
 * Not set → PGlite, a real Postgres running inside this process, with the
 * schema applied on start. Data lives in PGLITE_DIR, or memory if unset.
 */
export async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { ssl: "require", max: 5, idle_timeout: 20 });
    return {
      label: `postgres (${new URL(url).host})`,
      query: async <T>(text: string, params: unknown[] = []) =>
        (await sql.unsafe(text, params as never[])) as unknown as T[],
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR;
  // PGlite creates the data folder itself, but not its parents
  if (dir) await mkdir(dirname(dir), { recursive: true });
  const pg = new PGlite(dir);
  await pg.exec(await readSchema());
  return {
    label: dir ? `pglite (${dir})` : "pglite (in memory)",
    query: async <T>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
  };
}
