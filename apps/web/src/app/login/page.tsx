"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { demoAccounts, demoSignIn, homePath, type DemoAccount } from "@neobridge/demo";
import { bi, pick, t } from "@neobridge/i18n";

import { Bi } from "@/components/Bi";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { useLanguage } from "@/lib/language";
import { saveSession } from "@/lib/session";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const lang = useLanguage();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);

  function signIn(account: DemoAccount | null) {
    if (!account) {
      setFailed(true);
      return;
    }
    saveSession(account);
    router.push(homePath(account.role));
  }

  const idLabel = bi(lang, "login.id");
  const passwordLabel = bi(lang, "login.password");

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <LanguageSwitch />
      </div>

      <section className={styles.panel}>
        <Logo height={52} />
        <h1 className={styles.title}>{t(lang, "login.title")}</h1>
        {lang !== "en" && <p className={styles.sub}>{t("en", "login.sub")}</p>}

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            signIn(demoSignIn(id, password));
          }}>
          <label className={styles.label}>
            <span>
              {idLabel.text} {idLabel.gloss && <small>{idLabel.gloss}</small>}
            </span>
            <input
              className={styles.input}
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              required
            />
          </label>
          <label className={styles.label}>
            <span>
              {passwordLabel.text} {passwordLabel.gloss && <small>{passwordLabel.gloss}</small>}
            </span>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {failed && (
            <p className={styles.error} role="alert">
              <Bi value={bi(lang, "login.error")} />
            </p>
          )}
          <button className={styles.submit} type="submit">
            {t(lang, "login.submit")}
          </button>
        </form>
      </section>

      <section className={styles.demo} aria-labelledby="demo-title">
        <h2 id="demo-title" className={styles.demoTitle}>
          {t(lang, "login.demoTitle")}
        </h2>
        <p className={styles.sub}>{t(lang, "login.demoSub")}</p>
        <ul className={styles.accounts}>
          {demoAccounts.map((a) => (
            <li key={a.role} className={styles.account}>
              <div className={styles.accountWho}>
                <strong>{pick(lang, a.label)}</strong>
                <span>{pick(lang, a.name)}</span>
              </div>
              <dl className={styles.creds}>
                <dt>{t(lang, "login.id")}</dt>
                <dd>
                  <code>{a.id}</code>
                </dd>
                <dt>{t(lang, "login.password")}</dt>
                <dd>
                  <code>{a.password}</code>
                </dd>
              </dl>
              <button
                className={styles.use}
                type="button"
                onClick={() => {
                  setId(a.id);
                  setPassword(a.password);
                  setFailed(false);
                }}>
                {t(lang, "login.fill")}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
