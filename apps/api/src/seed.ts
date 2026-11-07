// Demo data: facilities, villages, staff and five households (PRD: "P0 uses a
// seed script"). Dates are relative to now, so the demo always looks current.

import { addDays, istDate, visitSchedule } from "@neobridge/domain";

import type { Db } from "./db.ts";
import { topUpDemoHistory } from "./demo-history.ts";

/** Login numbers for the demo, shown on the login screen. */
export const demoNumbers = {
  asha: "9000000001",
  neonatologist: "9000000002",
  obstetrician: "9000000003",
  medicalOfficer: "9000000004",
  mother: "9000000011",
} as const;

const DAY = 86_400_000;
const HOUR = 3_600_000;

export async function seedIfEmpty(db: Db, now = Date.now()): Promise<boolean> {
  const [row] = await db.query<{ n: number }>("select count(*)::int as n from users");
  if (Number(row.n) > 0) return false;
  await seed(db, now);
  return true;
}

export async function seed(db: Db, now = Date.now()) {
  const q = (sql: string, params: unknown[] = []) => db.query<Record<string, unknown>>(sql, params);
  const ts = (msAgo: number) => new Date(now - msAgo).toISOString();

  await q(`insert into facilities (id, name, level, phone) values
    ('sncu-dh', 'District Hospital SNCU, Muzaffarpur', 'SNCU', '9000000101'),
    ('phc-saraiya', 'PHC Saraiya', 'PHC', '9000000102'),
    ('chc-kanti', 'CHC Kanti', 'CHC', '9000000103')`);
  await q(`insert into villages (id, name, name_hi, facility_id) values
    ('saraiya', 'Saraiya', 'सरैया', 'phc-saraiya'),
    ('belwa', 'Belwa', 'बेलवा', 'phc-saraiya'),
    ('haripur', 'Haripur', 'हरिपुर', 'phc-saraiya')`);

  const user = async (phone: string, role: string, name: string, extra: { specialisation?: string; facility?: string; language?: string } = {}) =>
    String(
      (
        await q(
          "insert into users (phone, role, name, language, specialisation, facility_id) values ($1,$2,$3,$4,$5,$6) returning id",
          [phone, role, name, extra.language ?? "hi", extra.specialisation ?? null, extra.facility ?? null],
        )
      )[0].id,
    );

  const asha = await user(demoNumbers.asha, "asha", "Sunita Devi", { facility: "phc-saraiya" });
  for (const v of ["saraiya", "belwa", "haripur"]) await q("insert into asha_villages values ($1, $2)", [asha, v]);
  await user(demoNumbers.neonatologist, "doctor", "Dr. Anil Mehta", { specialisation: "neonatology", facility: "sncu-dh", language: "en" });
  await user(demoNumbers.obstetrician, "doctor", "Dr. Kavya Rao", { specialisation: "obstetrics", facility: "sncu-dh", language: "en" });
  await user(demoNumbers.medicalOfficer, "doctor", "Dr. Rajesh Singh", { specialisation: "general", facility: "phc-saraiya", language: "en" });

  interface Household {
    phone: string;
    mother: string;
    age: number;
    village: string;
    place: "home" | "facility";
    facility: string | null;
    baby: string;
    sex: "female" | "male";
    dayOfLife: number;
    birthWeightG: number;
    gestationWeeks: number;
    status: "green" | "yellow" | "red" | "grey";
    statusReason: string | null;
    band: string | null;
    weights: number[];
    kmcHoursPerDay: number;
    baseSkin: number;
  }

  const households: Household[] = [
    {
      phone: demoNumbers.mother, mother: "Reena Kumari", age: 24, village: "saraiya", place: "facility", facility: "sncu-dh",
      baby: "Reena's baby", sex: "female", dayOfLife: 16, birthWeightG: 2100, gestationWeeks: 35,
      status: "grey", statusReason: "noReading", band: "demo-band", weights: [2060, 2140, 2290], kmcHoursPerDay: 6.5, baseSkin: 36.4,
    },
    {
      phone: "9000000012", mother: "Pooja Devi", age: 21, village: "belwa", place: "facility", facility: "sncu-dh",
      baby: "Pooja's daughter", sex: "female", dayOfLife: 4, birthWeightG: 2600, gestationWeeks: 37,
      status: "yellow", statusReason: "gettingCold", band: "band-0002", weights: [2540], kmcHoursPerDay: 4, baseSkin: 35.6,
    },
    {
      phone: "9000000013", mother: "Salma Khatoon", age: 27, village: "saraiya", place: "home", facility: null,
      baby: "Salma's son", sex: "male", dayOfLife: 15, birthWeightG: 2900, gestationWeeks: 38,
      status: "grey", statusReason: "noReading", band: "band-0003", weights: [2850, 2870, 2880], kmcHoursPerDay: 2, baseSkin: 36.6,
    },
    {
      phone: "9000000014", mother: "Anita Kumari", age: 23, village: "haripur", place: "facility", facility: "sncu-dh",
      baby: "Anita's baby", sex: "male", dayOfLife: 7, birthWeightG: 3000, gestationWeeks: 39,
      status: "green", statusReason: null, band: "band-0004", weights: [2950], kmcHoursPerDay: 9, baseSkin: 36.7,
    },
    {
      phone: "9000000015", mother: "Kavita Devi", age: 30, village: "saraiya", place: "facility", facility: "phc-saraiya",
      baby: "Kavita's daughter", sex: "female", dayOfLife: 14, birthWeightG: 2800, gestationWeeks: 38,
      status: "green", statusReason: null, band: "band-0005", weights: [2760, 2880], kmcHoursPerDay: 8.5, baseSkin: 36.6,
    },
  ];

  const babyIds: Record<string, string> = {};
  for (const h of households) {
    const u = await user(h.phone, "mother", h.mother);
    const today = istDate(now);
    const birthDate = addDays(today, -(h.dayOfLife - 1));
    const bornAt = new Date(Date.parse(`${birthDate}T04:30:00Z`)).toISOString(); // 10:00 IST
    const [m] = await q(
      `insert into mothers (user_id, asha_id, name, age, village_id, delivery_place, delivery_facility_id, delivery_date,
                            language, consent_at, consent_witness_id, family_phone)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'hi',$9,$2,$10) returning id`,
      [u, asha, h.mother, h.age, h.village, h.place, h.facility, birthDate, ts((h.dayOfLife - 2) * DAY), `8${h.phone.slice(1)}`],
    );
    const facility = h.facility ?? "phc-saraiya";
    const [b] = await q(
      `insert into babies (mother_id, name, sex, born_at, birth_weight_g, gestation_weeks, sncu_admitted, facility_id,
                           band_id, status, status_reason, status_since, last_sync_at)
       values ($1,$2,$3,$4,$5,$6,false,$7,$8,$9,$10,$11,$12) returning id`,
      [
        m.id, h.baby, h.sex, bornAt, h.birthWeightG, h.gestationWeeks, facility, h.band, h.status, h.statusReason,
        ts(h.status === "yellow" ? 25 * 60_000 : 3 * HOUR),
        ts(h.statusReason === "noReading" && h.dayOfLife > 10 ? 6 * HOUR : 4 * 60_000),
      ],
    );
    const babyId = String(b.id);
    babyIds[h.mother] = babyId;
    if (h.band) {
      await q("insert into bands (id, serial, baby_id, paired_at, firmware, rules_ver) values ($1,$2,$3,$4,'0.3.0','2026.11-demo')", [
        h.band, h.band.toUpperCase(), babyId, ts((h.dayOfLife - 2) * DAY),
      ]);
    }

    // schedule; past visits done, with weights in order
    const schedule = visitSchedule({ deliveryPlace: h.place, birthDate, sncuAdmitted: false });
    let w = 0;
    for (const v of schedule) {
      const past = v.dueDate < today;
      // Salma's day-14 visit was missed: overdue
      const missed = h.mother === "Salma Khatoon" && v.day === 14;
      if (past && !missed) {
        const weight = h.weights[w++] ?? null;
        await q(
          `insert into visits (baby_id, day, due_date, kind, done_at, asha_id, axillary_temp_c, weight_g, breastfeeding_well,
                               kmc_hours, danger_signs, band_check, outcome)
           values ($1,$2,$3,'scheduled',$4,$5,$6,$7,true,$8,'{}','{"fit":true,"skin":true,"battery":true}','home_care')`,
          [babyId, v.day, v.dueDate, `${v.dueDate}T06:00:00Z`, asha, 36.8, weight, h.kmcHoursPerDay],
        );
      } else {
        await q("insert into visits (baby_id, day, due_date, kind) values ($1,$2,$3,'scheduled')", [babyId, v.day, v.dueDate]);
      }
    }

    // KMC sessions for the last 15 days
    for (let d = 1; d <= Math.min(15, h.dayOfLife - 1); d++) {
      const dayStart = Date.parse(`${addDays(today, -d)}T00:30:00Z`); // 06:00 IST
      const parts = [0.45, 0.35, 0.2];
      let t = dayStart;
      for (const [i, p] of parts.entries()) {
        const len = h.kmcHoursPerDay * p * HOUR;
        await q("insert into kmc_sessions (id, baby_id, holder, started_at, ended_at) values ($1,$2,$3,$4,$5)", [
          `seed-${babyId.slice(0, 8)}-${d}-${i}`, babyId, i === 1 ? "grandmother" : "mother",
          new Date(t).toISOString(), new Date(t + len).toISOString(),
        ]);
        t += len + 3 * HOUR;
      }
    }

    // status strip for today
    await q("insert into status_changes (baby_id, at, status, reason) values ($1,$2,'green',null)", [babyId, ts(10 * HOUR)]);
    if (h.status !== "green") {
      await q("insert into status_changes (baby_id, at, status, reason) values ($1,$2,$3,$4)", [
        babyId, ts(h.status === "yellow" ? 25 * 60_000 : 3 * HOUR), h.status, h.statusReason,
      ]);
    }
  }

  // History: Kavita's daughter had a red episode 5 days ago, closed after a visit
  const kavita = babyIds["Kavita Devi"];
  await q(
    `insert into episodes (id, baby_id, kind, trigger, started_at, family_ack_at, staff_ack_at, staff_ack_by, closed_at, closed_by, close_reason)
     values ('seed-red-kavita', $1, 'red', 'stillCold', $2, $3, $4, $5, $6, $5, 'Visit: baby warm after KMC, feeding well')`,
    [kavita, ts(5 * DAY), ts(5 * DAY - 60_000), ts(5 * DAY - 4 * 60_000), asha, ts(5 * DAY - 90 * 60_000)],
  );
  await q(
    `insert into episodes (id, baby_id, kind, trigger, started_at, closed_at, close_reason)
     values ('seed-yellow-kavita', $1, 'yellow', 'gettingCold', $2, $3, 'warm again')`,
    [kavita, ts(5 * DAY + 70 * 60_000), ts(5 * DAY)],
  );
  // Pooja's daughter is yellow right now
  await q(
    "insert into episodes (id, baby_id, kind, trigger, started_at) values ('seed-yellow-pooja', $1, 'yellow', 'gettingCold', $2)",
    [babyIds["Pooja Devi"], ts(25 * 60_000)],
  );
  // Salma's son was referred to the SNCU after the missed visit; a doctor sees him there
  await q(
    "insert into referrals (client_id, baby_id, facility_id, reason, created_by, created_at) values ('seed-ref-salma', $1, 'sncu-dh', 'Not gaining weight, poor feeding', $2, $3)",
    [babyIds["Salma Khatoon"], asha, ts(2 * DAY)],
  );
  // Advice from the neonatologist to Reena
  const [mehta] = await q("select id from users where phone = $1", [demoNumbers.neonatologist]);
  await q(
    `insert into advice_notes (baby_id, doctor_id, kind, template, body, created_at)
     values ($1, $2, 'family', 'kmc8h', 'Keep doing KMC, at least 8 hours a day', $3),
            ($1, $2, 'clinical', null, 'Late preterm, 2.1 kg. Weight gain adequate. Review on day 21.', $3)`,
    [babyIds["Reena Kumari"], mehta.id, ts(2 * DAY)],
  );
  await q("insert into danger_checks (id, baby_id, by_user, at, answers, any_yes) select 'seed-dc-' || b.id, b.id, m.user_id, $1, '{\"poorFeeding\":false,\"limp\":false,\"breathing\":false,\"fits\":false,\"yellowSkin\":false}', false from babies b join mothers m on m.id = b.mother_id", [
    ts(16 * HOUR),
  ]);

  // 15 days of band readings, shaped by the episodes above (demo-history.ts)
  await topUpDemoHistory(db, now);
}
