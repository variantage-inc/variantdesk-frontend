'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { restoreSession, signOut as apiSignOut, type Business, type Session, type User } from './api';

/* Who is signed in, for the whole app.

   On first load the access token is gone, because it only ever lived in memory.
   The httpOnly refresh cookie is still there though, so we ask the API for a
   new one. That single call is what makes a refreshed tab stay signed in. */

/* Why the session ended, so the screen that follows can explain it. Signing
   out on purpose and being timed out look identical to the router otherwise,
   and the timed out person is the one who needs telling. */
export type SignOutReason = 'user' | 'idle';

type State = {
  user: User | null;
  business: Business | null;
  loading: boolean;
  endedBecause: SignOutReason | null;
  setSession: (s: Session) => void;
  signOut: (reason?: SignOutReason) => Promise<void>;
};

const SessionContext = createContext<State | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [endedBecause, setEndedBecause] = useState<SignOutReason | null>(null);

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
    setEndedBecause(null);
    setLoading(false);
  }, []);

  const signOut = useCallback(async (reason: SignOutReason = 'user') => {
    /* The reason is set before the request, so the guard sees it as soon as
       the user goes null rather than a moment later. */
    setEndedBecause(reason);
    await apiSignOut();
    setUser(null);
    setBusiness(null);
  }, []);

  return (
    <SessionContext.Provider
      value={{ user, business, loading, endedBecause, setSession, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): State {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
