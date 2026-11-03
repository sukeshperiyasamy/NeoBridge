"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { demoAccounts, type Role } from "@neobridge/demo";

import { clearSession, pendingRole, sessionRole, subscribeSession } from "@/lib/session";
import { Logo } from "./Logo";
import styles from "./dashboard.module.css";

/**
 * Header + guard for a role's dashboard. Sends the visitor to /login when they
 * are not signed in as this role.
 */
export function DashboardShell({ role, children }: { role: Role; children: ReactNode }) {
  const router = useRouter();
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
          <span className={styles.whoName}>{account.name}</span>
          <span className={styles.whoRole}>
            {account.labelLocal} · {account.label}
          </span>
        </div>
        <button
          className={styles.logout}
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}>
          लॉग आउट · Log out
        </button>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
