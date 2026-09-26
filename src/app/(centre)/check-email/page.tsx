'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';

function CheckEmail() {
  const email = useSearchParams().get('email');

  return (
    <div className="card text-centre rise d2">
      <div className="glyph glyph-ok">
        <Icon name="mail" size={34} sw={1.8} />
      </div>

      <h2
        style={{
          fontFamily: 'var(--display)',
          fontSize: 'var(--fs-h1)',
          marginBottom: 12,
        }}
      >
        Check your email
      </h2>

      {/* Worded as a conditional on purpose. The API will not say whether the
          address is registered, so neither does this screen. */}
      <p
        style={{
          fontSize: 'var(--fs-lead)',
          color: 'var(--ink-3)',
          lineHeight: 1.55,
          marginBottom: 26,
        }}
      >
        If {email ? <b style={{ color: 'var(--ink)' }}>{email}</b> : 'that address'} has an account
        with us, a link to set a new password is on its way.
      </p>

      <div style={{ textAlign: 'left' }}>
        <Notice tone="warn" icon="clock" title="The link works once and expires in 60 minutes">
          If it runs out, come back and ask for another one. There is no limit.
        </Notice>
      </div>

      <div className="or">
        <span>still nothing?</span>
      </div>

      <p style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-3)', marginBottom: 22 }}>
        Emails can take a minute or two. Have a look in your junk or spam folder, and check the
        address was spelled correctly.
      </p>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link className="btn btn-sm" href="/forgot-password">
          Send it again
        </Link>
        <Link className="btn btn-sm" href="/forgot-password">
          Use a different address
        </Link>
      </div>

      <p className="hint" style={{ marginTop: 22 }}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmail />
    </Suspense>
  );
}
