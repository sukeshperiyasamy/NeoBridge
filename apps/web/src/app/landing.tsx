"use client";

import Link from "next/link";

import { t } from "@neobridge/i18n";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { useLanguage } from "@/lib/language";
import styles from "./page.module.css";

export function Landing() {
  const lang = useLanguage();

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <Logo height={64} />
        <LanguageSwitch />
      </div>
      <h1 className={styles.title}>{t(lang, "landing.title")}</h1>
      <p className={styles.lead}>{t(lang, "landing.lead")}</p>
      <Link className={styles.cta} href="/login">
        {t(lang, "login.submit")}
      </Link>
    </main>
  );
}
