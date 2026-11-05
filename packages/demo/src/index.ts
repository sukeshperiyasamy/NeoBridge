import { BandStatus } from "@neobridge/ble-protocol";
import type { Text } from "@neobridge/i18n";

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
  name: Text;
  /** Who this person is, shown on the login page and dashboard header */
  label: Text;
}

export const demoAccounts: readonly DemoAccount[] = [
  {
    role: "mother",
    id: "mother.demo",
    password: "Mother@123",
    name: { en: "Reena", hi: "रीना" },
    label: { en: "Mother / family", hi: "माँ / परिवार" },
  },
  {
    role: "asha",
    id: "asha.demo",
    password: "Asha@123",
    name: { en: "Sunita", hi: "सुनीता" },
    label: { en: "ASHA worker", hi: "आशा दीदी" },
  },
  {
    role: "doctor",
    id: "doctor.demo",
    password: "Doctor@123",
    name: { en: "Dr. Mehta", hi: "डॉ. मेहता" },
    label: { en: "Doctor", hi: "डॉक्टर" },
  },
];

export function demoSignIn(id: string, password: string): DemoAccount | null {
  const account = demoAccounts.find((a) => a.id === id.trim().toLowerCase());
  return account && account.password === password ? account : null;
}

export function homePath(role: Role): `/${Role}` {
  return `/${role}`;
}

/** The mother's ASHA, named on the call buttons. */
export const demoAshaName: Text = { en: "Sunita", hi: "सुनीता" };

/**
 * Numbers the call buttons dial. The ASHA's and the facility's are placeholders:
 * the real ones are entered when the ASHA sets the family up. 102 is the free
 * government ambulance for mothers and newborns (JSSK).
 */
export const demoPhone = {
  asha: "+910000000000",
  transport: "102",
  facility: "+910000000001",
  /** each family's number, used by the ASHA's call buttons */
  family: "+910000000002",
} as const;

/** `tel:` link that opens the phone's dialer with the number filled in. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// ---- sample data from the Figma mock-ups -----------------------------------

export interface DemoBaby {
  id: string;
  name: Text;
  village: Text;
  dayOfLife: number;
  birthWeightKg: number;
  status: BandStatus;
  /** What the ASHA sees in her list */
  note: Text;
  lastSync: Text;
}

export const demoBabies: readonly DemoBaby[] = [
  {
    id: "reena-baby",
    name: { en: "Reena's baby", hi: "रीना का बच्चा" },
    village: { en: "Saraiya", hi: "सरैया" },
    dayOfLife: 9,
    birthWeightKg: 2.1,
    status: BandStatus.Red,
    note: {
      en: "Still cold at re-check · since 03:10 · family called you",
      hi: "दोबारा जाँच में भी ठंडा · 03:10 से · परिवार ने आपको फ़ोन किया",
    },
    lastSync: { en: "2 min ago", hi: "2 मि. पहले" },
  },
  {
    id: "pooja-daughter",
    name: { en: "Pooja's daughter", hi: "पूजा की बेटी" },
    village: { en: "Belwa", hi: "बेलवा" },
    dayOfLife: 4,
    birthWeightKg: 2.6,
    status: BandStatus.Yellow,
    note: {
      en: "Cold · family warming, re-check due 06:20",
      hi: "ठंड · घर पर गर्म कर रहे हैं · दोबारा जाँच 06:20",
    },
    lastSync: { en: "6 min ago", hi: "6 मि. पहले" },
  },
  {
    id: "salma-son",
    name: { en: "Salma's son", hi: "सलमा का बेटा" },
    village: { en: "Saraiya", hi: "सरैया" },
    dayOfLife: 15,
    birthWeightKg: 2.9,
    status: BandStatus.Grey,
    note: { en: "No data from the band for 6 hours", hi: "6 घंटे से बैंड से कुछ नहीं" },
    lastSync: { en: "6 h ago", hi: "6 घं. पहले" },
  },
  {
    id: "anita-baby",
    name: { en: "Anita's baby", hi: "अनीता का बच्चा" },
    village: { en: "Haripur", hi: "हरिपुर" },
    dayOfLife: 7,
    birthWeightKg: 3.0,
    status: BandStatus.Green,
    note: {
      en: "Day-7 visit today · band: no problem found",
      hi: "आज दिन 7 की मुलाक़ात · बैंड: कोई परेशानी नहीं",
    },
    lastSync: { en: "4 min ago", hi: "4 मि. पहले" },
  },
  {
    id: "kavita-daughter",
    name: { en: "Kavita's daughter", hi: "कविता की बेटी" },
    village: { en: "Saraiya", hi: "सरैया" },
    dayOfLife: 14,
    birthWeightKg: 2.8,
    status: BandStatus.Green,
    note: {
      en: "Day-14 visit today · band: no problem found",
      hi: "आज दिन 14 की मुलाक़ात · बैंड: कोई परेशानी नहीं",
    },
    lastSync: { en: "3 min ago", hi: "3 मि. पहले" },
  },
];

/** The baby the demo mother is logged in for. */
export const demoMotherBabyId = "reena-baby";

export interface DemoAlert {
  id: string;
  time: Text;
  status: BandStatus;
  text: Text;
}

export interface DemoStat {
  label: Text;
  value: Text;
  note: Text;
}

/** Clinician summary for Reena's baby (Figma: Doctor · summary and trends). */
export const demoClinicianSummary = {
  babyId: "reena-baby",
  title: { en: "Baby of Reena", hi: "रीना का बच्चा" } as Text,
  details: {
    en: "Girl · day 9 of life (born 16 Oct 2026) · birth weight 2.1 kg, low birth weight · ASHA: Sunita, Saraiya",
    hi: "बेटी · जीवन का दिन 9 (जन्म 16 अक्टू 2026) · जन्म वज़न 2.1 kg, कम जन्म वज़न · आशा: सुनीता, सरैया",
  } as Text,
  banner: {
    en: "Red since 03:10 · still cold at the 1-hour re-check",
    hi: "03:10 से लाल · 1 घंटे की दोबारा जाँच में भी ठंडा",
  } as Text,
  bannerDetail: {
    en: "ASHA axillary 35.4 °C at 03:40 · referred by 102 at 04:20",
    hi: "आशा का बगल तापमान 03:40 पर 35.4 °C · 04:20 पर 102 से रेफ़र",
  } as Text,
  stats: [
    {
      label: { en: "Good skin contact, 7 days", hi: "त्वचा से अच्छा संपर्क, 7 दिन" },
      value: { en: "95%" },
      note: {
        en: "Gaps: daily bath (~40 min) and two loose-band periods",
        hi: "अंतराल: रोज़ का स्नान (~40 मि.) और दो बार ढीला बैंड",
      },
    },
    {
      label: { en: "Usable heart-rate signal", hi: "काम लायक दिल की धड़कन सिग्नल" },
      value: { en: "75%" },
      note: {
        en: "Trend only; never used for family alerts in v1",
        hi: "सिर्फ़ रुझान; v1 में परिवार के अलर्ट के लिए कभी इस्तेमाल नहीं",
      },
    },
    {
      label: { en: "Alerts, 7 days", hi: "अलर्ट, 7 दिन" },
      value: { en: "3 yellow · 1 red", hi: "3 पीला · 1 लाल" },
      note: {
        en: "2 yellow cleared at re-check; red confirmed by ASHA thermometer",
        hi: "2 पीले दोबारा जाँच में ठीक हुए; लाल की पुष्टि आशा के थर्मामीटर से हुई",
      },
    },
    {
      label: { en: "Family danger-sign check", hi: "परिवार की ख़तरे के संकेत की जाँच" },
      value: { en: "7 of 7 days", hi: "7 में से 7 दिन" },
      note: { en: "No sign reported", hi: "कोई संकेत नहीं बताया गया" },
    },
  ] satisfies DemoStat[],
  alerts: [
    {
      id: "a6",
      time: { en: "24 Oct 04:20", hi: "24 अक्टू 04:20" },
      status: BandStatus.Red,
      text: { en: "Referred; 102 transport to SNCU", hi: "रेफ़र किया; SNCU तक 102 गाड़ी" },
    },
    {
      id: "a5",
      time: { en: "24 Oct 03:40", hi: "24 अक्टू 03:40" },
      status: BandStatus.Red,
      text: {
        en: "ASHA visit: axillary 35.4 °C; no danger sign on her check",
        hi: "आशा की मुलाक़ात: बगल 35.4 °C; उनकी जाँच में कोई ख़तरे का संकेत नहीं",
      },
    },
    {
      id: "a4",
      time: { en: "24 Oct 03:10", hi: "24 अक्टू 03:10" },
      status: BandStatus.Red,
      text: {
        en: "Red: still cold at the 1-hour re-check; push and SMS to the ASHA",
        hi: "लाल: 1 घंटे की दोबारा जाँच में भी ठंडा; आशा को पुश और SMS",
      },
    },
    {
      id: "a3",
      time: { en: "24 Oct 02:10", hi: "24 अक्टू 02:10" },
      status: BandStatus.Yellow,
      text: {
        en: "Yellow: sustained cold with good contact; warming steps given",
        hi: "पीला: अच्छे संपर्क के साथ लगातार ठंड; गर्म करने के कदम बताए",
      },
    },
    {
      id: "a2",
      time: { en: "21 Oct 23:40", hi: "21 अक्टू 23:40" },
      status: BandStatus.Yellow,
      text: { en: "Yellow: cold; green at re-check 00:40", hi: "पीला: ठंड; 00:40 की दोबारा जाँच में हरा" },
    },
    {
      id: "a1",
      time: { en: "19 Oct 02:00", hi: "19 अक्टू 02:00" },
      status: BandStatus.Yellow,
      text: { en: "Yellow: cold; green at re-check 03:00", hi: "पीला: ठंड; 03:00 की दोबारा जाँच में हरा" },
    },
  ] satisfies DemoAlert[],
};

// ---- phone-OTP demo logins (the API's seed data, apps/api/src/seed.ts) --------

export interface DemoLogin {
  phone: string;
  name: Text;
  role: Text;
}

/** Shown on the app's login screen so anyone can try each dashboard. */
export const demoLogins: readonly DemoLogin[] = [
  { phone: "9000000011", name: { en: "Reena Kumari", hi: "रीना कुमारी" }, role: { en: "Mother", hi: "माँ" } },
  { phone: "9000000001", name: { en: "Sunita Devi", hi: "सुनीता देवी" }, role: { en: "ASHA", hi: "आशा" } },
  { phone: "9000000002", name: { en: "Dr. Anil Mehta", hi: "डॉ. अनिल मेहता" }, role: { en: "Neonatologist", hi: "नवजात विशेषज्ञ" } },
  { phone: "9000000003", name: { en: "Dr. Kavya Rao", hi: "डॉ. काव्या राव" }, role: { en: "Obstetrician", hi: "प्रसूति विशेषज्ञ" } },
  { phone: "9000000004", name: { en: "Dr. Rajesh Singh", hi: "डॉ. राजेश सिंह" }, role: { en: "Medical officer", hi: "चिकित्सा अधिकारी" } },
];

/** Free government ambulance for mothers and newborns (JSSK). */
export const AMBULANCE = "102";

// ---- user ID + password demo logins (app and API) ------------------------------

/**
 * DEMO ONLY, until the full integration is done: user ID + password logins
 * for the seeded accounts. The API accepts them only while DEMO_LOGIN is not
 * "0"; each maps to a seeded phone number, so the session is the same as OTP.
 */
export interface DemoPasswordLogin {
  id: string;
  password: string;
  phone: string;
  name: Text;
  role: Text;
}

export const demoPasswordLogins: readonly DemoPasswordLogin[] = [
  { id: "mother.demo", password: "Mother@123", phone: "9000000011", name: { en: "Reena Kumari", hi: "रीना कुमारी" }, role: { en: "Mother", hi: "माँ" } },
  { id: "asha.demo", password: "Asha@123", phone: "9000000001", name: { en: "Sunita Devi", hi: "सुनीता देवी" }, role: { en: "ASHA", hi: "आशा" } },
  { id: "doctor.demo", password: "Doctor@123", phone: "9000000002", name: { en: "Dr. Anil Mehta", hi: "डॉ. अनिल मेहता" }, role: { en: "Neonatologist", hi: "नवजात विशेषज्ञ" } },
  { id: "obstetrician.demo", password: "Obs@123", phone: "9000000003", name: { en: "Dr. Kavya Rao", hi: "डॉ. काव्या राव" }, role: { en: "Obstetrician", hi: "प्रसूति विशेषज्ञ" } },
  { id: "mo.demo", password: "Mo@123", phone: "9000000004", name: { en: "Dr. Rajesh Singh", hi: "डॉ. राजेश सिंह" }, role: { en: "Medical officer", hi: "चिकित्सा अधिकारी" } },
];

/** The seeded phone for a demo user ID + password, or null. */
export function demoPasswordPhone(id: string, password: string): string | null {
  const login = demoPasswordLogins.find((l) => l.id === id.trim().toLowerCase());
  return login && login.password === password ? login.phone : null;
}
