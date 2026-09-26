'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  ApiError,
  billingStatus,
  choosePlan,
  type BillingStatus,
  type PlanId,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { price } from '@/lib/format';

/* Choose a plan, at the end of signing up.

   This matches the redrawn signup-plan.html rather than the version originally
   approved. The client settled the commercial model on 8 September and the
   older mockup is wrong in three ways: three tiers, a per seat counter with no
   ceiling, and a $50 setup fee. None of those exist.

   What replaced them:
     two plans, separated only by whether a human keeps your books
     14 days free, everything switched on
     extra people at $5 each, two at most on top of the owner
     no platform or setup fee at all

   The trial has already started by the time anyone reaches this screen: it
   begins with the account, in the same database transaction. So nothing here
   is a gate. It records a preference for what the account becomes on day 15,
   and the customer can change it any time before then. */

const FEATURES: Record<PlanId, string[]> = {
  ESSENTIAL: [
    'Income, expenses and owner drawings',
    'GST/HST worked out on every entry',
    'Invoices and branded PDFs',
    'Receipt and document storage',
    'All seven reports, PDF and Excel',
    'Voice entry',
  ],
  SOLUTIONS_360: [
    'Everything in Essential',
    'A real person keeps your books',
    'Records entered for you',
    'Priority support',
  ],
};

const TAGLINE: Record<PlanId, string> = {
  ESSENTIAL: 'Everything the software does. You keep the books.',
  SOLUTIONS_360: 'The same software, plus a real person keeping your books.',
};

export function PlanChooser() {
  const router = useRouter();
  const { setAccess } = useSession();

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [plan, setPlan] = useState<PlanId>('ESSENTIAL');
  const [extraUsers, setExtraUsers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    billingStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setPlan(s.access.plan);
        setExtraUsers(s.access.extraSeats);
      })
      .catch(() => {
        if (!cancelled) setProblem('We could not load the plans. Refresh and try again.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function start() {
    setBusy(true);
    setProblem(null);
    try {
      const r = await choosePlan(plan, extraUsers);
      setAccess(r.access);
      router.push('/dashboard');
    } catch (err) {
      setProblem(
        err instanceof ApiError ? err.message : 'We could not save that. Try again in a moment.',
      );
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <AuthShell panel="signup" wide>
        <p className="hint">{problem ?? 'Loading the plans…'}</p>
      </AuthShell>
    );
  }

  const { catalogue } = status;
  const chosen = catalogue.plans.find((p) => p.id === plan);
  const monthly = (chosen?.monthlyCents ?? 0) + extraUsers * catalogue.extraSeatCents;

  return (
    <AuthShell panel="signup" wide>
      <div className="form-head rise d1">
        <h2>Start your {catalogue.trialDays} days free</h2>
        <p className="sub">
          Everything is switched on during the trial. Choose the plan you want it to become
          when the trial ends, and change or cancel any time before then.
        </p>
      </div>

      {problem && (
        <div className="rise d2" style={{ marginBottom: 4 }}>
          <Notice tone="err" icon="alert">
            {problem}
          </Notice>
        </div>
      )}

      <div className="plans rise d2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {catalogue.plans.map((p) => (
          <label key={p.id} className={`plan${plan === p.id ? ' is-on' : ''}`}>
            <input
              type="radio"
              name="plan"
              value={p.id}
              checked={plan === p.id}
              onChange={() => setPlan(p.id)}
            />
            {p.humanSupport && <span className="flag">With human support</span>}
            <span className="nm">{p.name}</span>
            <div className="pr">
              {price(p.monthlyCents)}
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
              {TAGLINE[p.id]}
            </p>
            <ul>
              {FEATURES[p.id].map((f) => (
                <li key={f}>
                  <Icon name="check" size={15} sw={3} />
                  {f}
                </li>
              ))}
            </ul>
          </label>
        ))}
      </div>

      <div className="rise d2" style={{ marginTop: 18 }}>
        <Notice tone="ok" icon="check" title="Both plans unlock the same software">
          Nothing is held back on Essential. The only difference is whether a real person does
          the bookkeeping for you.
        </Notice>
      </div>

      {/* Replaces the seat counter from the older mockup. Capped at two,
          because the model allows the owner plus two people and no more, so
          the control cannot express a number the billing will not accept. */}
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
                &minus;
              </span>
            </button>
            <input value={extraUsers} readOnly aria-label="Extra people" />
            <button
              type="button"
              onClick={() => setExtraUsers((n) => Math.min(catalogue.maxExtraSeats, n + 1))}
              disabled={extraUsers === catalogue.maxExtraSeats}
              aria-label="One more person"
            >
              <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
                +
              </span>
            </button>
          </div>
          <p className="hint" style={{ margin: 0, flex: '1 1 260px' }}>
            {price(catalogue.extraSeatCents)} a month each, up to {catalogue.maxExtraSeats}{' '}
            people besides you. Free during the trial, and <b>charged once it ends</b>. You can
            add or remove them later in Settings.
          </p>
        </div>
      </div>

      <div className="summary rise d4" style={{ marginTop: 28 }}>
        <h3>What you will pay</h3>
        <div className="row">
          <span>Today</span>
          <span style={{ color: 'var(--ok-600)' }}>{price(0)}</span>
        </div>
        <div className="row">
          <span>{chosen?.name}</span>
          <span>{price(chosen?.monthlyCents ?? 0)} / month</span>
        </div>
        {extraUsers > 0 && (
          <div className="row">
            <span>
              {extraUsers} extra {extraUsers === 1 ? 'person' : 'people'}
            </span>
            <span>{price(extraUsers * catalogue.extraSeatCents)} / month</span>
          </div>
        )}
        <div className="row total">
          <span>When the trial ends</span>
          <span>{price(monthly)}</span>
        </div>
        <p className="after">
          No setup fee and no platform fee. Cancel before the trial ends and you are charged
          nothing at all. Your records stay available to download either way.
        </p>
      </div>

      {/* No date is shown for when the trial ends, on purpose. The exact day is
          a fact about the account, and working it out from the browser clock
          would be inventing it: wrong for anyone whose clock is off, or who
          signs up either side of midnight. */}

      <div className="rise d5" style={{ marginTop: 22 }}>
        <Notice icon="lock" title="Card details go straight to Stripe">
          Variantage never sees or stores your card number. Nothing is charged until the trial
          ends, and you can add the card whenever you like before then.
        </Notice>
      </div>

      <button
        className="btn btn-primary btn-block"
        onClick={() => void start()}
        disabled={busy}
        aria-busy={busy}
        style={{ marginTop: 4 }}
      >
        {busy ? 'One moment…' : `Start my ${catalogue.trialDays} days free`}
      </button>

      <p className="hint" style={{ textAlign: 'center', marginTop: 14 }}>
        We will email you three days before the trial ends, so it is never a surprise.
      </p>
    </AuthShell>
  );
}
