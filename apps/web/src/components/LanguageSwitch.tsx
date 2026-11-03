"use client";

import { languages, t, uiLanguages } from "@neobridge/i18n";

import { setLanguage, useLanguage } from "@/lib/language";
import styles from "./language-switch.module.css";

/** English | हिन्दी toggle. Each option is written in its own language. */
export function LanguageSwitch() {
  const lang = useLanguage();

  return (
    <div className={styles.switch} role="group" aria-label={t(lang, "language")}>
      {uiLanguages.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          className={styles.option}
          aria-pressed={lang === code}
          onClick={() => setLanguage(code)}>
          {languages.find((l) => l.code === code)!.name}
        </button>
      ))}
    </div>
  );
}
