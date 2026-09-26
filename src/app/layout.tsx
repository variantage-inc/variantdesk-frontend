import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Variantage Finance',
  description: 'Income, expenses, drawings and GST/HST for Canadian small business.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body className="bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
