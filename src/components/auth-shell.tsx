import Link from 'next/link';
import { BrandPanel } from './brand-panel';

/* The right hand half: a top bar, the form, and the footer. Kept as one
   component so every auth screen has the same frame and none of them drift. */
export function AuthShell({
  panel,
  topRight,
  children,
  wide,
}: {
  panel?: 'login' | 'signup' | 'recover' | 'newpass';
  topRight?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <>
      <BrandPanel panel={panel} />
      <main className="form-panel">
        <div className="form-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wm-sm" src="/brand/wordmark.svg" alt="Variantage Finance" />
          {topRight}
        </div>

        <div className={`form-wrap${wide ? ' wide' : ''}`}>{children}</div>

        <div className="form-foot">
          © 2026 Variantage · <Link href="/privacy">Privacy</Link> ·{' '}
          <Link href="/terms">Terms</Link>
        </div>
      </main>
    </>
  );
}
