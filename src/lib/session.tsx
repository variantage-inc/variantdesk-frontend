'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  restoreSession,
  signOut as apiSignOut,
  type Access,
  type Business,
  type Session,
  type User,
} from './api';

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
  /* Whether the account may write, sent with every session response. Held here
     rather than fetched per screen so the shell can paint the read only banner
     on the first render instead of a moment later. */
  access: Access | null;
  loading: boolean;
  endedBecause: SignOutReason | null;
  setSession: (s: Session) => void;
  setAccess: (a: Access) => void;
  setBusiness: (b: Business) => void;
  signOut: (reason?: SignOutReason) => Promise<void>;
};

const SessionContext = createContext<State | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusinessState] = useState<Business | null>(null);
  const [access, setAccessState] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [endedBecause, setEndedBecause] = useState<SignOutReason | null>(null);

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((session) => {
        if (cancelled || !session) return;
        setUser(session.user);
        setBusinessState(session.business);
        setAccessState(session.access);
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
    setBusinessState(s.business);
    setAccessState(s.access);
    setEndedBecause(null);
    setLoading(false);
  }, []);

  /* Anything that changes the plan, the seats or the trial pushes the new
     answer back here, so the banner in the shell and the screen that made the
     change never disagree. */
  const setAccess = useCallback((a: Access) => setAccessState(a), []);

  /* Settings can rename the business or change the idle timeout, both of which
     the shell is already showing. */
  const setBusiness = useCallback((b: Business) => setBusinessState(b), []);

  const signOut = useCallback(async (reason: SignOutReason = 'user') => {
    /* The reason is set before the request, so the guard sees it as soon as
       the user goes null rather than a moment later. */
    setEndedBecause(reason);
    await apiSignOut();
    setUser(null);
    setBusinessState(null);
    setAccessState(null);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        user,
        business,
        access,
        loading,
        endedBecause,
        setSession,
        setAccess,
        setBusiness,
        signOut,
      }}
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
