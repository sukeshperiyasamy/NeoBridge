// End-to-end API tests for the PRD workflows, on an in-memory Postgres (PGlite).
import { test } from "node:test";
import assert from "node:assert/strict";

import { addDays, istDate, type BabyDetail, type BabyListItem } from "@neobridge/domain";

import { createApp } from "./app.ts";
import { openDb } from "./db.ts";
import { demoNumbers, seed } from "./seed.ts";

const db = await openDb({ memory: true });
await seed(db);
const sent: { phone: string; body: string }[] = [];
let clock = Date.now();
const app = createApp(db, { demoOtp: true, demoLogin: true, onSms: (phone, body) => sent.push({ phone, body }), now: () => clock });

async function call<T = any>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: T }> {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}

async function login(phone: string): Promise<string> {
  const start = await call("POST", "/v1/auth/otp/start", { phone });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const verify = await call("POST", "/v1/auth/otp/verify", { phone, code: start.json.demoCode });
  assert.equal(verify.status, 200);
  return verify.json.token;
}

test("C3–C5: OTP login, wrong code, resend wait, not registered", async () => {
  const unknown = await call("POST", "/v1/auth/otp/start", { phone: "9876543210" });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.json.error, "not_registered");

  const start = await call("POST", "/v1/auth/otp/start", { phone: "+91 90000 00004" });
  assert.equal(start.status, 200);
  assert.match(start.json.demoCode, /^\d{6}$/);
  assert.ok(sent.some((s) => s.phone === "9000000004" && s.body.includes(start.json.demoCode)));

  const again = await call("POST", "/v1/auth/otp/start", { phone: "9000000004" });
  assert.equal(again.status, 429);

  const wrong = await call("POST", "/v1/auth/otp/verify", {
    phone: "9000000004",
    code: start.json.demoCode === "000000" ? "111111" : "000000",
  });
  assert.equal(wrong.json.error, "wrong_code");

  const ok = await call("POST", "/v1/auth/otp/verify", { phone: "9000000004", code: start.json.demoCode });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.profile.role, "doctor");
  assert.equal(ok.json.profile.specialisation, "general");

  const me = await call("GET", "/v1/me", undefined, ok.json.token);
  assert.equal(me.json.profile.name, "Dr. Rajesh Singh");
  assert.equal((await call("GET", "/v1/me")).status, 401);
});

let ashaToken = "";
let motherToken = "";
let babyId = "";
let motherId = "";

test("W1: ASHA registers a mother and baby; the visit schedule is generated; band assigned", async () => {
  ashaToken = await login(demoNumbers.asha);
  const today = istDate(clock);
  const born = addDays(today, -1);

  const m = await call(
    "POST",
    "/v1/mothers",
    {
      name: "Meena Devi",
      age: 22,
      phone: "9123456780",
      villageId: "belwa",
      familyPhone: null,
      deliveryPlace: "home",
      deliveryDate: born,
      mcpNumber: "MCP-778",
      language: "hi",
    },
    ashaToken,
  );
  assert.equal(m.status, 201, JSON.stringify(m.json));
  motherId = m.json.mother.id;
  assert.ok(sent.some((s) => s.phone === "9123456780"), "mother gets her login by SMS");

  const notMine = await call("POST", "/v1/mothers", { name: "X Y", age: 20, phone: "9123456781", villageId: "nowhere", deliveryPlace: "home", deliveryDate: born, language: "hi" }, ashaToken);
  assert.equal(notMine.status, 403);

  const b = await call(
    "POST",
    "/v1/babies",
    {
      motherId,
      sex: "female",
      bornAt: `${born}T05:00:00+05:30`,
      birthWeightG: 2300,
      gestationWeeks: 36,
      sncuAdmitted: false,
    },
    ashaToken,
  );
  assert.equal(b.status, 201, JSON.stringify(b.json));
  babyId = b.json.baby.id;
  assert.equal(b.json.baby.name, "Baby of Meena Devi");

  const band = await call("POST", `/v1/babies/${babyId}/band`, { bandId: "band-meena", serial: "NB-0099" }, ashaToken);
  assert.equal(band.status, 200);

  const detail = await call<BabyDetail>("GET", `/v1/babies/${babyId}`, undefined, ashaToken);
  assert.deepEqual(
    detail.json.visits.map((v) => v.day),
    [1, 3, 7, 14, 21, 28, 42],
    "home delivery: day 1 plus HBNC days",
  );
  assert.equal(detail.json.baby.bandId, "band-meena");
  assert.equal(detail.json.dayOfLife, 2);

  // the day-1 visit was yesterday, so it is overdue and ranks above green babies
  const list = await call<{ babies: BabyListItem[] }>("GET", "/v1/babies", undefined, ashaToken);
  const row = list.json.babies.find((x) => x.baby.id === babyId)!;
  assert.equal(row.nextVisit?.state, "overdue");

  // mother logs in and gives consent with the ASHA as witness
  motherToken = await login("9123456780");
  const me = await call("GET", "/v1/me", undefined, motherToken);
  assert.equal(me.json.babies[0].id, babyId);
  assert.equal(me.json.mother.consentAt, null);
  const consent = await call("POST", `/v1/mothers/${motherId}/consent`, { witnessed: true }, motherToken);
  assert.ok(consent.json.mother.consentAt);
});

let episodeId = "";

test("W3: red from the mother's phone reaches the ASHA; ack; close needs a reason or a visit", async () => {
  episodeId = `ep-test-${Date.now()}`;
  const status = await call("POST", `/v1/babies/${babyId}/status`, { status: "red", reason: "veryCold", at: clock }, motherToken);
  assert.equal(status.status, 200);
  const e = await call(
    "POST",
    "/v1/episodes",
    { id: episodeId, babyId, kind: "red", trigger: "veryCold", startedAt: clock },
    motherToken,
  );
  assert.equal(e.status, 200, JSON.stringify(e.json));
  assert.ok(sent.some((s) => s.phone === demoNumbers.asha && s.body.includes("RED")), "ASHA gets an SMS");

  // re-sending from the offline queue is harmless
  await call("POST", "/v1/episodes", { id: episodeId, babyId, kind: "red", trigger: "veryCold", startedAt: clock, familyAcknowledgedAt: clock + 1000 }, motherToken);

  const open = await call("GET", "/v1/episodes?open=1&kind=red", undefined, ashaToken);
  const mine = open.json.episodes.filter((x: any) => x.babyId === babyId);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].motherName, "Meena Devi");
  assert.ok(mine[0].familyAcknowledgedAt);

  // red sorts first on the ASHA's list
  const list = await call<{ babies: BabyListItem[] }>("GET", "/v1/babies", undefined, ashaToken);
  assert.equal(list.json.babies[0].baby.id, babyId);
  assert.equal(list.json.babies[0].rank, 0);

  // after 16 minutes unacknowledged the MO's dashboard flags it
  clock += 16 * 60_000;
  const mo = await login(demoNumbers.medicalOfficer);
  const dash = await call("GET", "/v1/dashboard", undefined, mo);
  assert.equal(dash.json.kind, "catchment");
  assert.ok(dash.json.escalations.some((x: any) => x.episode.id === episodeId));

  const ack = await call("POST", `/v1/episodes/${episodeId}/ack`, {}, ashaToken);
  assert.ok(ack.json.episode.staffAcknowledgedAt);
  assert.equal(ack.json.episode.staffAcknowledgedBy.role, "asha");

  // mother's phone sees "ASHA is coming"
  const seen = await call("GET", `/v1/episodes/${episodeId}`, undefined, motherToken);
  assert.equal(seen.json.episode.staffAcknowledgedBy.name, "Sunita Devi");

  const noReason = await call("POST", `/v1/episodes/${episodeId}/close`, {}, ashaToken);
  assert.equal(noReason.json.error, "reason_required");
  const motherCannot = await call("POST", `/v1/episodes/${episodeId}/close`, { reason: "fine now" }, motherToken);
  assert.equal(motherCannot.status, 403);
});

test("W5: a home-care visit with an axillary reading closes the open red", async () => {
  const v = await call(
    "POST",
    "/v1/visits",
    {
      clientId: "visit-test-1",
      babyId,
      axillaryTempC: 36.7,
      weightG: 2280,
      breastfeedingWell: true,
      kmcHours: 5,
      dangerSigns: { poorFeeding: false, limp: false, breathing: false, fits: false, yellowSkin: false },
      bandCheck: { fit: true, skin: true, battery: true },
      outcome: "home_care",
      notes: "Warm after KMC",
    },
    ashaToken,
  );
  assert.equal(v.status, 201, JSON.stringify(v.json));
  const again = await call("POST", "/v1/visits", { clientId: "visit-test-1", babyId, axillaryTempC: 36.7, dangerSigns: {}, outcome: "home_care" }, ashaToken);
  assert.equal(again.json.duplicate, true);

  const e = await call("GET", `/v1/episodes/${episodeId}`, undefined, motherToken);
  assert.ok(e.json.episode.closedAt, "closed by the visit");
  assert.equal(e.json.episode.closeReason, "visit");

  const detail = await call<BabyDetail>("GET", `/v1/babies/${babyId}`, undefined, ashaToken);
  const done = detail.json.visits.filter((x) => x.doneAt);
  assert.equal(done.length, 1);
  assert.equal(done[0].kind, "extra", "the red episode's extra visit was the one filled");
  assert.equal(detail.json.weights.at(-1)?.grams, 2280);
});

test("W6: referral to a facility makes the baby visible to that facility's doctor", async () => {
  const neo = await login(demoNumbers.neonatologist);
  const before = await call<{ babies: BabyListItem[] }>("GET", "/v1/babies", undefined, neo);
  assert.ok(!before.json.babies.some((b) => b.baby.id === babyId), "home birth in Belwa is not the SNCU's yet");

  const r = await call("POST", "/v1/referrals", { clientId: "ref-1", babyId, facilityId: "sncu-dh", reason: "Fast breathing" }, ashaToken);
  assert.equal(r.status, 201);
  const after = await call<{ babies: BabyListItem[] }>("GET", "/v1/babies", undefined, neo);
  assert.ok(after.json.babies.some((b) => b.baby.id === babyId));
});

test("W7: doctor writes advice with a follow-up; mother sees family advice only; ASHA gets a visit", async () => {
  const neo = await login(demoNumbers.neonatologist);
  const followUp = addDays(istDate(clock), 5);
  const a = await call("POST", "/v1/advice", { babyId, kind: "family", template: "opd", followUpDate: followUp }, neo);
  assert.equal(a.status, 201, JSON.stringify(a.json));
  await call("POST", "/v1/advice", { babyId, kind: "clinical", body: "Watch breathing rate" }, neo);

  const mom = await call<BabyDetail>("GET", `/v1/babies/${babyId}`, undefined, motherToken);
  assert.equal(mom.json.advice.length, 1);
  assert.equal(mom.json.advice[0].followUpDate, followUp);

  const asha = await call<BabyDetail>("GET", `/v1/babies/${babyId}`, undefined, ashaToken);
  assert.equal(asha.json.advice.length, 2);
  assert.ok(asha.json.visits.some((v) => v.reason === "doctor" && v.dueDate === followUp));

  const dash = await call("GET", "/v1/dashboard", undefined, neo);
  assert.equal(dash.json.kind, "newborn");
  assert.deepEqual(dash.json.tiles.map((t: any) => t.key), ["redYellow", "kmcUnder8", "notGaining", "visitsOverdue"]);

  const temps = await call("GET", `/v1/babies/${(await call<{ babies: BabyListItem[] }>("GET", "/v1/babies", undefined, neo)).json.babies.find((b) => b.mother.name === "Anita Kumari")!.baby.id}/temps?hours=24`, undefined, neo);
  assert.ok(temps.json.points.length > 200, "5-minute medians over 24 h");
});

test("scope: a mother sees only her own baby", async () => {
  const reena = await login(demoNumbers.mother);
  const list = await call<{ babies: BabyListItem[] }>("GET", "/v1/babies", undefined, reena);
  assert.equal(list.json.babies.length, 1);
  assert.equal((await call("GET", `/v1/babies/${babyId}`, undefined, reena)).status, 404);
});

test("KMC and danger checks from the family", async () => {
  const k = await call("POST", "/v1/kmc-sessions", { id: "kmc-1", babyId, holder: "father", startedAt: clock - 3_600_000, endedAt: clock }, motherToken);
  assert.equal(k.status, 200);
  const d = await call("POST", "/v1/danger-checks", { id: "dc-1", babyId, at: clock, answers: { fits: true } }, motherToken);
  assert.equal(d.json.anyYes, true);
  const detail = await call<BabyDetail>("GET", `/v1/babies/${babyId}`, undefined, ashaToken);
  assert.equal(detail.json.kmcByDay.at(-1)!.hours > 0 || detail.json.kmcByDay.at(-2)!.hours > 0, true);
  assert.equal(detail.json.dangerChecks[0].anyYes, true);
});

test("demo user ID + password login gives a normal session; wrong password and switched-off are refused", async () => {
  const ok = await call("POST", "/v1/auth/password", { id: "ASHA.demo", password: "Asha@123" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.profile.role, "asha");
  const me = await call("GET", "/v1/me", undefined, ok.json.token);
  assert.equal(me.json.profile.name, "Sunita Devi");

  const wrong = await call("POST", "/v1/auth/password", { id: "asha.demo", password: "nope" });
  assert.equal(wrong.json.error, "wrong_password");

  const off = createApp(db, { demoOtp: true });
  const res = await off.request("/v1/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "asha.demo", password: "Asha@123" }),
  });
  assert.equal(res.status, 404);
});

test("15 days of demo readings: daily low and high, and the mother can see her baby's trend", async () => {
  const reena = await login(demoNumbers.mother);
  const me = await call("GET", "/v1/me", undefined, reena);
  const id = me.json.babies[0].id as string;
  const days = await call("GET", `/v1/babies/${id}/temp-days?days=15`, undefined, reena);
  assert.equal(days.status, 200);
  assert.ok(days.json.days.length >= 14, `got ${days.json.days.length} days`);
  for (const d of days.json.days) {
    assert.ok(d.minC <= d.avgC && d.avgC <= d.maxC);
    assert.ok(d.minC > 33 && d.maxC < 38.5, JSON.stringify(d));
  }
  assert.equal(days.json.range.minC, Math.min(...days.json.days.map((d: any) => d.minC)));
  const temps = await call("GET", `/v1/babies/${id}/temps?hours=360`, undefined, reena);
  assert.equal(temps.status, 200);
  assert.ok(temps.json.points.length > 300, "hourly medians over 15 days");

  // Kavita's red episode 5 days ago shows as a dip below the very-cold line
  const asha = await login(demoNumbers.asha);
  const list = await call<{ babies: BabyListItem[] }>("GET", "/v1/babies", undefined, asha);
  const kavita = list.json.babies.find((b) => b.mother.name === "Kavita Devi")!.baby.id;
  const k = await call("GET", `/v1/babies/${kavita}/temp-days?days=15`, undefined, asha);
  assert.ok(k.json.range.minC < 34.5, `lowest ${k.json.range.minC}`);
});

test("profile: a mother edits her details, number change is checked, baby details and a home weight", async () => {
  const token = await login("9000000014");
  assert.equal((await call("PATCH", "/v1/me", { phone: demoNumbers.asha }, token)).status, 409);
  assert.equal((await call("PATCH", "/v1/me", {}, token)).status, 400);
  const ok = await call("PATCH", "/v1/me", { name: "Anita Kumari Singh", age: 24, familyPhone: "8111111111", phone: "9111111111" }, token);
  assert.equal(ok.status, 200);
  const me = await call("GET", "/v1/me", undefined, token);
  assert.equal(me.json.profile.phone, "9111111111");
  assert.equal(me.json.mother.name, "Anita Kumari Singh");
  assert.equal(me.json.mother.age, 24);
  assert.equal(me.json.mother.familyPhone, "8111111111");
  // the new number logs in
  await login("9111111111");

  const babyOf = me.json.babies[0].id as string;
  const b = await call("PATCH", `/v1/babies/${babyOf}`, { name: "Aarav", birthWeightG: 3050 }, token);
  assert.equal(b.status, 200);
  assert.equal(b.json.baby.name, "Aarav");
  assert.equal(b.json.baby.birthWeightG, 3050);
  assert.equal((await call("PATCH", `/v1/babies/${babyId}`, { name: "Not mine" }, token)).status, 403);

  assert.equal((await call("POST", `/v1/babies/${babyOf}/weights`, { grams: 3120 }, token)).status, 201);
  const detail = await call<BabyDetail>("GET", `/v1/babies/${babyOf}`, undefined, token);
  assert.equal(detail.json.weights.at(-1)!.grams, 3120);
});

test("export: the baby's readings and daily low/high as CSV", async () => {
  const reena = await login(demoNumbers.mother);
  const id = (await call("GET", "/v1/me", undefined, reena)).json.babies[0].id as string;
  const res = await app.request(`/v1/babies/${id}/export?kind=readings&days=15`, { headers: { authorization: `Bearer ${reena}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type")!, /text\/csv/);
  assert.match(res.headers.get("content-disposition")!, /attachment; filename="neobridge-reena-s-baby-readings-/);
  const lines = (await res.text()).trim().split("\r\n");
  assert.equal(lines[0], "time_ist,skin_temp_c,room_temp_c,heart_rate_bpm,skin_contact_pct,battery_pct,status,band");
  assert.ok(lines.length > 3000, `${lines.length} rows`);
  const daily = await app.request(`/v1/babies/${id}/export?kind=daily`, { headers: { authorization: `Bearer ${reena}` } });
  const d = (await daily.text()).trim().split("\r\n");
  assert.equal(d[0], "date,lowest_c,highest_c,average_c,readings");
  assert.ok(d.length >= 15);
  assert.equal((await app.request(`/v1/babies/${id}/export`)).status, 401);
});
