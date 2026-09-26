import Link from 'next/link';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';

/* Where the idle logout lands. A page rather than a modal, because the session
   is already gone: there is nothing behind this to go back to. */
export default function SignedOutPage() {
  return (
    <div className="card text-centre rise d2">
      <div className="glyph glyph-warn">
        <Icon name="lock" size={34} sw={1.9} />
      </div>

      <h2 style={{ fontFamily: 'var(--display)', fontSize: 'var(--fs-h1)', marginBottom: 12 }}>
        You have been signed out
      </h2>
      <p
        style={{
          fontSize: 'var(--fs-lead)',
          color: 'var(--ink-3)',
          lineHeight: 1.55,
          marginBottom: 26,
        }}
      >
        There was no activity for a while, so we closed the session to keep your records
        private.
      </p>

      <div style={{ textAlign: 'left' }}>
        <Notice title="Everything you had already saved is exactly where you left it">
          Sign back in to carry on. The warning before this screen is there so you can stay
          signed in and finish what you were doing.
        </Notice>
      </div>

      <Link className="btn btn-primary btn-block" href="/login">
        Sign in again
      </Link>

      <p
        style={{
          fontSize: 'var(--fs-tiny)',
          color: 'var(--ink-3)',
          margin: '20px 0 0',
          lineHeight: 1.5,
        }}
      >
        On the iPhone and Android apps you stay signed in until you log out yourself,
        protected by your fingerprint, face or PIN.
      </p>
    </div>
  );
}
