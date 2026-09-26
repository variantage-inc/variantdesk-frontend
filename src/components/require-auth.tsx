'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';

/* Client side guard for signed in pages.

   This decides what to render, not what is allowed. Every protected call is
   checked again by the API against the token, because anything decided in a
   browser can be edited in a browser. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  /* While the session is being restored we render nothing rather than the sign
     in screen. Flashing a login page at someone who is already signed in is
     the most common way this pattern goes wrong. */
  if (loading || !user) return null;

  return <>{children}</>;
}
