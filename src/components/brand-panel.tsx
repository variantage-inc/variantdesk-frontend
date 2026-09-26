import { Icon } from './icon';

/* The navy half of the auth screens.

   Wording is lifted verbatim from PANELS in mockups-v2/assets/auth.js. The
   client read these sentences and approved them, so they are content, not
   placeholder text, and should not be reworded while building. */

type Panel = {
  eyebrow: string;
  title: React.ReactNode;
  lead: string;
  pillars: [string, string][];
};

const PANELS: Record<string, Panel> = {
  login: {
    eyebrow: 'Built for Canadian business',
    title: (
      <>
        Your books,
        <br />
        your numbers,
        <br />
        <em>one place.</em>
      </>
    ),
    lead: 'Income, expenses, drawings and GST/HST, tracked as you go, ready when your accountant asks.',
    pillars: [
      ['GST/HST worked out for you', 'The right rate for your province, applied automatically.'],
      ['Invoices the CRA accepts', 'Business number, buyer details and terms on every one.'],
      ['Receipts kept for six years', 'Attached to the entry, stored privately, never deleted.'],
    ],
  },
  signup: {
    eyebrow: 'Two minutes to set up',
    title: (
      <>
        Start keeping
        <br />
        proper books
        <br />
        <em>from today.</em>
      </>
    ),
    lead: 'Tell us your province and we will set your tax rates, invoice format and financial year for you.',
    pillars: [
      ['No accounting knowledge needed', 'Plain language throughout. No debits, no credits, no ledgers.'],
      ['Your data stays yours', 'Every business is isolated. Nothing is shared, nothing is sold.'],
      ['Works on your phone too', 'The same account on iPhone and Android, with voice entry.'],
    ],
  },
  recover: {
    eyebrow: 'Account recovery',
    title: (
      <>
        Happens to
        <br />
        everyone.
        <br />
        <em>Two minutes.</em>
      </>
    ),
    lead: 'We will email you a link that lets you set a new password. The link works once and expires after 60 minutes.',
    pillars: [
      ['Only you get the link', 'Sent to the address on the account and nowhere else.'],
      ['Your records are untouched', 'Resetting a password changes nothing in your books.'],
      ['Need a hand?', 'Reach us at support@variantage.com any working day.'],
    ],
  },
  newpass: {
    eyebrow: 'Account recovery',
    title: (
      <>
        Nearly done.
        <br />
        One field
        <br />
        <em>to go.</em>
      </>
    ),
    lead: 'Pick something you will actually remember. A short phrase with a number in it beats a jumble of symbols you have to write down.',
    pillars: [
      ['Nothing else changes', 'Your income, expenses, invoices and receipts stay exactly as they are.'],
      ['Other sessions end', 'Every device is signed out, so anyone who had access no longer does.'],
      ['You can change it again', 'Any time, from Settings, without going through email.'],
    ],
  },
};

/* The faint hex network from the brand header artwork. */
function Weave() {
  return (
    <svg className="weave" aria-hidden="true" width="100%" height="100%">
      <defs>
        <pattern
          id="hex"
          width="56"
          height="97"
          patternUnits="userSpaceOnUse"
          patternTransform="scale(1.15)"
        >
          <path
            d="M28 0 L56 16 L56 48 L28 64 L0 48 L0 16 Z"
            fill="none"
            stroke="rgba(255,255,255,.10)"
            strokeWidth="1"
          />
          <circle cx="28" cy="0" r="1.7" fill="rgba(255,255,255,.16)" />
          <circle cx="56" cy="16" r="1.7" fill="rgba(255,255,255,.16)" />
          <circle cx="0" cy="48" r="1.7" fill="rgba(255,255,255,.16)" />
        </pattern>
        <radialGradient id="fade" cx="18%" cy="16%" r="72%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="hexmask">
          <rect width="100%" height="100%" fill="url(#fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex)" mask="url(#hexmask)" />
    </svg>
  );
}

export function BrandPanel({ panel = 'login' }: { panel?: keyof typeof PANELS }) {
  const p = PANELS[panel] ?? PANELS.login;

  return (
    <aside className="brand-panel">
      <Weave />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="watermark" src="/brand/mark-white.png" alt="" />

      <div className="brand-lockup rise d1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wm" src="/brand/wordmark-white.svg" alt="Variantage Finance" />
      </div>

      <div className="brand-body rise d2">
        <span className="eyebrow">{p.eyebrow}</span>
        <h1>{p.title}</h1>
        <p className="lead">{p.lead}</p>
      </div>

      <div className="rise d3">
        <ul className="pillars">
          {p.pillars.map(([head, sub]) => (
            <li key={head}>
              <span className="tick">
                <Icon name="check" size={15} sw={3} />
              </span>
              <span>
                <b>{head}</b>
                {sub}
              </span>
            </li>
          ))}
        </ul>
        <div className="brand-foot">
          <span>finance.variantage.com</span>
          <span className="dot" />
          <span>Engineering Growth. Delivering Advantage.</span>
        </div>
      </div>
    </aside>
  );
}
