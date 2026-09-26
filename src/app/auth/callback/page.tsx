'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { restoreSession } from '@/lib/api';
import { useSession } from '@/lib/session';

/* Where Google sends a returning user.

   The API has already set the refresh cookie by the time this loads. All this
   page does is trade that cookie for an access token and move on. It exists so
   no token has to travel in the URL, where it would end up in browser history,
   referrer headers and server logs. */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { setSession } = useSession();

  useEffect(() => {
    restoreSession()
      .then((session) => router.replace(session ? '/dashboard' : '/login?error=google_failed'))
      .catch(() => router.replace('/login?error=google_failed'));
  }, [router, setSession]);

  return (
    <div className="centre">
      <p style={{ color: 'var(--ink-3)' }}>Signing you in…</p>
    </div>
  );
}
