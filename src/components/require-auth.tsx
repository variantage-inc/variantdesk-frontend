'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';
import { IdleGuard } from './idle-guard';

/* Client side guard for signed in pages.

   This decides what to render, not what is allowed. Every protected call is
   checked again by the API against the token, because anything decided in a
   browser can be edited in a browser. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, endedBecause } = useSession();
  const router = useRouter();

  /* This is the only thing that navigates when a session ends. The idle timer
     used to do it too, and the two raced: whichever won decided the screen, so
     a timed out person could land on the sign in form with no explanation. */
  useEffect(() => {
    if (loading || user) return;
    router.replace(endedBecause === 'idle' ? '/signed-out' : '/login');
  }, [loading, user, endedBecause, router]);

  /* While the session is being restored we render nothing rather than the sign
     in screen. Flashing a login page at someone who is already signed in is
     the most common way this pattern goes wrong. */
  if (loading || !user) return null;

  /* The idle timer lives here so it runs on every signed in page and on none
     of the signed out ones. There is nothing to time out of on a login form. */
  return (
    <>
      <IdleGuard />
      {children}
    </>
  );
}
