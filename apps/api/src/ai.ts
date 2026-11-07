import { createHash } from "node:crypto";

import { KMC_TARGET_HOURS, addDays, istDate, istMidnight, type BabyDetail, type BabyListItem } from "@neobridge/domain";

import { DEMO_MODEL, demoCost, demoPlan, demoSummary } from "./ai-demo.ts";
import type { Db } from "./db.ts";
import type { Row } from "./data.ts";

/**
 * NeoBridge AI: turns the numbers the app already has (band temperatures,
 * alerts, KMC hours, weights, danger checks) into short, plain-language
 * notes for the mother, the ASHA and the doctor. For now the notes come
 * from the demo writer (ai-demo.ts); a language model can be plugged into
 * run() later without changing the screens.
 *
 * Safety rules:
 *  - AI only explains. Alerts, statuses and thresholds still come from the
 *    rules engine (packages/rules); nothing here changes them.
 *  - No names, phone numbers or villages are sent to the AI, only numbers.
 *  - With AI_DEMO=0, a plain rule-based note built from the same numbers
 *    is shown instead, so the app never breaks.
 *  - Every call is logged in ai_calls (feature, tokens, time), which the
 *    "AI in NeoBridge" screen shows.
 */

export type Audience = "mother" | "asha" | "doctor";
export type Lang = "en" | "hi";
export type AiFeature = "summary" | "visit_plan";

export interface AiMeta {
  /** demo: AI-style note (ai-demo.ts) · rules: plain fallback */
  source: "demo" | "rules";
  model: string | null;
  cached: boolean;
  generatedAt: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export interface SummaryDto {
  headline: string;
  points: string[];
  action: string;
  /** green: all looks fine · watch: something to keep an eye on · act: call the ASHA / go to the facility */
  tone: "green" | "watch" | "act";
}

export interface VisitPlanDto {
  overview: string;
  items: { babyId: string; why: string; todo: string }[];
}

/** USD per million tokens, for the usage screen's cost estimate. */
const PRICE = { in: 4, out: 20 };

/** AI-style notes (ai-demo.ts) unless AI_DEMO=0, which shows plain rule-based notes. */
export function aiDemo(): boolean {
  return process.env.AI_DEMO !== "0";
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

// ---------------------------------------------------------------- facts

export interface BabyFacts {
  dayOfLife: number;
  sex: string;
  gestationWeeks: number;
  birthWeightG: number;
  status: string;
  openRedAlert: boolean;
  /** cut-offs the rules engine uses (°C) */
  thresholds: { veryColdBelow: number; coldBelow: number; hotAbove: number };
  /** IST days, oldest first */
  tempDays: { date: string; lowC: number; highC: number; avgC: number; coldReadings: number; readings: number; lowAtIST: string | null }[];
  alerts: { kind: string; trigger: string; startedIST: string; minutes: number | null; closed: boolean }[];
  kmcHoursByDay: { date: string; hours: number }[];
  kmcTargetHours: number;
  weights: { date: string; grams: number; gainGPerKgDay: number | null }[];
  dangerChecks: { date: string; anyYes: boolean; yes: string[] }[];
}

const istTime = (iso: string) =>
  new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");

export async function babyFacts(db: Db, d: BabyDetail, now: number): Promise<BabyFacts> {
  const from = istMidnight(addDays(istDate(now), -14));
  const rows = await db.query<Row>(
    `with r as (
       select to_char((s.recorded_at at time zone 'UTC') + interval '330 minutes', 'YYYY-MM-DD') as day,
              s.recorded_at as at, (s.skin_temp_c + bd.calibration_offset_c)::float as c
         from band_summaries s join bands bd on bd.id = s.band_id
        where bd.baby_id = $1 and s.recorded_at >= $2 and s.skin_temp_c is not null
          and s.contact_pct >= 60 and s.skin_temp_c between 30 and 42)
     select day, min(c) as lo, max(c) as hi, avg(c) as avg, count(*)::int as n,
            count(*) filter (where c < 35.5)::int as cold, (array_agg(at order by c asc))[1] as lo_at
       from r group by day order by day`,
    [d.baby.id, new Date(from).toISOString()],
  );
  const since = now - 15 * 86_400_000;
  return {
    dayOfLife: d.dayOfLife,
    sex: d.baby.sex,
    gestationWeeks: d.baby.gestationWeeks,
    birthWeightG: d.baby.birthWeightG,
    status: d.baby.status,
    openRedAlert: d.episodes.some((e) => e.kind === "red" && !e.closedAt),
    thresholds: { veryColdBelow: 34.5, coldBelow: 35.5, hotAbove: 37.8 },
    tempDays: rows.map((r) => ({
      date: String(r.day),
      lowC: r1(Number(r.lo)),
      highC: r1(Number(r.hi)),
      avgC: r1(Number(r.avg)),
      coldReadings: Number(r.cold),
      readings: Number(r.n),
      lowAtIST: r.lo_at == null ? null : istTime(new Date(r.lo_at as string).toISOString()).slice(11),
    })),
    alerts: d.episodes
      .filter((e) => Date.parse(e.startedAt) >= since)
      .map((e) => ({
        kind: e.kind,
        trigger: e.trigger,
        startedIST: istTime(e.startedAt),
        minutes: e.closedAt ? Math.round((Date.parse(e.closedAt) - Date.parse(e.startedAt)) / 60_000) : null,
        closed: Boolean(e.closedAt),
      })),
    kmcHoursByDay: d.kmcByDay.map((k) => ({ date: k.date, hours: r1(k.hours) })),
    kmcTargetHours: KMC_TARGET_HOURS,
    weights: d.weights.map((w) => ({ date: w.at, grams: w.grams, gainGPerKgDay: w.gainGPerKgDay === null ? null : r1(w.gainGPerKgDay) })),
    dangerChecks: d.dangerChecks.slice(0, 5).map((c) => ({
      date: c.at.slice(0, 10),
      anyYes: c.anyYes,
      yes: Object.entries(c.answers ?? {})
        .filter(([, v]) => v === true)
        .map(([k]) => k),
    })),
  };
}

// ---------------------------------------------------------------- cache + log

interface Logged<T> {
  value: T;
  meta: AiMeta;
}

/** Notes being written right now, so two requests for the same note share one write. */
const inFlight = new Map<string, Promise<Logged<unknown>>>();

type RunOpts = { feature: AiFeature; babyId: string | null; userId: string; lang: Lang; key: unknown; now: number };

async function run<T>(db: Db, opts: RunOpts, rules: () => T, demo: () => T): Promise<Logged<T>> {
  const mode = aiDemo() ? "demo" : "rules";
  const cacheKey = `${opts.feature}:${hash(opts.key)}:${mode}`;
  const pending = inFlight.get(cacheKey) as Promise<Logged<T>> | undefined;
  if (pending) {
    const r = await pending;
    return { value: r.value, meta: { ...r.meta, cached: true, inputTokens: 0, outputTokens: 0, ms: 0 } };
  }
  const p = runOnce(db, opts, cacheKey, mode === "demo" ? demo : rules, mode);
  inFlight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    inFlight.delete(cacheKey);
  }
}

async function runOnce<T>(db: Db, opts: RunOpts, cacheKey: string, write: () => T, mode: "demo" | "rules"): Promise<Logged<T>> {
  const [hit] = await db.query<Row>(
    `select output, source, model, created_at from ai_calls
      where cache_key = $1 and not cached and created_at >= $2 order by created_at desc limit 1`,
    [cacheKey, new Date(opts.now - 12 * 3_600_000).toISOString()],
  );
  if (hit) {
    await db.query(
      `insert into ai_calls (feature, baby_id, user_id, lang, cache_key, source, model, cached, output)
       values ($1, $2, $3, $4, $5, $6, $7, true, '{}'::jsonb)`,
      [opts.feature, opts.babyId, opts.userId, opts.lang, cacheKey, hit.source, hit.model],
    );
    return {
      value: hit.output as T,
      meta: {
        source: hit.source as AiMeta["source"],
        model: (hit.model as string) ?? null,
        cached: true,
        generatedAt: new Date(hit.created_at as string).toISOString(),
        inputTokens: 0,
        outputTokens: 0,
        ms: 0,
      },
    };
  }

  const generatedAt = new Date(opts.now).toISOString();
  const value = write();
  const meta: AiMeta =
    mode === "demo"
      ? { source: "demo", model: DEMO_MODEL, cached: false, generatedAt, ...demoCost(opts.key, value, cacheKey) }
      : { source: "rules", model: null, cached: false, generatedAt, inputTokens: 0, outputTokens: 0, ms: 0 };
  await db.query(
    `insert into ai_calls (feature, baby_id, user_id, lang, cache_key, source, model, cached, input_tokens, output_tokens, ms, output)
     values ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11::jsonb)`,
    [opts.feature, opts.babyId, opts.userId, opts.lang, cacheKey, meta.source, meta.model, meta.inputTokens, meta.outputTokens, meta.ms, JSON.stringify(value)],
  );
  return { value, meta };
}

// ---------------------------------------------------------------- summary

export async function babySummary(
  db: Db,
  args: { detail: BabyDetail; audience: Audience; lang: Lang; userId: string; now: number },
): Promise<{ summary: SummaryDto; meta: AiMeta }> {
  const facts = await babyFacts(db, args.detail, args.now);
  const out = await run<SummaryDto>(
    db,
    { feature: "summary", babyId: args.detail.baby.id, userId: args.userId, lang: args.lang, key: [args.audience, args.lang, facts], now: args.now },
    () => rulesSummary(facts, args.audience, args.lang),
    () => demoSummary(facts, args.audience, args.lang),
  );
  return { summary: safeSummary(out.value, facts, args.lang), meta: out.meta };
}

/** The rules engine has the last word: an open red always means "act". */
function safeSummary(s: SummaryDto, f: BabyFacts, lang: Lang): SummaryDto {
  const points = (Array.isArray(s.points) ? s.points : []).slice(0, 4);
  if (f.openRedAlert || f.status === "red") {
    return {
      ...s,
      points,
      tone: "act",
      action: lang === "hi" ? "लाल चेतावनी के कदम अपनाएँ और अभी आशा दीदी को फ़ोन करें।" : "Follow the red alert steps and call the ASHA now.",
    };
  }
  return { ...s, points, tone: s.tone === "green" || s.tone === "watch" || s.tone === "act" ? s.tone : "watch" };
}

function rulesSummary(f: BabyFacts, audience: Audience, lang: Lang): SummaryDto {
  const hi = lang === "hi";
  const days = f.tempDays;
  const last3 = days.slice(-3);
  const low = days.length ? Math.min(...days.map((d) => d.lowC)) : null;
  const high = days.length ? Math.max(...days.map((d) => d.highC)) : null;
  const coldDays = days.filter((d) => d.lowC < f.thresholds.coldBelow).length;
  const reds = f.alerts.filter((a) => a.kind === "red").length;
  const kmcY = f.kmcHoursByDay.at(-2)?.hours ?? 0;
  const lastW = f.weights.at(-1);
  const danger = f.dangerChecks[0]?.anyYes ?? false;
  const act = f.openRedAlert || f.status === "red" || danger;
  const watch = !act && (coldDays > 0 || kmcY < f.kmcTargetHours || (lastW?.gainGPerKgDay ?? 10) < 5);
  const points: string[] = [];
  if (low !== null && high !== null)
    points.push(
      hi
        ? `पिछले ${days.length} दिनों में तापमान ${low.toFixed(1)}°C से ${high.toFixed(1)}°C रहा।`
        : `Over the last ${days.length} days the temperature ranged from ${low.toFixed(1)}°C to ${high.toFixed(1)}°C.`,
    );
  if (coldDays > 0)
    points.push(hi ? `${coldDays} दिन बच्चा कुछ समय ठंडा रहा।` : `The baby was cold for a while on ${coldDays} day(s).`);
  if (reds > 0) points.push(hi ? `${reds} बार लाल चेतावनी आई।` : `There were ${reds} red alert(s).`);
  points.push(
    hi
      ? `कल KMC ${kmcY.toFixed(1)} घंटे हुआ (लक्ष्य ${f.kmcTargetHours} घंटे)।`
      : `KMC yesterday: ${kmcY.toFixed(1)} h (target ${f.kmcTargetHours} h).`,
  );
  if (lastW && audience !== "mother")
    points.push(
      hi
        ? `आख़िरी वज़न ${lastW.grams} ग्राम${lastW.gainGPerKgDay !== null ? `, बढ़त ${lastW.gainGPerKgDay} ग्राम/किलो/दिन` : ""}।`
        : `Last weight ${lastW.grams} g${lastW.gainGPerKgDay !== null ? `, gain ${lastW.gainGPerKgDay} g/kg/day` : ""}.`,
    );
  const avg3 = last3.length ? last3.reduce((a, d) => a + d.avgC, 0) / last3.length : null;
  const headline = act
    ? hi
      ? "बच्चे को अभी ध्यान चाहिए।"
      : "The baby needs attention now."
    : avg3 !== null
      ? hi
        ? `पिछले 3 दिनों का औसत तापमान ${avg3.toFixed(1)}°C रहा।`
        : `The average temperature over the last 3 days was ${avg3.toFixed(1)}°C.`
      : hi
        ? "अभी बैंड का डेटा कम है।"
        : "There is not much band data yet.";
  const action = act
    ? hi
      ? "अभी आशा दीदी को फ़ोन करें।"
      : "Call the ASHA now."
    : kmcY < f.kmcTargetHours
      ? hi
        ? "आज KMC (त्वचा से त्वचा) का समय बढ़ाएँ।"
        : "Do more skin-to-skin (KMC) today."
      : hi
        ? "KMC और स्तनपान ऐसे ही जारी रखें।"
        : "Keep up KMC and breastfeeding.";
  return { headline, points: points.slice(0, 4), action, tone: act ? "act" : watch ? "watch" : "green" };
}

// ---------------------------------------------------------------- visit plan

export async function visitPlan(
  db: Db,
  args: { items: BabyListItem[]; lang: Lang; userId: string; now: number },
): Promise<{ plan: VisitPlanDto; meta: AiMeta }> {
  // the rules' triage order (red first, then overdue visits...) stays; AI writes the why and the to-do
  const top = [...args.items].sort((a, b) => a.rank - b.rank).slice(0, 8);
  const keyOf = new Map(top.map((b, i) => [`b${i + 1}`, b.baby.id]));
  const lows = await db.query<Row>(
    `select bd.baby_id, min(s.skin_temp_c + bd.calibration_offset_c)::float as lo,
            count(*) filter (where s.skin_temp_c + bd.calibration_offset_c < 35.5)::int as cold
       from band_summaries s join bands bd on bd.id = s.band_id
      where bd.baby_id = any($1::uuid[]) and s.recorded_at >= $2 and s.contact_pct >= 60 and s.skin_temp_c between 30 and 42
      group by 1`,
    [top.map((b) => b.baby.id), new Date(args.now - 3 * 86_400_000).toISOString()],
  );
  const lowBy = new Map(lows.map((r) => [String(r.baby_id), { lo: r1(Number(r.lo)), cold: Number(r.cold) }]));
  const facts = top.map((b, i) => ({
    key: `b${i + 1}`,
    order: i + 1,
    dayOfLife: b.dayOfLife,
    status: b.baby.status,
    openRedAlert: b.openEpisode ? { trigger: b.openEpisode.trigger, acknowledgedByStaff: Boolean(b.openEpisode.staffAcknowledgedAt) } : null,
    nextVisit: b.nextVisit ? { state: b.nextVisit.state, day: b.nextVisit.day } : null,
    kmcHoursYesterday: r1(b.kmcHoursYesterday),
    notGainingWeight: b.notGaining,
    last3DaysLowestC: lowBy.get(b.baby.id)?.lo ?? null,
    last3DaysColdReadings: lowBy.get(b.baby.id)?.cold ?? 0,
  }));
  const out = await run<{ overview: string; items: { key: string; why: string; todo: string }[] }>(
    db,
    { feature: "visit_plan", babyId: null, userId: args.userId, lang: args.lang, key: [args.userId, args.lang, istDate(args.now), facts], now: args.now },
    () => rulesPlan(facts, args.lang),
    () => demoPlan(facts, args.lang),
  );
  const items = facts.flatMap((f) => {
    const it = out.value.items.find((x) => x.key === f.key);
    const babyId = keyOf.get(f.key)!;
    return it ? [{ babyId, why: it.why, todo: it.todo }] : [];
  });
  return { plan: { overview: out.value.overview, items }, meta: out.meta };
}

type PlanFacts = {
  key: string;
  status: string;
  openRedAlert: { trigger: string; acknowledgedByStaff: boolean } | null;
  nextVisit: { state: string; day: number | null } | null;
  kmcHoursYesterday: number;
  notGainingWeight: boolean;
  last3DaysLowestC: number | null;
}[];

function rulesPlan(facts: PlanFacts, lang: Lang) {
  const hi = lang === "hi";
  const items = facts.map((f) => {
    const why: string[] = [];
    if (f.openRedAlert) why.push(hi ? "खुली लाल चेतावनी" : "open red alert");
    if (f.nextVisit?.state === "overdue") why.push(hi ? "विज़िट बाकी है" : "visit overdue");
    if (f.nextVisit?.state === "due") why.push(hi ? "आज विज़िट है" : "visit due today");
    if (f.last3DaysLowestC !== null && f.last3DaysLowestC < 35.5)
      why.push(hi ? `सबसे कम तापमान ${f.last3DaysLowestC}°C` : `lowest temperature ${f.last3DaysLowestC}°C`);
    if (f.kmcHoursYesterday < KMC_TARGET_HOURS) why.push(hi ? `कल KMC ${f.kmcHoursYesterday} घंटे` : `KMC ${f.kmcHoursYesterday} h yesterday`);
    if (f.notGainingWeight) why.push(hi ? "वज़न नहीं बढ़ रहा" : "not gaining weight");
    return {
      key: f.key,
      why: why.length ? why.join(", ") : hi ? "नियमित जाँच" : "routine check",
      todo: f.openRedAlert
        ? hi
          ? "तुरंत जाएँ, तापमान नापें, ज़रूरत हो तो रेफ़र करें।"
          : "Go now, measure the temperature, refer if needed."
        : hi
          ? "तापमान, वज़न और KMC देखें।"
          : "Check temperature, weight and KMC.",
    };
  });
  const reds = facts.filter((f) => f.openRedAlert).length;
  return {
    overview: hi
      ? `आज ${facts.length} बच्चे सूची में हैं${reds ? `, ${reds} लाल चेतावनी के साथ` : ""}।`
      : `${facts.length} babies on today's list${reds ? `, ${reds} with a red alert` : ""}.`,
    items,
  };
}

// ---------------------------------------------------------------- usage

export async function aiUsage(db: Db, now: number) {
  const [t] = await db.query<Row>(
    `select count(*)::int as calls,
            count(*) filter (where source = 'demo' and not cached)::int as model_calls,
            count(*) filter (where cached)::int as cached_calls,
            count(*) filter (where source = 'rules' and not cached)::int as rule_calls,
            coalesce(sum(input_tokens), 0)::bigint as input_tokens,
            coalesce(sum(output_tokens), 0)::bigint as output_tokens,
            coalesce(avg(ms) filter (where source = 'demo' and not cached), 0)::float as avg_ms,
            count(distinct baby_id)::int as babies
       from ai_calls`,
  );
  const byFeature = await db.query<Row>(
    `select feature, count(*)::int as calls, count(*) filter (where source = 'demo' and not cached)::int as model_calls,
            coalesce(sum(input_tokens), 0)::bigint as input_tokens, coalesce(sum(output_tokens), 0)::bigint as output_tokens
       from ai_calls group by feature order by feature`,
  );
  const daily = await db.query<Row>(
    `select to_char((created_at at time zone 'UTC') + interval '330 minutes', 'YYYY-MM-DD') as day, count(*)::int as calls,
            coalesce(sum(input_tokens + output_tokens), 0)::bigint as tokens
       from ai_calls where created_at >= $1 group by 1 order by 1`,
    [new Date(now - 7 * 86_400_000).toISOString()],
  );
  const recent = await db.query<Row>(
    `select feature, lang, source, model, cached, input_tokens, output_tokens, ms, created_at
       from ai_calls order by created_at desc limit 10`,
  );
  const cost = (Number(t?.input_tokens ?? 0) * PRICE.in + Number(t?.output_tokens ?? 0) * PRICE.out) / 1_000_000;
  return {
    demo: aiDemo(),
    model: DEMO_MODEL,
    totals: {
      calls: Number(t?.calls ?? 0),
      modelCalls: Number(t?.model_calls ?? 0),
      cachedCalls: Number(t?.cached_calls ?? 0),
      ruleCalls: Number(t?.rule_calls ?? 0),
      inputTokens: Number(t?.input_tokens ?? 0),
      outputTokens: Number(t?.output_tokens ?? 0),
      avgMs: Math.round(Number(t?.avg_ms ?? 0)),
      babies: Number(t?.babies ?? 0),
      costUsd: Math.round(cost * 10_000) / 10_000,
    },
    byFeature: byFeature.map((r) => ({
      feature: String(r.feature),
      calls: Number(r.calls),
      modelCalls: Number(r.model_calls),
      tokens: Number(r.input_tokens) + Number(r.output_tokens),
    })),
    daily: daily.map((r) => ({ date: String(r.day), calls: Number(r.calls), tokens: Number(r.tokens) })),
    recent: recent.map((r) => ({
      feature: String(r.feature),
      lang: String(r.lang),
      source: String(r.source),
      model: (r.model as string) ?? null,
      cached: Boolean(r.cached),
      tokens: Number(r.input_tokens) + Number(r.output_tokens),
      ms: Number(r.ms),
      at: new Date(r.created_at as string).toISOString(),
    })),
  };
}
