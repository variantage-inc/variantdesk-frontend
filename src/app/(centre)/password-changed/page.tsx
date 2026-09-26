import Link from 'next/link';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';

export default function PasswordChangedPage() {
  return (
    <div className="card text-centre rise d2">
      <div className="glyph glyph-ok">
        <Icon name="check" size={36} sw={2.4} />
      </div>

      <h2
        style={{
          fontFamily: 'var(--display)',
          fontSize: 'var(--fs-h1)',
          marginBottom: 12,
        }}
      >
        Password changed
      </h2>
      <p
        style={{
          fontSize: 'var(--fs-lead)',
          color: 'var(--ink-3)',
          lineHeight: 1.55,
          marginBottom: 26,
        }}
      >
        That is done. Sign in with your new password to get back to your books.
      </p>

      <Link className="btn btn-primary btn-block" href="/login">
        Sign in
      </Link>

      <div style={{ textAlign: 'left', marginTop: 26 }}>
        <Notice tone="warn" icon="shield" title="Every other session has ended">
          If you were signed in on another computer or on your phone, you will need to sign in
          again there. That is deliberate: if someone else knew the old password, they no longer
          have a way in.
        </Notice>
      </div>

      <p className="hint" style={{ marginTop: 4 }}>
        Did not ask for this? Contact us at{' '}
        <a href="mailto:support@variantage.com">support@variantage.com</a> straight away.
      </p>
    </div>
  );
}
