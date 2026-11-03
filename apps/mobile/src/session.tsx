import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { demoSignIn, type DemoAccount } from '@neobridge/demo';

// Demo session held in memory: signing in again is needed after a restart.
// Real phone-OTP auth will replace this.
interface Session {
  account: DemoAccount | null;
  signIn: (id: string, password: string) => DemoAccount | null;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<DemoAccount | null>(null);

  const value = useMemo<Session>(
    () => ({
      account,
      signIn(id, password) {
        const found = demoSignIn(id, password);
        setAccount(found);
        return found;
      },
      signOut: () => setAccount(null),
    }),
    [account],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}
