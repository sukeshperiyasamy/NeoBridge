/**
 * UI strings. The app switches between English and Hindi. In Hindi, every line
 * is shown with its English gloss beneath (as in the Figma screens); in English
 * the gloss is dropped. The other Indian languages are listed for later.
 */

export const languages = [
  { code: "en", name: "English", english: "English" },
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

/** Languages offered by the switch, in order. */
export const uiLanguages = ["en", "hi"] as const satisfies readonly LanguageCode[];
export type UiLanguage = (typeof uiLanguages)[number];
export const defaultLanguage: UiLanguage = "hi";

/** A piece of text in several languages. English is always present. */
export type Text = { en: string } & Partial<Record<LanguageCode, string>>;

const en = {
  "status.green.title": "The band sees no problem",
  "status.green.action": "Keep baby close and feed often",
  "status.yellow.title": "Baby is getting cold",
  "status.yellow.recheck": "I will check again in one hour",
  "status.red.title": "Baby needs help now",
  "status.red.fallback": "No answer? Call 102, free transport",
  "status.red.skinToSkin": "Meanwhile, keep baby skin to skin",
  "status.grey.title": "The band cannot read",
  "status.grey.action": "Fit it gently or charge it",
  "status.label.green": "No problem",
  "status.label.yellow": "Warm and check",
  "status.label.red": "Help now",
  "status.label.grey": "No reading",
  "band.linked": "Band linked · checked just now",
  "band.linkedAgo": "Band linked · checked {ago}",
  "call.asha": "Call {name}, your ASHA",
  "nav.home": "Home",
  "nav.call": "Call",
  "nav.band": "Band",
  "listen": "Listen",
  "language": "Language",
  "logout": "Log out",
  "call.title": "Call",
  "call.sub": "Who to call",
  "call.button": "Call",
  "call.family": "Call family",
  "call.noInternet": "Calls work without internet",
  "call.ashaRole": "Your ASHA · {village}",
  "call.transport.title": "102 · free transport",
  "call.transport.sub": "Free transport for a sick newborn (JSSK)",
  "call.facility.title": "Nearest hospital",
  "call.facility.sub": "Added at setup",
  "band.title": "Band",
  "band.sub": "Band: wear, charge, check",
  "login.title": "Log in",
  "login.sub": "Log in to NeoBridge",
  "login.id": "User ID",
  "login.password": "Password",
  "login.submit": "Log in",
  "login.error": "Wrong ID or password",
  "login.demoTitle": "Demo logins",
  "login.demoSub": "Three people, three dashboards. Sample accounts for trying the app.",
  "login.fill": "Fill in",
  "landing.title": "Keep every newborn warm and safe",
  "landing.lead":
    "The NeoBridge band watches a baby's warmth at home and tells the family, their ASHA and the doctor what to do next.",
  "asha.title": "My babies",
  "asha.sub": "Red first · synced {ago}",
  "day": "Day {n}",
  "doctor.alerts": "Alerts and actions",
  "doctor.disclaimer":
    "This summary supports clinical judgement; it does not diagnose. Wrist skin temperature is not core temperature. All values are sample data.",
};

export type Key = keyof typeof en;

const hi: Record<Key, string> = {
  "status.green.title": "कोई परेशानी नहीं दिखी",
  "status.green.action": "बच्चे को पास रखें, बार-बार दूध पिलाएँ",
  "status.yellow.title": "बच्चे को ठंड लग रही है",
  "status.yellow.recheck": "एक घंटे में फिर देखेंगे",
  "status.red.title": "बच्चे को अभी मदद चाहिए",
  "status.red.fallback": "जवाब न मिले तो 102 · मुफ़्त गाड़ी",
  "status.red.skinToSkin": "तब तक बच्चे को सीने से चिपकाए रखें",
  "status.grey.title": "बैंड पढ़ नहीं पा रहा",
  "status.grey.action": "धीरे से ठीक पहनाएँ या चार्ज करें",
  "status.label.green": "ठीक",
  "status.label.yellow": "ठंड/गर्मी",
  "status.label.red": "मदद",
  "status.label.grey": "नहीं पढ़ा",
  "band.linked": "बैंड जुड़ा है · अभी देखा",
  "band.linkedAgo": "बैंड जुड़ा है · {ago} देखा",
  "call.asha": "{name} दीदी को फ़ोन",
  "nav.home": "घर",
  "nav.call": "फ़ोन",
  "nav.band": "बैंड",
  "listen": "सुनें",
  "language": "भाषा",
  "logout": "लॉग आउट",
  "call.title": "फ़ोन",
  "call.sub": "किसे फ़ोन करें",
  "call.button": "फ़ोन करें",
  "call.family": "परिवार को फ़ोन",
  "call.noInternet": "बिना इंटरनेट के भी फ़ोन लगेगा",
  "call.ashaRole": "आपकी आशा · {village}",
  "call.transport.title": "102 · मुफ़्त गाड़ी",
  "call.transport.sub": "बीमार नवजात का आना-जाना मुफ़्त",
  "call.facility.title": "नज़दीकी अस्पताल",
  "call.facility.sub": "सेटअप में जोड़ा गया",
  "band.title": "बैंड",
  "band.sub": "बैंड: पहनाना, चार्ज, जाँच",
  "login.title": "लॉग इन करें",
  "login.sub": "NeoBridge में लॉग इन करें",
  "login.id": "यूज़र ID",
  "login.password": "पासवर्ड",
  "login.submit": "लॉग इन",
  "login.error": "ID या पासवर्ड गलत है",
  "login.demoTitle": "डेमो लॉग इन",
  "login.demoSub": "तीन लोग, तीन डैशबोर्ड। ऐप आज़माने के लिए नमूना खाते।",
  "login.fill": "भरें",
  "landing.title": "हर नवजात को गर्म और सुरक्षित रखें",
  "landing.lead":
    "NeoBridge बैंड घर पर बच्चे की गर्माहट पर नज़र रखता है और परिवार, आशा दीदी और डॉक्टर को बताता है कि आगे क्या करना है।",
  "asha.title": "मेरे शिशु",
  "asha.sub": "लाल पहले · {ago} सिंक",
  "day": "दिन {n}",
  "doctor.alerts": "अलर्ट और जो किया गया",
  "doctor.disclaimer":
    "यह सारांश डॉक्टर के निर्णय में मदद करता है; यह निदान नहीं करता। कलाई की त्वचा का तापमान शरीर का अंदरूनी तापमान नहीं है। सभी मान नमूना डेटा हैं।",
};

const catalogs: Partial<Record<LanguageCode, Record<Key, string>>> = { en, hi };

type Vars = Record<string, string | number | Text>;

/** Text in `lang`, falling back to English. */
export function pick(lang: LanguageCode, text: Text): string {
  return text[lang] ?? text.en;
}

function fill(lang: LanguageCode, template: string, vars?: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars?.[k];
    if (v === undefined) return `{${k}}`;
    return typeof v === "object" ? pick(lang, v) : String(v);
  });
}

/** A UI string in `lang`. Text-valued vars are resolved in the same language. */
export function t(lang: LanguageCode, key: Key, vars?: Vars): string {
  return fill(lang, catalogs[lang]?.[key] ?? en[key], vars);
}

/** A line plus its English gloss (null when the line is already English). */
export interface Bilingual {
  text: string;
  gloss: string | null;
}

export function bi(lang: LanguageCode, key: Key, vars?: Vars): Bilingual {
  return { text: t(lang, key, vars), gloss: lang === "en" ? null : t("en", key, vars) };
}

export function biText(lang: LanguageCode, text: Text): Bilingual {
  return { text: pick(lang, text), gloss: lang === "en" ? null : text.en };
}
