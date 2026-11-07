// Simulated band history for the demo households: 15 days of skin
// temperature, 5 minutes apart, ending now. It follows each baby's own story:
// a dip where the baby had a yellow or red episode, warmer during KMC hours,
// cooler at night, and a gap where a band stopped sending.
//
// It is topped up (never rewritten) when the API starts and at most every
// 10 minutes after that, so the demo charts always reach "now". Only the
// seeded demo bands get readings, and only while they are still the baby's
// band: once a real band is paired, its own readings take over.

import type { Db } from "./db.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STEP = 5 * MIN;
export const DEMO_HISTORY_DAYS = 15;

interface Profile {
  /** typical skin temperature, °C */
  base: number;
  /** how often a night has a short cool spell (0–1) */
  coolNights: number;
  /** readings stop this long before now (a band that went quiet) */
  quietFor?: number;
  /** a baby whose KMC hours are long runs a little warmer in the day */
  kmc: number;
}

/** The seeded demo bands (seed.ts). */
export const demoProfiles: Record<string, Profile> = {
  "demo-band": { base: 36.45, coolNights: 0.3, kmc: 0.22 },
  "band-0002": { base: 36.15, coolNights: 0.55, kmc: 0.12 },
  "band-0003": { base: 36.55, coolNights: 0.2, quietFor: 6 * HOUR, kmc: 0.08 },
  "band-0004": { base: 36.7, coolNights: 0.1, kmc: 0.3 },
  "band-0005": { base: 36.6, coolNights: 0.25, kmc: 0.28 },
};

/** Same number for the same inputs, 0–1. */
function noise(seed: string, n: number): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const istHour = (t: number) => (((t + 5.5 * HOUR) % DAY) + DAY) % DAY / HOUR;
/** 0 → 1 → 0 across a window */
const bump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));

interface Episode {
  kind: string;
  start: number;
  end: number;
}

export function skinAt(bandId: string, p: Profile, t: number, episodes: Episode[]): number {
  const h = istHour(t);
  const dayNo = Math.floor((t + 5.5 * HOUR) / DAY);
  // warmest mid-afternoon, coolest before dawn
  let c = p.base + 0.16 * Math.sin((2 * Math.PI * (h - 9)) / 24);
  // KMC: morning, afternoon and evening sessions
  for (const [from, to] of [[6, 9], [13, 15.5], [19, 21]] as const) c += p.kmc * bump((h - from) / (to - from));
  // a slow wander, plus small reading noise
  c += 0.12 * Math.sin(t / (5.3 * HOUR) + noise(bandId, 7) * 6);
  c += (noise(bandId, Math.floor(t / STEP)) - 0.5) * 0.1;
  // some nights a cool spell between 1 and 4 am
  if (noise(bandId, dayNo) < p.coolNights) {
    const depth = 0.45 + noise(bandId, dayNo + 999) * 0.45;
    const start = 1 + noise(bandId, dayNo + 77) * 1.5;
    c -= depth * bump((h - start) / 1.6);
  }
  // the baby's own yellow and red episodes
  for (const e of episodes) {
    const lead = e.kind === "red" ? 70 * MIN : 30 * MIN;
    const a = e.start - lead;
    if (t < a || t > e.end + 40 * MIN) continue;
    const depth = e.kind === "red" ? 2.05 : 1.15;
    const into = Math.min(1, (t - a) / lead);
    const out = t > e.end ? 1 - (t - e.end) / (40 * MIN) : 1;
    c -= depth * Math.min(into, out);
  }
  return Math.round(c * 100) / 100;
}

export interface TopUpResult {
  bands: number;
  rows: number;
}

/**
 * Fills each demo band's readings up to now. Cheap when nothing is missing:
 * one query per band. Rows use seq = minute since 1970, the same key the phone
 * uses, so a phone uploading for the demo band never makes duplicates.
 */
export async function topUpDemoHistory(db: Db, now = Date.now()): Promise<TopUpResult> {
  const ids = Object.keys(demoProfiles);
  const bands = await db.query<{ id: string; baby_id: string | null; born_at: unknown; current: string | null; last: unknown }>(
    `select bd.id, bd.baby_id, b.born_at, b.band_id as current,
            (select max(recorded_at) from band_summaries s where s.band_id = bd.id and s.seq > 1000000) as last
       from bands bd left join babies b on b.id = bd.baby_id
      where bd.id = any($1::text[])`,
    [ids],
  );
  let rows = 0;
  let touched = 0;
  for (const band of bands) {
    if (!band.baby_id || band.born_at == null) continue;
    const p = demoProfiles[band.id];
    const last = band.last == null ? null : new Date(band.last as string).getTime();
    // a real band has replaced this one: leave its history as it is
    if (band.current !== band.id && last !== null) continue;
    const born = new Date(band.born_at as string).getTime();
    const end = Math.floor((now - (p.quietFor ?? 0)) / STEP) * STEP;
    let from = Math.max(born + 2 * HOUR, now - DEMO_HISTORY_DAYS * DAY, last === null ? 0 : last + STEP);
    from = Math.ceil(from / STEP) * STEP;
    if (from > end) continue;

    if (last === null) {
      // the first fill replaces the old 24-hour seed rows (seq 1..288)
      await db.query("delete from band_summaries where band_id = $1 and seq < 1000000", [band.id]);
    }
    const episodes = (
      await db.query<{ kind: string; started_at: unknown; closed_at: unknown }>(
        "select kind, started_at, closed_at from episodes where baby_id = $1",
        [band.baby_id],
      )
    ).map((e) => ({
      kind: e.kind,
      start: new Date(e.started_at as string).getTime(),
      end: e.closed_at == null ? now : new Date(e.closed_at as string).getTime(),
    }));

    const batch: unknown[][] = [];
    for (let t = from; t <= end; t += STEP) {
      const skin = skinAt(band.id, p, t, episodes);
      const status = skin < 34.5 || skin > 37.8 ? 2 : skin < 35.5 ? 1 : 0;
      const hr = Math.round(132 + 10 * noise(band.id, t / STEP + 3) + (skin < 35.5 ? 8 : 0));
      const room = Math.round((24 + 1.5 * Math.sin((2 * Math.PI * (istHour(t) - 9)) / 24)) * 10) / 10;
      const contact = Math.round(86 + 12 * noise(band.id, t / STEP + 5));
      const battery = Math.max(20, 95 - Math.floor(((t / HOUR) % 40) * 1.8));
      batch.push([band.id, Math.floor(t / MIN), new Date(t).toISOString(), skin, room, contact, hr, battery, status]);
    }
    for (let i = 0; i < batch.length; i += 400) {
      const chunk = batch.slice(i, i + 400);
      const params: unknown[] = [];
      const sql = chunk.map((r) => `(${r.map((v) => (params.push(v), `$${params.length}`)).join(",")})`).join(",");
      await db.query(
        `insert into band_summaries (band_id, seq, recorded_at, skin_temp_c, room_temp_c, contact_pct, heart_rate, battery_pct, status)
         values ${sql} on conflict (band_id, seq) do nothing`,
        params,
      );
    }
    await db.query("update babies set last_sync_at = $2 where id = $1 and band_id = $3", [band.baby_id, new Date(end).toISOString(), band.id]);
    rows += batch.length;
    touched++;
  }
  return { bands: touched, rows };
}
