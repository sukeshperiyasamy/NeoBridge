/**
 * UI strings. The app switches between English and Hindi. In Hindi, every line
 * is shown with its English gloss beneath (as in the Figma screens); in English
 * the gloss is dropped. The other Indian languages are listed for later.
 */

import { appEn, appHi } from "./app";

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

const baseEn = {
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
  "band.state.unpaired": "No band paired",
  "band.state.scanning": "Looking for the band…",
  "band.state.connecting": "Connecting…",
  "band.state.connected": "Band connected",
  "band.state.reconnecting": "Band out of reach · trying again",
  "band.homeUnpaired": "No band paired · tap to pair",
  "band.pair": "Pair a band",
  "band.pairHint": "Switch the band on and hold it near the phone",
  "band.found": "Bands nearby",
  "band.noneFound": "No band found. Is it charged and close by?",
  "band.scanAgain": "Search again",
  "band.tapToPair": "Tap to pair",
  "band.systemPrompt": "If the phone asks to pair, tap Pair",
  "band.keepPaired": "The phone reconnects by itself whenever the band is near",
  "band.battery": "Battery",
  "band.batteryOk": "Battery fine",
  "band.batteryLow": "Battery low · charge soon",
  "band.batteryUnknown": "Battery not read yet",
  "band.forget": "Forget and re-pair",
  "band.forgetConfirm": "Remove this band from the phone?",
  "band.remove": "Remove",
  "band.useDemo": "Use the demo band",
  "band.useDemoHint": "No band nearby? A pretend band shows how the app works",
  "band.testBuzz": "Test buzz",
  "band.testBuzzDone": "The band buzzed once",
  "demo.title": "Demo controls",
  "demo.mode": "Demo timings: 2 min becomes 10 s",
  "demo.scenario": "What the demo band shows",
  "demo.scenario.normal": "Warm",
  "demo.scenario.cooling": "Getting cold",
  "demo.scenario.veryCold": "Very cold",
  "demo.scenario.hot": "Too warm",
  "demo.scenario.offBody": "Band off the baby",
  "demo.scenario.lowBattery": "Battery very low",
  "cancel": "Cancel",
  "sync.title": "Data",
  "sync.online": "Internet on",
  "sync.offline": "No internet · saving on the phone",
  "sync.server": "Server not reachable · will try again",
  "sync.allUploaded": "All readings uploaded",
  "sync.waiting": "{n} readings saved on the phone, waiting to upload",
  "sync.uploading": "Uploading…",
  "sync.lastUpload": "Last upload {ago}",
  "sync.never": "Not uploaded yet",
  "sync.uploadNow": "Upload now",
  "ago.now": "just now",
  "ago.min": "{n} min ago",
  "ago.hour": "{n} h ago",
  "ago.day": "{n} days ago",
  "fix.title": "Fix the band",
  "fix.run": "Check again",
  "fix.checking": "Checking…",
  "fix.allGood": "All checks passed",
  "fix.notChecked": "Not checked",
  "fix.bluetooth": "Bluetooth is on",
  "fix.bluetooth.fix": "Turn on Bluetooth in the phone settings",
  "fix.permission": "App may use Bluetooth",
  "fix.permission.fix": "Allow “Nearby devices” for NeoBridge in settings",
  "fix.nearby": "Band is nearby",
  "fix.nearby.fix": "Bring the phone within 2 metres of the band",
  "fix.connect": "Band connects",
  "fix.connect.fix": "Switch the band off and on, then check again",
  "fix.battery": "Battery is fine",
  "fix.battery.fix": "Charge the band — never while it is on the baby",
  "fix.contact": "Band touches the skin",
  "fix.contact.fix": "Fit it so one finger fits under the strap",
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

const en = { ...baseEn, ...appEn };

export type Key = keyof typeof en;

const baseHi: Record<keyof typeof baseEn, string> = {
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
  "band.state.unpaired": "कोई बैंड नहीं जुड़ा",
  "band.state.scanning": "बैंड ढूँढ रहे हैं…",
  "band.state.connecting": "जुड़ रहा है…",
  "band.state.connected": "बैंड जुड़ा है",
  "band.state.reconnecting": "बैंड दूर है · फिर से जोड़ रहे हैं",
  "band.homeUnpaired": "कोई बैंड नहीं जुड़ा · जोड़ने के लिए छुएँ",
  "band.pair": "बैंड जोड़ें",
  "band.pairHint": "बैंड चालू करें और फ़ोन के पास रखें",
  "band.found": "पास के बैंड",
  "band.noneFound": "कोई बैंड नहीं मिला। क्या वह चार्ज है और पास में है?",
  "band.scanAgain": "फिर से ढूँढें",
  "band.tapToPair": "जोड़ने के लिए छुएँ",
  "band.systemPrompt": "फ़ोन पूछे तो “Pair” दबाएँ",
  "band.keepPaired": "बैंड पास आने पर फ़ोन अपने आप जुड़ जाएगा",
  "band.battery": "बैटरी",
  "band.batteryOk": "बैटरी ठीक है",
  "band.batteryLow": "बैटरी कम है · जल्दी चार्ज करें",
  "band.batteryUnknown": "बैटरी अभी पढ़ी नहीं",
  "band.forget": "बैंड हटाकर फिर जोड़ें",
  "band.forgetConfirm": "इस बैंड को फ़ोन से हटाएँ?",
  "band.remove": "हटाएँ",
  "band.useDemo": "डेमो बैंड चलाएँ",
  "band.useDemoHint": "पास में बैंड नहीं? नकली बैंड से ऐप देखें",
  "band.testBuzz": "बैंड बजाकर देखें",
  "band.testBuzzDone": "बैंड एक बार बजा",
  "demo.title": "डेमो नियंत्रण",
  "demo.mode": "डेमो समय: 2 मिनट की जगह 10 सेकंड",
  "demo.scenario": "डेमो बैंड क्या दिखाए",
  "demo.scenario.normal": "गरम",
  "demo.scenario.cooling": "ठंडा हो रहा है",
  "demo.scenario.veryCold": "बहुत ठंडा",
  "demo.scenario.hot": "बहुत गरम",
  "demo.scenario.offBody": "बैंड बच्चे पर नहीं",
  "demo.scenario.lowBattery": "बैटरी बहुत कम",
  "cancel": "रद्द करें",
  "sync.title": "डेटा",
  "sync.online": "इंटरनेट चालू",
  "sync.offline": "इंटरनेट नहीं · फ़ोन में सहेज रहे हैं",
  "sync.server": "सर्वर नहीं मिला · फिर कोशिश करेंगे",
  "sync.allUploaded": "सारी जानकारी भेज दी गई",
  "sync.waiting": "{n} जानकारी फ़ोन में सहेजी है, भेजनी बाकी",
  "sync.uploading": "भेज रहे हैं…",
  "sync.lastUpload": "आख़िरी बार {ago} भेजा",
  "sync.never": "अभी तक नहीं भेजा",
  "sync.uploadNow": "अभी भेजें",
  "ago.now": "अभी",
  "ago.min": "{n} मि. पहले",
  "ago.hour": "{n} घं. पहले",
  "ago.day": "{n} दिन पहले",
  "fix.title": "बैंड ठीक करें",
  "fix.run": "फिर से जाँचें",
  "fix.checking": "जाँच रहे हैं…",
  "fix.allGood": "सब ठीक है",
  "fix.notChecked": "जाँचा नहीं",
  "fix.bluetooth": "ब्लूटूथ चालू है",
  "fix.bluetooth.fix": "फ़ोन की सेटिंग में ब्लूटूथ चालू करें",
  "fix.permission": "ऐप ब्लूटूथ इस्तेमाल कर सकता है",
  "fix.permission.fix": "सेटिंग में NeoBridge को “आस-पास के डिवाइस” की अनुमति दें",
  "fix.nearby": "बैंड पास में है",
  "fix.nearby.fix": "फ़ोन को बैंड के 2 मीटर के अंदर लाएँ",
  "fix.connect": "बैंड जुड़ता है",
  "fix.connect.fix": "बैंड बंद करके फिर चालू करें, फिर जाँचें",
  "fix.battery": "बैटरी ठीक है",
  "fix.battery.fix": "बैंड चार्ज करें — बच्चे के हाथ पर रहते हुए कभी नहीं",
  "fix.contact": "बैंड त्वचा को छू रहा है",
  "fix.contact.fix": "ऐसे पहनाएँ कि पट्टे के नीचे एक उँगली आ जाए",
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

const hi: Record<Key, string> = { ...baseHi, ...appHi };

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

/** "just now", "5 min ago", "2 h ago" … for a past moment in ms. */
export function ago(lang: LanguageCode, at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return t(lang, "ago.now");
  if (min < 60) return t(lang, "ago.min", { n: min });
  if (min < 48 * 60) return t(lang, "ago.hour", { n: Math.floor(min / 60) });
  return t(lang, "ago.day", { n: Math.floor(min / 1440) });
}

/** A line plus its English gloss (null when the line is already English). */
export interface Bilingual {
  text: string;
  gloss: string | null;
}

let showGloss = true;
/** Settings: hide the English line under Hindi text. */
export function setShowGloss(on: boolean) {
  showGloss = on;
}

export function bi(lang: LanguageCode, key: Key, vars?: Vars): Bilingual {
  return { text: t(lang, key, vars), gloss: lang === "en" || !showGloss ? null : t("en", key, vars) };
}

export function biText(lang: LanguageCode, text: Text): Bilingual {
  return { text: pick(lang, text), gloss: lang === "en" || !showGloss ? null : text.en };
}
