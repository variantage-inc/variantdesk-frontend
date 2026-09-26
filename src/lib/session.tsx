'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { restoreSession, signOut as apiSignOut, type Business, type Session, type User } from './api';

/* Who is signed in, for the whole app.

   On first load the access token is gone, because it only ever lived in memory.
   The httpOnly refresh cookie is still there though, so we ask the API for a
   new one. That single call is what makes a refreshed tab stay signed in. */

type State = {
  user: User | null;
  business: Business | null;
  loading: boolean;
  setSession: (s: Session) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<State | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((session) => {
        if (cancelled || !session) return;
        setUser(session.user);
        setBusiness(session.business);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback((s: Session) => {
    setUser(s.user);
    setBusiness(s.business);
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setUser(null);
    setBusiness(null);
  }, []);

  return (
    <SessionContext.Provider value={{ user, business, loading, setSession, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): State {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
