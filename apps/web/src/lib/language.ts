"use client";

import { useEffect, useSyncExternalStore } from "react";

import { defaultLanguage, uiLanguages, type UiLanguage } from "@neobridge/i18n";

// Chosen language, remembered in this browser only.
const KEY = "neobridge.lang";
const EVENT = "neobridge-lang";

function read(): UiLanguage {
  try {
    const v = localStorage.getItem(KEY);
    return (uiLanguages as readonly string[]).includes(v ?? "") ? (v as UiLanguage) : defaultLanguage;
  } catch {
    return defaultLanguage;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setLanguage(lang: UiLanguage): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // storage blocked: the choice lasts until reload
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useLanguage(): UiLanguage {
  const lang = useSyncExternalStore(subscribe, read, () => defaultLanguage);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return lang;
}
