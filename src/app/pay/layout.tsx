import type { Metadata } from 'next';

/* The only pages anybody can open without an account. The address carries the
   invoice's key, so it must not travel on to another site in a Referer header
   and must never be indexed. */
export const metadata: Metadata = {
  title: 'Invoice',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return <div className="paypage">{children}</div>;
}
