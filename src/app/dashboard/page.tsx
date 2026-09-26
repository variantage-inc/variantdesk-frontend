'use client';

import { RequireAuth } from '@/components/require-auth';
import { useSession } from '@/lib/session';

/* Placeholder. The real dashboard is Phase 7, and it cannot be built until
   there are income, expenses and invoices for it to derive from. This exists
   so signing in has somewhere to land. */
function Inside() {
  const { user, business, signOut } = useSession();

  return (
    <div className="centre">
      <div className="card">
        <p className="eyebrow" style={{ color: 'var(--ink-3)' }}>
          Signed in
        </p>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 'var(--fs-h1)', marginBottom: 8 }}>
          {business?.name}
        </h2>
        <p style={{ color: 'var(--ink-3)' }}>
          {user?.firstName} {user?.lastName} · {user?.email} · {user?.role}
        </p>
        <p className="hint" style={{ marginTop: 18 }}>
          The dashboard itself is a later phase. Authentication is what works today.
        </p>
        <button className="btn btn-block" style={{ marginTop: 20 }} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Inside />
    </RequireAuth>
  );
}
