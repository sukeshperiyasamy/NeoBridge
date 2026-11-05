import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { BabyInfo, MotherInfo, UserProfile } from '@neobridge/domain';

import { clearCache } from '@/api/cache';
import { ApiError, api, onUnauthorised, setToken, getToken } from '@/api/client';
import { getOutbox } from '@/api/outbox';
import { useLanguage } from '@/language';

/**
 * Phone-OTP session (C1, C3, C4). The token and profile are kept on the phone,
 * so the app opens straight to the role's dashboard, even offline. The role
 * always comes from the server profile; nobody picks their own.
 */

export interface Me {
  profile: UserProfile;
  mother?: MotherInfo | null;
  babies?: BabyInfo[];
}

interface Session {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  /** Step 1: ask the server to send a code. Returns the demo code when the server is in demo mode. */
  startOtp(phone: string): Promise<{ resendInSeconds: number; demoCode?: string }>;
  /** Step 2: check the code and sign in. */
  verifyOtp(phone: string, code: string): Promise<Me>;
  /** DEMO ONLY: user ID + password for the seeded accounts. Remove after full integration. */
  signInWithPassword(id: string, password: string): Promise<Me>;
  /** Re-read the profile (after consent, band assignment…). */
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const ME_KEY = 'neobridge.me';
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [, setLang] = useLanguage();

  const store = useCallback(async (next: Me | null) => {
    setMe(next);
    if (next) await AsyncStorage.setItem(ME_KEY, JSON.stringify(next)).catch(() => undefined);
    else await AsyncStorage.removeItem(ME_KEY).catch(() => undefined);
  }, []);

  const refresh = useCallback(async () => {
    try {
      await store(await api<Me>('GET', '/v1/me'));
    } catch {
      // offline: keep the stored profile
    }
  }, [store]);

  const signOut = useCallback(async () => {
    await api('POST', '/v1/auth/logout').catch(() => undefined);
    await setToken(null);
    await store(null);
    await getOutbox().clear();
    await clearCache();
    setStatus('signedOut');
  }, [store]);

  useEffect(() => {
    void (async () => {
      const [token, saved] = await Promise.all([getToken(), AsyncStorage.getItem(ME_KEY).catch(() => null)]);
      if (token && saved) {
        setMe(JSON.parse(saved) as Me);
        setStatus('signedIn');
        void refresh();
      } else {
        setStatus('signedOut');
      }
    })();
    return onUnauthorised(() => void signOut());
  }, [refresh, signOut]);

  /** Stores the new session, loads the full profile and opens the role's home. */
  const finish = useCallback(
    async (res: { token: string; profile: UserProfile }): Promise<Me> => {
      await setToken(res.token);
      const full = await api<Me>('GET', '/v1/me').catch(() => ({ profile: res.profile }) as Me);
      await store(full);
      setLang(full.profile.language);
      setStatus('signedIn');
      return full;
    },
    [store, setLang],
  );

  const value = useMemo<Session>(
    () => ({
      status,
      me,
      async startOtp(phone) {
        return api<{ resendInSeconds: number; demoCode?: string }>('POST', '/v1/auth/otp/start', { phone });
      },
      async signInWithPassword(id, password) {
        return finish(await api<{ token: string; profile: UserProfile }>('POST', '/v1/auth/password', { id, password }));
      },
      async verifyOtp(phone, code) {
        return finish(await api<{ token: string; profile: UserProfile }>('POST', '/v1/auth/otp/verify', { phone, code }));
      },
      refresh,
      signOut,
    }),
    [status, me, refresh, signOut, finish],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}

export { ApiError };
