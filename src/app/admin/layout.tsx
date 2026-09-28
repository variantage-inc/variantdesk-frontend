'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { useSession } from '@/lib/session';

/* Variantage staff only.

   Two guards, and neither is the real one. The API answers 404 to anybody
   without the platform role, so nothing here can be reached by editing a
   variable in a browser. What this does is decide what to render, and send a
   customer who lands on the URL back to their own dashboard rather than to a
   screen full of failed requests.

   Superadmin sits above tenancy: it belongs to no business, and no customer
   can grant it. It is also the one place businessId scoping is deliberately
   bypassed, which is why every read behind these screens writes an audit row. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <StaffOnly>{children}</StaffOnly>
    </RequireAuth>
  );
}

function StaffOnly({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const router = useRouter();
  const staff = user?.platformRole === 'SUPERADMIN';

  useEffect(() => {
    if (user && !staff) router.replace('/dashboard');
  }, [user, staff, router]);

  if (!staff) return null;

  return (
    <div className="app">
      <div className="main" style={{ marginLeft: 0 }}>
        <header className="top">
          <div className="crumb">
            Variantage <span style={{ opacity: 0.5 }}>/</span> <b>Superadmin</b>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <Link className="btn btn-sm" href="/settings#security">
              Change password
            </Link>
            <Link className="btn btn-sm" href="/dashboard">
              Back to my books
            </Link>
          </div>
        </header>
        <div className="body">{children}</div>
      </div>
    </div>
  );
}
