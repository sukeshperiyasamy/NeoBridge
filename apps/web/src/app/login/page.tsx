"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { demoAccounts, demoSignIn, homePath, type DemoAccount } from "@neobridge/demo";

import { Logo } from "@/components/Logo";
import { saveSession } from "@/lib/session";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function signIn(account: DemoAccount | null) {
    if (!account) {
      setError("ID या पासवर्ड गलत है · Wrong ID or password");
      return;
    }
    saveSession(account);
    router.push(homePath(account.role));
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <Logo height={52} />
        <h1 className={styles.title}>लॉग इन करें</h1>
        <p className={styles.sub}>Log in to NeoBridge</p>

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            signIn(demoSignIn(id, password));
          }}>
          <label className={styles.label}>
            <span>
              यूज़र ID <small>User ID</small>
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
              पासवर्ड <small>Password</small>
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
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.submit} type="submit">
            लॉग इन · Log in
          </button>
        </form>
      </section>

      <section className={styles.demo} aria-labelledby="demo-title">
        <h2 id="demo-title" className={styles.demoTitle}>
          डेमो लॉग इन · Demo logins
        </h2>
        <p className={styles.sub}>
          Three people, three dashboards. These are sample accounts for trying the app.
        </p>
        <ul className={styles.accounts}>
          {demoAccounts.map((a) => (
            <li key={a.role} className={styles.account}>
              <div className={styles.accountWho}>
                <strong>{a.labelLocal}</strong>
                <span>
                  {a.label} · {a.name}
                </span>
              </div>
              <dl className={styles.creds}>
                <dt>ID</dt>
                <dd>
                  <code>{a.id}</code>
                </dd>
                <dt>Password</dt>
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
                  setError("");
                }}>
                भरें · Fill in
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
