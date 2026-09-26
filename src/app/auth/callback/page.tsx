'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';

/* Where Google sends a returning user.

   The API has already set the refresh cookie by the time this loads, and
   SessionProvider is already trading it for an access token. This page waits
   for that and then moves on.

   It deliberately does not refresh on its own. Doing so was the bug: two
   refreshes on one page load meant the second presented an already rotated
   token, which the API correctly read as a stolen one and responded to by
   ending every session. */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { user, loading } = useSession();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/dashboard' : '/login?error=google_failed');
  }, [loading, user, router]);

  return (
    <div className="centre">
      <p style={{ color: 'var(--ink-3)' }}>Signing you in…</p>
    </div>
  );
}
