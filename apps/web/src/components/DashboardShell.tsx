"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { demoAccounts, type Role } from "@neobridge/demo";
import { pick, t, type UiLanguage } from "@neobridge/i18n";

import { useLanguage } from "@/lib/language";
import { clearSession, pendingRole, sessionRole, subscribeSession } from "@/lib/session";
import { LanguageSwitch } from "./LanguageSwitch";
import { Logo } from "./Logo";
import styles from "./dashboard.module.css";

/**
 * Header + guard for a role's dashboard. Sends the visitor to /login when they
 * are not signed in as this role. Children get the chosen language.
 */
export function DashboardShell({
  role,
  children,
}: {
  role: Role;
  children: (lang: UiLanguage) => ReactNode;
}) {
  const router = useRouter();
  const lang = useLanguage();
  const signedIn = useSyncExternalStore(subscribeSession, sessionRole, pendingRole);

  useEffect(() => {
    if (signedIn !== "pending" && signedIn !== role) router.replace("/login");
  }, [signedIn, role, router]);

  const account = signedIn === role ? demoAccounts.find((a) => a.role === role) : undefined;
  if (!account) return null;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Logo height={34} />
        <div className={styles.who}>
          <span className={styles.whoName}>{pick(lang, account.name)}</span>
          <span className={styles.whoRole}>{pick(lang, account.label)}</span>
        </div>
        <LanguageSwitch />
        <button
          className={styles.logout}
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}>
          {t(lang, "logout")}
        </button>
      </header>
      <main className={styles.main}>{children(lang)}</main>
    </div>
  );
}
