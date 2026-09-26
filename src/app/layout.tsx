import type { Metadata } from 'next';
import { Figtree, Fraunces } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/lib/session';

/* Fraunces for display, Figtree for interface. The brand kit specifies PT Serif
   and Poppins; the client asked to keep these two, so they stay.

   Loaded through next/font rather than an @import so they are self hosted,
   preloaded, and carry fallback metrics that stop the page reflowing when they
   land. display swap means text is readable immediately either way. */
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-fraunces',
  display: 'swap',
});

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-figtree',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Variantage Finance',
  description: 'Income, expenses, drawings and GST/HST for Canadian small business.',
  icons: { icon: '/brand/mark.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${fraunces.variable} ${figtree.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
