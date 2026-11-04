import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { defaultLanguage, setShowGloss, type UiLanguage } from '@neobridge/i18n';

/**
 * Language and display settings (C2, C8), kept on the phone.
 * - language: Hindi or English
 * - showEnglish: in Hindi, show the English line under each Hindi line
 * - voice: speak status lines and reminders aloud
 */
export interface Settings {
  showEnglish: boolean;
  voice: boolean;
  /** the permissions primer (C6) has been shown */
  primerDone: boolean;
}

const LANG_KEY = 'neobridge.language';
const SETTINGS_KEY = 'neobridge.settings';
const defaults: Settings = { showEnglish: true, voice: true, primerDone: false };

type LanguageValue = [UiLanguage, (lang: UiLanguage) => void];
const LanguageContext = createContext<LanguageValue | null>(null);
const SettingsContext = createContext<[Settings, (patch: Partial<Settings>) => void, boolean] | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLanguage>(defaultLanguage);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const [l, s] = await Promise.all([
        AsyncStorage.getItem(LANG_KEY).catch(() => null),
        AsyncStorage.getItem(SETTINGS_KEY).catch(() => null),
      ]);
      if (l === 'en' || l === 'hi') setLangState(l);
      const loaded = s ? { ...defaults, ...(JSON.parse(s) as Partial<Settings>) } : defaults;
      setShowGloss(loaded.showEnglish);
      setSettings(loaded);
      setReady(true);
    })();
  }, []);

  const setLang = useCallback((next: UiLanguage) => {
    setLangState(next);
    void AsyncStorage.setItem(LANG_KEY, next).catch(() => undefined);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      setShowGloss(next.showEnglish);
      void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  return (
    <LanguageContext.Provider value={[lang, setLang]}>
      <SettingsContext.Provider value={[settings, update, ready]}>{children}</SettingsContext.Provider>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void, boolean] {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside LanguageProvider');
  return value;
}
