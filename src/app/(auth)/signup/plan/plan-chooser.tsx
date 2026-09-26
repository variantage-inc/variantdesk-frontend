'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';

/* Choose a plan.

   This screen deliberately does NOT match signup-plan.html in the mockups. The
   client changed the commercial model on 8 September, and the mockup is now
   wrong in three ways: it shows three tiers, a per seat counter, and a $50
   setup fee. None of those exist any more.

   What replaced them:
     two plans, separated only by human support
     14 days free with a card taken but not charged
     extra people at $5 each, maximum two on top of the owner
     no platform or setup fee at all

   The visual language is unchanged, so it still reads as the same product. */

const TRIAL_DAYS = 14;
const EXTRA_USER = 5;

type PlanId = 'essential' | 'solutions360';

const PLANS: {
  id: PlanId;
  name: string;
  price: number;
  tagline: string;
  features: string[];
  flag?: string;
}[] = [
  {
    id: 'essential',
    name: 'Essential',
    price: 20,
    tagline: 'Everything the software does, you keep the books.',
    features: [
      'Income, expenses and owner drawings',
      'GST/HST worked out on every entry',
      'Invoices and branded PDFs',
      'Receipt and document storage',
      'All seven reports, PDF and Excel',
      'Voice entry',
    ],
  },
  {
    id: 'solutions360',
    name: '360 Solutions',
    price: 40,
    tagline: 'The same software, plus a real person keeping your books.',
    flag: 'With human support',
    features: [
      'Everything in Essential',
      'A real person keeps your books',
      'Records entered for you',
      'Priority support',
    ],
  },
];

const money = (n: number) =>
  n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 });

export function PlanChooser() {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanId>('essential');
  const [extraUsers, setExtraUsers] = useState(0);
  const [busy, setBusy] = useState(false);

  const chosen = PLANS.find((p) => p.id === plan)!;
  const monthly = chosen.price + extraUsers * EXTRA_USER;

  /* No date is shown, on purpose.

     The exact day the trial ends is a fact about the account, and the account
     does not exist until Phase 3 creates the subscription. Working it out from
     the browser clock would be inventing it, and it would be wrong for anyone
     whose clock is off or who signs up either side of midnight. The wording
     below says the same thing without pretending to know the date. */

  function start() {
    setBusy(true);
    /* Stripe checkout goes here in Phase 3. Until the keys exist the trial
       simply starts, so the rest of the product can be built and reviewed. */
    router.push('/dashboard');
  }

  return (
    <AuthShell panel="signup" wide>
      <div className="form-head rise d1">
        <h2>Start your {TRIAL_DAYS} days free</h2>
        <p className="sub">
          Everything is included during the trial. Pick the plan you want it to become when the
          trial ends, and change or cancel any time before then.
        </p>
      </div>

      <div
        className="plans rise d2"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
      >
        {PLANS.map((p) => (
          <label key={p.id} className={`plan${plan === p.id ? ' is-on' : ''}`}>
            <input
              type="radio"
              name="plan"
              value={p.id}
              checked={plan === p.id}
              onChange={() => setPlan(p.id)}
            />
            {p.flag && <span className="flag">{p.flag}</span>}
            <span className="nm">{p.name}</span>
            <div className="pr">
              {money(p.price)}
              <small> / month</small>
            </div>
            <p
              style={{
                fontSize: 'var(--fs-tiny)',
                color: 'var(--ink-3)',
                margin: '8px 0 0',
                lineHeight: 1.45,
              }}
            >
              {p.tagline}
            </p>
            <ul>
              {p.features.map((f) => (
                <li key={f}>
                  <Icon name="check" size={15} sw={3} />
                  {f}
                </li>
              ))}
            </ul>
          </label>
        ))}
      </div>

      {/* Replaces the seat counter from the mockup. Capped at two, because the
          model allows the owner plus two people and no more. */}
      <div className="rise d3" style={{ marginTop: 26 }}>
        <span className="label">Anyone else who needs an account?</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="stepper">
            <button
              type="button"
              onClick={() => setExtraUsers((n) => Math.max(0, n - 1))}
              disabled={extraUsers === 0}
              aria-label="One fewer person"
            >
              <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
                −
              </span>
            </button>
            <input value={extraUsers} readOnly aria-label="Extra people" />
            <button
              type="button"
              onClick={() => setExtraUsers((n) => Math.min(2, n + 1))}
              disabled={extraUsers === 2}
              aria-label="One more person"
            >
              <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
                +
              </span>
            </button>
          </div>
          <p className="hint" style={{ margin: 0, flex: '1 1 260px' }}>
            {money(EXTRA_USER)} a month each, up to two people besides you. Free during the trial,
            and <b>charged once it ends</b>. You can add or remove them later.
          </p>
        </div>
      </div>

      <div className="summary rise d4" style={{ marginTop: 28 }}>
        <h3>What you will pay</h3>
        <div className="row">
          <span>Today</span>
          <span style={{ color: 'var(--ok-600)' }}>{money(0)}</span>
        </div>
        <div className="row">
          <span>{chosen.name}</span>
          <span>{money(chosen.price)} / month</span>
        </div>
        {extraUsers > 0 && (
          <div className="row">
            <span>
              {extraUsers} extra {extraUsers === 1 ? 'person' : 'people'}
            </span>
            <span>{money(extraUsers * EXTRA_USER)} / month</span>
          </div>
        )}
        <div className="row total">
          <span>When the trial ends</span>
          <span>{money(monthly)}</span>
        </div>
        <p className="after">
          No setup fee and no platform fee. Cancel before the trial ends and you are charged
          nothing at all. Your records stay available to download either way.
        </p>
      </div>

      <div className="rise d5" style={{ marginTop: 22 }}>
        <Notice icon="lock" title="Card details go straight to Stripe">
          Variantage never sees or stores your card number. You are taken to Stripe&apos;s secure
          checkout, and nothing is charged until the trial ends.
        </Notice>
      </div>

      <button
        className="btn btn-primary btn-block"
        onClick={start}
        disabled={busy}
        aria-busy={busy}
        style={{ marginTop: 4 }}
      >
        {busy ? 'One moment…' : `Start my ${TRIAL_DAYS} days free`}
      </button>

      <p className="hint" style={{ textAlign: 'center', marginTop: 14 }}>
        We will email you three days before the trial ends, so it is never a surprise.
      </p>
    </AuthShell>
  );
}
