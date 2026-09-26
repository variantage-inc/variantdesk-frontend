import Link from 'next/link';

/* The centred card layout, used by the two screens that only confirm something
   happened. No navy panel: there is no decision to make here, so the page gets
   out of the way. */
export default function CentreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="centre">
      <div>
        <div style={{ textAlign: 'center', marginBottom: 30 }} className="rise d1">
          <Link href="/login">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/wordmark.svg"
              alt="Variantage Finance"
              style={{ width: 190, margin: '0 auto' }}
            />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
