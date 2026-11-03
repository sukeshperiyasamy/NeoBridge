"use client";

import type { DemoAccount, Role } from "@neobridge/demo";
import { demoAccounts } from "@neobridge/demo";

// Demo session kept in the browser only. Real auth will replace this.
const KEY = "neobridge.demo.role";

export function saveSession(account: DemoAccount): void {
  try {
    localStorage.setItem(KEY, account.role);
  } catch {
    // storage blocked (private mode): the session just won't survive a reload
  }
}

export function readSession(): DemoAccount | null {
  try {
    const role = localStorage.getItem(KEY) as Role | null;
    return demoAccounts.find((a) => a.role === role) ?? null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

// For useSyncExternalStore: the server (and hydration) sees "pending".
export function subscribeSession(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function sessionRole(): Role | "none" {
  return readSession()?.role ?? "none";
}

export function pendingRole(): "pending" {
  return "pending";
}
