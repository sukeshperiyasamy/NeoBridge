import { BandStatus } from "@neobridge/ble-protocol";

/**
 * DEMO ONLY. These logins are printed on the login page on purpose so anyone
 * can try the three dashboards. There is no real authentication yet: replace
 * this with phone-OTP auth on the API before any real family data goes in.
 */

export type Role = "mother" | "asha" | "doctor";

export interface DemoAccount {
  role: Role;
  id: string;
  password: string;
  name: string;
  /** Who this person is, shown on the login page */
  label: string;
  labelLocal: string;
}

export const demoAccounts: readonly DemoAccount[] = [
  {
    role: "mother",
    id: "mother.demo",
    password: "Mother@123",
    name: "Reena",
    label: "Mother / family",
    labelLocal: "माँ / परिवार",
  },
  {
    role: "asha",
    id: "asha.demo",
    password: "Asha@123",
    name: "Sunita",
    label: "ASHA worker",
    labelLocal: "आशा दीदी",
  },
  {
    role: "doctor",
    id: "doctor.demo",
    password: "Doctor@123",
    name: "Dr. Mehta",
    label: "Doctor",
    labelLocal: "डॉक्टर",
  },
];

export function demoSignIn(id: string, password: string): DemoAccount | null {
  const account = demoAccounts.find((a) => a.id === id.trim().toLowerCase());
  return account && account.password === password ? account : null;
}

export function homePath(role: Role): `/${Role}` {
  return `/${role}`;
}

// ---- sample data from the Figma mock-ups -----------------------------------

export interface DemoBaby {
  id: string;
  name: string;
  nameLocal: string;
  village: string;
  dayOfLife: number;
  birthWeightKg: number;
  status: BandStatus;
  /** What the ASHA sees in her list */
  note: string;
  lastSync: string;
}

export const demoBabies: readonly DemoBaby[] = [
  {
    id: "reena-baby",
    name: "Reena's baby",
    nameLocal: "रीना का बच्चा",
    village: "Saraiya",
    dayOfLife: 9,
    birthWeightKg: 2.1,
    status: BandStatus.Red,
    note: "Still cold at re-check · since 03:10 · family called you",
    lastSync: "2 min ago",
  },
  {
    id: "pooja-daughter",
    name: "Pooja's daughter",
    nameLocal: "पूजा की बेटी",
    village: "Belwa",
    dayOfLife: 4,
    birthWeightKg: 2.6,
    status: BandStatus.Yellow,
    note: "Cold · family warming, re-check due 06:20",
    lastSync: "6 min ago",
  },
  {
    id: "salma-son",
    name: "Salma's son",
    nameLocal: "सलमा का बेटा",
    village: "Saraiya",
    dayOfLife: 15,
    birthWeightKg: 2.9,
    status: BandStatus.Grey,
    note: "No data from the band for 6 hours",
    lastSync: "6 h ago",
  },
  {
    id: "anita-baby",
    name: "Anita's baby",
    nameLocal: "अनीता का बच्चा",
    village: "Haripur",
    dayOfLife: 7,
    birthWeightKg: 3.0,
    status: BandStatus.Green,
    note: "Day-7 visit today · band: no problem found",
    lastSync: "4 min ago",
  },
  {
    id: "kavita-daughter",
    name: "Kavita's daughter",
    nameLocal: "कविता की बेटी",
    village: "Saraiya",
    dayOfLife: 14,
    birthWeightKg: 2.8,
    status: BandStatus.Green,
    note: "Day-14 visit today · band: no problem found",
    lastSync: "3 min ago",
  },
];

/** The baby the demo mother is logged in for. */
export const demoMotherBabyId = "reena-baby";

export interface DemoAlert {
  time: string;
  status: BandStatus;
  text: string;
}

/** Clinician summary for Reena's baby (Figma: Doctor · summary and trends). */
export const demoClinicianSummary = {
  babyId: "reena-baby",
  title: "Baby of Reena",
  details:
    "Girl · day 9 of life (born 16 Oct 2026) · birth weight 2.1 kg, low birth weight · ASHA: Sunita, Saraiya",
  banner: "Red since 03:10 · still cold at the 1-hour re-check",
  bannerDetail: "ASHA axillary 35.4 °C at 03:40 · referred by 102 at 04:20",
  stats: [
    { label: "Good skin contact, 7 days", value: "95%", note: "Gaps: daily bath (~40 min) and two loose-band periods" },
    { label: "Usable heart-rate signal", value: "75%", note: "Trend only; never used for family alerts in v1" },
    { label: "Alerts, 7 days", value: "3 yellow · 1 red", note: "2 yellow cleared at re-check; red confirmed by ASHA thermometer" },
    { label: "Family danger-sign check", value: "7 of 7 days", note: "No sign reported" },
  ],
  alerts: [
    { time: "24 Oct 04:20", status: BandStatus.Red, text: "Referred; 102 transport to SNCU" },
    { time: "24 Oct 03:40", status: BandStatus.Red, text: "ASHA visit: axillary 35.4 °C; no danger sign on her check" },
    { time: "24 Oct 03:10", status: BandStatus.Red, text: "Red: still cold at the 1-hour re-check; push and SMS to the ASHA" },
    { time: "24 Oct 02:10", status: BandStatus.Yellow, text: "Yellow: sustained cold with good contact; warming steps given" },
    { time: "21 Oct 23:40", status: BandStatus.Yellow, text: "Yellow: cold; green at re-check 00:40" },
    { time: "19 Oct 02:00", status: BandStatus.Yellow, text: "Yellow: cold; green at re-check 03:00" },
  ] satisfies DemoAlert[],
};
