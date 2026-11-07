import { KMC_TARGET_HOURS } from "@neobridge/domain";

import type { Audience, BabyFacts, Lang, SummaryDto } from "./ai.ts";
import type { Db } from "./db.ts";

/**
 * AI demo mode: plain-language notes for the mother, ASHA and doctor, built
 * from the baby's real numbers, plus a week of sample usage so the "AI in
 * NeoBridge" screen has something to show. Everything from here is marked
 * source = "demo" and labelled "demo" in the app. A language model can
 * replace these writers later (ai.ts run()).
 */

export const DEMO_MODEL = "neobridge-ai-v1";

/** Rough token counts and reply time for a note of this size, for the usage screen. */
export function demoCost(input: unknown, output: unknown, seed: string) {
  const r = rand(seed);
  return {
    inputTokens: 900 + Math.round(JSON.stringify(input).length / 3.6),
    outputTokens: 60 + Math.round(JSON.stringify(output).length / 2.4),
    ms: 2200 + Math.round(r() * 2600),
  };
}

function rand(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const c1 = (v: number) => `${v.toFixed(1)}°C`;
const kg = (g: number) => `${(g / 1000).toFixed(2)} kg`;
const partOfDay = (hhmm: string | null, hi: boolean) => {
  if (!hhmm) return "";
  const h = Number(hhmm.slice(0, 2));
  if (h < 5 || h >= 22) return hi ? "रात में" : "at night";
  if (h < 11) return hi ? "सुबह" : "in the morning";
  if (h < 17) return hi ? "दोपहर में" : "in the afternoon";
  return hi ? "शाम को" : "in the evening";
};

export function demoSummary(f: BabyFacts, audience: Audience, lang: Lang): SummaryDto {
  const hi = lang === "hi";
  const t = f.thresholds;
  const days = f.tempDays;
  const today = days.at(-1);
  const yesterday = days.at(-2);
  const recent = days.slice(-2);
  const coldRecent = recent.filter((d) => d.lowC < t.coldBelow);
  const coldDays = days.filter((d) => d.lowC < t.coldBelow).length;
  const low = days.length ? Math.min(...days.map((d) => d.lowC)) : null;
  const high = days.length ? Math.max(...days.map((d) => d.highC)) : null;
  const avg = (xs: typeof days) => (xs.length ? xs.reduce((a, d) => a + d.avgC, 0) / xs.length : null);
  const thisWeek = avg(days.slice(-7));
  const lastWeek = avg(days.slice(-14, -7));
  const reds = f.alerts.filter((a) => a.kind === "red");
  const yellowsOpen = f.alerts.filter((a) => a.kind === "yellow" && !a.closed);
  const kmcY = f.kmcHoursByDay.at(-2)?.hours ?? 0;
  const kmcWeek = f.kmcHoursByDay.slice(0, -1);
  const kmcMet = kmcWeek.filter((k) => k.hours >= f.kmcTargetHours).length;
  const kmcAvg = kmcWeek.length ? kmcWeek.reduce((a, k) => a + k.hours, 0) / kmcWeek.length : 0;
  const w = f.weights.at(-1);
  const wPrev = f.weights.at(-2);
  const gain = w?.gainGPerKgDay ?? null;
  const danger = f.dangerChecks[0]?.anyYes ?? false;
  const act = f.openRedAlert || f.status === "red" || danger;
  const cold = !act && (coldRecent.length > 0 || yellowsOpen.length > 0 || f.status === "yellow");
  const kmcShort = kmcY < f.kmcTargetHours;
  const lowSpell = [...recent].sort((a, b) => a.lowC - b.lowC)[0];
  const when = partOfDay(lowSpell?.lowAtIST ?? null, hi);
  const tone: SummaryDto["tone"] = act ? "act" : cold || kmcShort || (gain !== null && gain < 5) ? "watch" : "green";
  const points: string[] = [];

  if (audience === "mother") {
    const headline = act
      ? hi
        ? "आपके बच्चे को अभी ध्यान चाहिए। आशा दीदी को अभी फ़ोन करें।"
        : "Your baby needs attention now. Please call your ASHA."
      : cold && lowSpell
        ? hi
          ? `कल से आपका बच्चा ${when} थोड़ा ठंडा हुआ (${c1(lowSpell.lowC)}), बाकी समय तापमान ठीक दायरे में रहा।`
          : `Your baby got a little cold ${when} (${c1(lowSpell.lowC)}); the rest of the time the temperature stayed in the normal range.`
        : hi
          ? `आपके बच्चे का तापमान पिछले दिनों में ठीक दायरे में रहा${today ? `, आज औसत ${c1(today.avgC)}` : ""}।`
          : `Your baby's temperature has stayed in the normal range${today ? `, around ${c1(today.avgC)} today` : ""}.`;
    if (low !== null && high !== null)
      points.push(
        coldDays > 0
          ? hi
            ? `पिछले ${days.length} दिनों में ${coldDays} दिन बच्चा कुछ देर ठंडा हुआ, ज़्यादातर ${partOfDay(days.find((d) => d.lowC < t.coldBelow)?.lowAtIST ?? null, true) || "रात में"}।`
            : `On ${coldDays} of the last ${days.length} days your baby was cold for a short time, mostly ${partOfDay(days.find((d) => d.lowC < t.coldBelow)?.lowAtIST ?? null, false) || "at night"}.`
          : hi
            ? `पिछले ${days.length} दिनों में तापमान ${c1(low)} से ${c1(high)} के बीच रहा। यह अच्छा है।`
            : `Over the last ${days.length} days the temperature stayed between ${c1(low)} and ${c1(high)}. That is good.`,
      );
    points.push(
      kmcShort
        ? hi
          ? `कल आपने ${kmcY.toFixed(1)} घंटे KMC (त्वचा से त्वचा) किया। ${(f.kmcTargetHours - kmcY).toFixed(1)} घंटे और करने से 8 घंटे का लक्ष्य पूरा होगा।`
          : `Yesterday you gave ${kmcY.toFixed(1)} hours of skin-to-skin (KMC). ${(f.kmcTargetHours - kmcY).toFixed(1)} more hours reaches the 8-hour goal.`
        : hi
          ? `कल आपने ${kmcY.toFixed(1)} घंटे KMC किया और 8 घंटे का लक्ष्य पूरा किया। बहुत अच्छा!`
          : `Yesterday you gave ${kmcY.toFixed(1)} hours of KMC and reached the 8-hour goal. Well done!`,
    );
    if (w && wPrev)
      points.push(
        gain !== null && gain >= 5
          ? hi
            ? `बच्चे का वज़न ${kg(wPrev.grams)} से बढ़कर ${kg(w.grams)} हो गया है।`
            : `Your baby's weight went up from ${kg(wPrev.grams)} to ${kg(w.grams)}.`
          : hi
            ? `वज़न ${kg(w.grams)} है, बहुत कम बढ़ा है। हर 2 घंटे में दूध पिलाएँ।`
            : `Weight is ${kg(w.grams)} and has not gone up much. Feed at least every 2 hours.`,
      );
    if (thisWeek !== null && lastWeek !== null && Math.abs(thisWeek - lastWeek) >= 0.1)
      points.push(
        thisWeek > lastWeek
          ? hi
            ? "इस हफ़्ते तापमान पिछले हफ़्ते से ज़्यादा स्थिर रहा।"
            : "This week the temperature was steadier than last week."
          : hi
            ? "इस हफ़्ते तापमान पिछले हफ़्ते से थोड़ा कम रहा, रात में ख़ास ध्यान रखें।"
            : "This week the temperature was a little lower than last week; take extra care at night.",
      );
    const action = act
      ? hi
        ? "लाल चेतावनी के कदम अपनाएँ और अभी आशा दीदी को फ़ोन करें।"
        : "Follow the red alert steps and call your ASHA now."
      : cold
        ? hi
          ? "आज रात बच्चे को त्वचा से त्वचा लगाकर रखें और सिर-पैर ढक कर रखें।"
          : "Tonight keep your baby skin-to-skin, with the head and feet covered."
        : kmcShort
          ? hi
            ? "आज एक और KMC सत्र जोड़ें — पिता या दादी भी कर सकते हैं।"
            : "Add one more KMC session today — the father or grandmother can help."
          : hi
            ? "ऐसे ही KMC और बार-बार स्तनपान जारी रखें।"
            : "Keep up KMC and frequent breastfeeding.";
    return { headline, points: points.slice(0, 4), action, tone };
  }

  if (audience === "asha") {
    const headline = act
      ? hi
        ? "खुली लाल चेतावनी है — यह विज़िट सबसे पहले करें।"
        : "Open red alert: make this the first visit."
      : cold
        ? hi
          ? `पिछले 2 दिनों में ठंड का दौर (सबसे कम ${c1(lowSpell!.lowC)}, ${when})। घर में गर्माहट और KMC जाँचें।`
          : `Cold spell in the last 2 days (lowest ${c1(lowSpell!.lowC)}, ${when}). Check room warmth and KMC.`
        : hi
          ? `दिन ${f.dayOfLife}: तापमान स्थिर, ${reds.length ? `पिछले 15 दिनों में ${reds.length} लाल चेतावनी (बंद)` : "कोई लाल चेतावनी नहीं"}।`
          : `Day ${f.dayOfLife}: temperature stable, ${reds.length ? `${reds.length} red alert(s) in 15 days, closed` : "no red alerts in 15 days"}.`;
    if (low !== null && high !== null)
      points.push(
        hi
          ? `15 दिन: ${c1(low)}–${c1(high)}; ${coldDays} दिन 35.5°C से नीचे गया।`
          : `15 days: ${c1(low)}–${c1(high)}; went below 35.5°C on ${coldDays} day(s).`,
      );
    points.push(
      hi
        ? `KMC: कल ${kmcY.toFixed(1)} घंटे, हफ़्ते का औसत ${kmcAvg.toFixed(1)} घंटे; ${kmcMet}/${kmcWeek.length} दिन लक्ष्य पूरा।`
        : `KMC: ${kmcY.toFixed(1)} h yesterday, ${kmcAvg.toFixed(1)} h/day this week; target met on ${kmcMet}/${kmcWeek.length} days.`,
    );
    if (w)
      points.push(
        hi
          ? `वज़न ${w.grams} ग्राम${gain !== null ? `, बढ़त ${gain} ग्राम/किलो/दिन${gain < 5 ? " (कम)" : ""}` : ""}।`
          : `Weight ${w.grams} g${gain !== null ? `, gain ${gain} g/kg/day${gain < 5 ? " (low)" : ""}` : ""}.`,
      );
    if (danger) points.push(hi ? `ख़तरे के संकेत: ${f.dangerChecks[0]!.yes.join(", ")}।` : `Danger signs reported: ${f.dangerChecks[0]!.yes.join(", ")}.`);
    const action = act
      ? hi
        ? "तुरंत जाएँ: बगल का तापमान नापें, KMC शुरू कराएँ, 35.5°C से कम हो तो रेफ़र करें।"
        : "Go now: take an axillary temperature, start KMC, refer if below 35.5°C."
      : cold
        ? hi
          ? "बैंड की फ़िटिंग, कमरे की गर्माहट और रात में KMC जाँचें; माँ को सिर-पैर ढकना दिखाएँ।"
          : "Check band fit, room warmth and night-time KMC; show the mother how to cover the head and feet."
        : kmcShort
          ? hi
            ? "परिवार में KMC बाँटने की योजना बनाएँ ताकि 8 घंटे पूरे हों।"
            : "Plan KMC sharing in the family to reach 8 hours."
          : hi
            ? "नियमित जाँच: वज़न लें और एक बार स्तनपान देखें।"
            : "Routine check: weigh the baby and observe one breastfeed.";
    return { headline, points: points.slice(0, 4), action, tone };
  }

  // doctor
  const headline = hi
    ? `दिन ${f.dayOfLife}, ${f.gestationWeeks} सप्ताह, जन्म ${f.birthWeightG} ग्राम। ${act ? "खुली लाल चेतावनी।" : cold ? "हाल में हल्का हाइपोथर्मिया।" : "15 दिनों में तापमान स्थिर।"}`
    : `Day ${f.dayOfLife}, ${f.gestationWeeks} wk, BW ${f.birthWeightG} g. ${act ? "Open red alert." : cold ? "Recent mild hypothermia." : "Thermally stable over 15 days."}`;
  if (low !== null && high !== null)
    points.push(
      hi
        ? `त्वचा तापमान ${c1(low)}–${c1(high)}, औसत इस हफ़्ते ${thisWeek?.toFixed(2) ?? "–"}°C बनाम पिछले हफ़्ते ${lastWeek?.toFixed(2) ?? "–"}°C; ${coldDays} दिन <35.5°C।`
        : `Skin temp ${c1(low)}–${c1(high)}; mean ${thisWeek?.toFixed(2) ?? "–"}°C this week vs ${lastWeek?.toFixed(2) ?? "–"}°C last week; ${coldDays} day(s) <35.5°C.`,
    );
  points.push(
    reds.length || f.alerts.length
      ? hi
        ? `चेतावनियाँ: ${f.alerts.map((a) => `${a.kind} ${a.trigger} ${a.startedIST}${a.minutes !== null ? ` (${a.minutes} मिनट)` : " (खुली)"}`).join("; ")}।`
        : `Alerts: ${f.alerts.map((a) => `${a.kind} ${a.trigger} ${a.startedIST}${a.minutes !== null ? ` (${a.minutes} min)` : " (open)"}`).join("; ")}.`
      : hi
        ? "15 दिनों में कोई चेतावनी नहीं।"
        : "No alerts in 15 days.",
  );
  points.push(
    hi
      ? `KMC औसत ${kmcAvg.toFixed(1)} घंटे/दिन, ${kmcMet}/${kmcWeek.length} दिन ≥${KMC_TARGET_HOURS} घंटे।`
      : `KMC mean ${kmcAvg.toFixed(1)} h/day, ≥${KMC_TARGET_HOURS} h on ${kmcMet}/${kmcWeek.length} days.`,
  );
  if (w)
    points.push(
      hi
        ? `वज़न ${w.grams} ग्राम (${w.date})${gain !== null ? `, ${gain} ग्राम/किलो/दिन` : ""}${danger ? "; ख़तरे के संकेत दर्ज" : "; ख़तरे के संकेत नहीं"}।`
        : `Weight ${w.grams} g (${w.date})${gain !== null ? `, ${gain} g/kg/day` : ""}${danger ? "; danger signs reported" : "; no danger signs"}.`,
    );
  const action = act
    ? hi
      ? "खुली लाल चेतावनी की समीक्षा करें; रेफ़रल पर विचार करें।"
      : "Review the open red episode; consider referral."
    : cold || (gain !== null && gain < 5)
      ? hi
        ? "रात के KMC और भोजन पर सलाह दें; 3 दिन में फ़ॉलो-अप।"
        : "Advise on night-time KMC and feeding; follow up in 3 days."
      : hi
        ? "मौजूदा देखभाल जारी रखें; अगली निर्धारित विज़िट पर समीक्षा।"
        : "Continue current care; review at the next scheduled visit.";
  return { headline, points: points.slice(0, 4), action, tone };
}

type PlanFact = {
  key: string;
  dayOfLife: number;
  status: string;
  openRedAlert: { trigger: string; acknowledgedByStaff: boolean } | null;
  nextVisit: { state: string; day: number | null } | null;
  kmcHoursYesterday: number;
  notGainingWeight: boolean;
  last3DaysLowestC: number | null;
  last3DaysColdReadings: number;
};

export function demoPlan(facts: PlanFact[], lang: Lang) {
  const hi = lang === "hi";
  const items = facts.map((f) => {
    const why: string[] = [];
    if (f.openRedAlert) why.push(hi ? "खुली लाल चेतावनी" : "open red alert");
    if (f.last3DaysLowestC !== null && f.last3DaysLowestC < 35.5)
      why.push(hi ? `3 दिन में सबसे कम ${f.last3DaysLowestC}°C` : `dipped to ${f.last3DaysLowestC}°C in the last 3 days`);
    if (f.nextVisit?.state === "overdue") why.push(hi ? `दिन ${f.nextVisit.day ?? ""} की विज़िट बाकी` : `day ${f.nextVisit.day ?? ""} visit overdue`);
    if (f.nextVisit?.state === "due") why.push(hi ? `दिन ${f.nextVisit.day ?? ""} की विज़िट आज` : `day ${f.nextVisit.day ?? ""} visit due today`);
    if (f.kmcHoursYesterday < KMC_TARGET_HOURS) why.push(hi ? `कल KMC सिर्फ़ ${f.kmcHoursYesterday} घंटे` : `only ${f.kmcHoursYesterday} h KMC yesterday`);
    if (f.notGainingWeight) why.push(hi ? "वज़न नहीं बढ़ रहा" : "weight not rising");
    if (f.status === "grey") why.push(hi ? "बैंड से रीडिंग नहीं आ रही" : "no band readings");
    const todo = f.openRedAlert
      ? hi
        ? "सबसे पहले जाएँ: बगल का तापमान नापें, KMC शुरू कराएँ, ज़रूरत हो तो रेफ़र करें।"
        : "Go first: take an axillary temperature, start KMC, refer if needed."
      : f.last3DaysLowestC !== null && f.last3DaysLowestC < 35.5
        ? hi
          ? "कमरे की गर्माहट और बैंड की फ़िटिंग देखें; रात में KMC की योजना बनाएँ।"
          : "Check room warmth and band fit; plan night-time KMC with the family."
        : f.notGainingWeight
          ? hi
            ? "वज़न लें और एक स्तनपान देखें; हर 2 घंटे दूध पिलाने को कहें।"
            : "Weigh the baby and watch one breastfeed; advise feeds every 2 hours."
          : f.status === "grey"
            ? hi
              ? "बैंड चार्ज और कनेक्शन जाँचें।"
              : "Check the band is charged and connected."
            : f.kmcHoursYesterday < KMC_TARGET_HOURS
              ? hi
                ? "परिवार में KMC बाँटने की बात करें ताकि 8 घंटे पूरे हों।"
                : "Ask who can share KMC so the family reaches 8 hours."
              : hi
                ? "नियमित विज़िट: तापमान, वज़न और KMC दर्ज करें।"
                : "Routine visit: record temperature, weight and KMC.";
    return { key: f.key, why: why.length ? why.join(", ") : hi ? "नियमित जाँच" : "routine check", todo };
  });
  const reds = facts.filter((f) => f.openRedAlert).length;
  const cold = facts.filter((f) => f.last3DaysLowestC !== null && f.last3DaysLowestC < 35.5).length;
  const due = facts.filter((f) => f.nextVisit && (f.nextVisit.state === "due" || f.nextVisit.state === "overdue")).length;
  const overview = hi
    ? `आज ${facts.length} बच्चे: ${reds ? `${reds} लाल चेतावनी के साथ, ` : ""}${cold} को हाल में ठंड लगी, ${due} की विज़िट आज या बाकी है। ऊपर से शुरू करें।`
    : `${facts.length} babies today: ${reds ? `${reds} with a red alert, ` : ""}${cold} had a recent cold spell and ${due} have a visit due or overdue. Start from the top.`;
  return { overview, items };
}

/** A week of sample AI calls for the usage screen (demo data). */
export async function seedDemoAiUsage(db: Db, now: number): Promise<void> {
  const babies = await db.query<{ id: string }>("select id from babies order by id");
  const users = await db.query<{ id: string; role: string }>("select id, role from users where role in ('mother','asha','doctor')");
  if (!babies.length || !users.length) return;
  const r = rand("neobridge-ai");
  const rows: unknown[][] = [];
  for (let day = 6; day >= 0; day--) {
    const n = 10 + Math.round(r() * 12) + (6 - day) * 2;
    for (let i = 0; i < n; i++) {
      const plan = r() < 0.18;
      const cached = r() < 0.35;
      const at = new Date(now - day * 86_400_000 - Math.round(r() * 12 * 3_600_000) - 3_600_000).toISOString();
      const inT = plan ? 1700 + Math.round(r() * 600) : 1300 + Math.round(r() * 700);
      const outT = plan ? 420 + Math.round(r() * 200) : 180 + Math.round(r() * 160);
      rows.push([
        plan ? "visit_plan" : "summary",
        plan ? null : babies[Math.floor(r() * babies.length)]!.id,
        users[Math.floor(r() * users.length)]!.id,
        r() < 0.65 ? "hi" : "en",
        `seed:${day}:${i}`,
        cached,
        cached ? 0 : inT,
        cached ? 0 : outT,
        cached ? 0 : 2100 + Math.round(r() * 2800),
        at,
      ]);
    }
  }
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const params: unknown[] = [];
    const sql = chunk
      .map((row) => {
        const p = row.map((v) => (params.push(v), `$${params.length}`));
        return `(${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},'demo','${DEMO_MODEL}',${p[5]},${p[6]},${p[7]},${p[8]},'{}'::jsonb,${p[9]})`;
      })
      .join(",");
    await db.query(
      `insert into ai_calls (feature, baby_id, user_id, lang, cache_key, source, model, cached, input_tokens, output_tokens, ms, output, created_at) values ${sql}`,
      params,
    );
  }
}
