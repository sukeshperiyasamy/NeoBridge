/**
 * Every caregiver string is shown in the chosen language with English beneath,
 * and is also spoken aloud. `audio` keys point at pre-recorded clips bundled
 * with the app so speech works offline.
 */

export const languages = [
  { code: "hi", name: "हिन्दी", english: "Hindi" },
  { code: "bn", name: "বাংলা", english: "Bengali" },
  { code: "mr", name: "मराठी", english: "Marathi" },
  { code: "te", name: "తెలుగు", english: "Telugu" },
  { code: "ta", name: "தமிழ்", english: "Tamil" },
  { code: "gu", name: "ગુજરાતી", english: "Gujarati" },
  { code: "kn", name: "ಕನ್ನಡ", english: "Kannada" },
  { code: "or", name: "ଓଡ଼ିଆ", english: "Odia" },
] as const;

export type LanguageCode = (typeof languages)[number]["code"];

export interface Phrase {
  text: string;
  /** clip id, e.g. "status.green.title" → assets/audio/<lang>/status.green.title.mp3 */
  audio: string;
}

type Strings = Record<string, string>;

const en: Strings = {
  "status.green.title": "The band sees no problem",
  "status.green.action": "Keep baby close and feed often",
  "status.yellow.title": "Baby is getting cold",
  "status.yellow.recheck": "I will check again in one hour",
  "status.red.title": "Baby needs help now",
  "status.red.fallback": "No answer? Call 102, free transport",
  "status.grey.title": "The band cannot read",
  "status.grey.action": "Fit it gently or charge it",
  "band.linked": "Band linked · checked just now",
  "call.asha": "Call {nameEn}, your ASHA",
  "nav.home": "Home",
  "nav.call": "Call",
  "nav.band": "Band",
  "listen": "Listen",
};

// Hindi copy from the Figma file. Other languages are still to be translated.
const hi: Strings = {
  "status.green.title": "कोई परेशानी नहीं दिखी",
  "status.green.action": "बच्चे को पास रखें, बार-बार दूध पिलाएँ",
  "status.yellow.title": "बच्चे को ठंड लग रही है",
  "status.yellow.recheck": "एक घंटे में फिर देखेंगे",
  "status.red.title": "बच्चे को अभी मदद चाहिए",
  "status.red.fallback": "जवाब न मिले तो 102 · मुफ़्त गाड़ी",
  "status.grey.title": "बैंड पढ़ नहीं पा रहा",
  "status.grey.action": "धीरे से ठीक पहनाएँ या चार्ज करें",
  "band.linked": "बैंड जुड़ा है · अभी देखा",
  "call.asha": "{name} दीदी को फ़ोन",
  "nav.home": "घर",
  "nav.call": "फ़ोन",
  "nav.band": "बैंड",
  "listen": "सुनें",
};

const catalogs: Partial<Record<LanguageCode, Strings>> = { hi };

function fill(template: string, vars?: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars?.[k] ?? `{${k}}`);
}

/** Returns the local-language line, its English gloss, and the audio clip id. */
export function t(
  lang: LanguageCode,
  key: keyof typeof en,
  vars?: Record<string, string>,
): { local: Phrase; english: string } {
  const local = catalogs[lang]?.[key] ?? en[key];
  return {
    local: { text: fill(local, vars), audio: key },
    english: fill(en[key], vars),
  };
}
