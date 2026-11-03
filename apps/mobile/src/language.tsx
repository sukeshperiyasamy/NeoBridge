import { createContext, useContext, useState, type ReactNode } from 'react';

import { defaultLanguage, type UiLanguage } from '@neobridge/i18n';

// Chosen language, held in memory for now (resets on restart).
// TODO: persist with expo-secure-store or AsyncStorage once settings exist.
const LanguageContext = createContext<[UiLanguage, (lang: UiLanguage) => void] | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const state = useState<UiLanguage>(defaultLanguage);
  return <LanguageContext.Provider value={state}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): [UiLanguage, (lang: UiLanguage) => void] {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
