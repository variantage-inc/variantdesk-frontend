'use client';

import { useEffect, useState } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  ApiError,
  billingStatus,
  choosePlan,
  listPayments,
  openBillingPortal,
  simulateBilling,
  startCheckout,
  type BillingStatus,
  type PaymentRow,
  type PlanId,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { days, formatDate, price } from '@/lib/format';
import { useToast } from './toast';

/* Plan and billing.

   Two plans that unlock exactly the same software. The difference is a real
   person doing the bookkeeping, which is a service rather than a feature, so
   nothing in this application is ever gated on which one you are on. The
   screen says so out loud, because a customer comparing two near identical
   tick lists will otherwise assume something is being held back.

   Card details never touch our servers: Stripe hosts the checkout and the
   portal, which is what keeps card handling out of PCI scope. */

export function BillingTab() {
  const { user, setAccess } = useSession();
  const toast = useToast();

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [busy, setBusy] = useState(false);

  /* What is chosen on screen but not yet saved. Null means it matches what the
     account is already on. */
  const [pickedPlan, setPickedPlan] = useState<PlanId | null>(null);
  const [pickedSeats, setPickedSeats] = useState<number | null>(null);

  const owner = user?.role === 'OWNER';

  useEffect(() => {
    let cancelled = false;
    billingStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && toast('We could not load your plan.', 'err'));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    listPayments()
      .then((r) => !cancelled && setPayments(r.payments))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [owner]);

  if (!status) {
    return (
      <section className="tabpane">
        <p className="hint">Loading your plan…</p>
      </section>
    );
  }

  const { access, catalogue } = status;
  const plan = pickedPlan ?? access.plan;
  const seats = pickedSeats ?? access.extraSeats;
  const chosen = catalogue.plans.find((p) => p.id === plan);
  const monthly = (chosen?.monthlyCents ?? 0) + seats * catalogue.extraSeatCents;
  const changed = plan !== access.plan || seats !== access.extraSeats;

  async function apply() {
    setBusy(true);
    try {
      const r = await choosePlan(plan, seats);
      setStatus((s) => (s ? { ...s, access: r.access } : s));
      setAccess(r.access);
      setPickedPlan(null);
      setPickedSeats(null);
      toast('Your plan has been updated.');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That did not work. Try again.', 'err');
    } finally {
      setBusy(false);
    }
  }

  /* Both of these hand the browser to Stripe. Nothing about the card comes
     back through this application. */
  async function goToStripe(where: 'checkout' | 'portal') {
    setBusy(true);
    try {
      const r = where === 'checkout'
        ? await startCheckout('/settings#billing')
        : await openBillingPortal('/settings#billing');
      window.location.href = r.url;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'We could not reach Stripe.', 'err');
      setBusy(false);
    }
  }

  return (
    <section className="tabpane">
      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Plan and billing</h2>
              <p className="csub">
                {access.state === 'trial'
                  ? `Free trial, ${days(access.trialDaysLeft)} left. Nothing has been charged.`
                  : access.state === 'active'
                    ? `${access.planName}, ${price(access.monthlyCents)} a month.`
                    : 'The account is read only until a plan is active.'}
              </p>
            </div>
          </div>

          <div className="setbody">
            <div className="setsec">
              <h3>Your plan</h3>
              <p className="ssub">
                Change it whenever you like. During the trial neither choice costs anything.
              </p>

              <div className="plans" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {catalogue.plans.map((p) => (
                  <label key={p.id} className={`plan${plan === p.id ? ' is-on' : ''}`}>
                    <input
                      type="radio"
                      name="plan"
                      value={p.id}
                      checked={plan === p.id}
                      disabled={!owner}
                      onChange={() => setPickedPlan(p.id)}
                    />
                    {p.humanSupport && <span className="flag">With human support</span>}
                    <div className="nm">{p.name}</div>
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
                      {p.humanSupport
                        ? 'The same software, plus a real person keeping your books.'
                        : 'Everything the software does. You keep the books.'}
                    </p>
                  </label>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <Notice tone="ok" icon="check" title="Both plans unlock the same software">
                  Nothing is held back on Essential. The only difference is whether a real
                  person does the bookkeeping for you.
                </Notice>
              </div>
            </div>

            <div className="setsec">
              <h3>Extra people</h3>
              <p className="ssub">
                {price(catalogue.extraSeatCents)} a month each, up to {catalogue.maxExtraSeats}{' '}
                besides you.
                {access.state === 'trial' && ' Free for the whole trial.'}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div className="stepper">
                  <button
                    type="button"
                    aria-label="One fewer person"
                    disabled={!owner || seats === 0}
                    onClick={() => setPickedSeats(Math.max(0, seats - 1))}
                  >
                    <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
                      &minus;
                    </span>
                  </button>
                  <input value={seats} readOnly aria-label="Extra people" />
                  <button
                    type="button"
                    aria-label="One more person"
                    disabled={!owner || seats >= catalogue.maxExtraSeats}
                    onClick={() => setPickedSeats(Math.min(catalogue.maxExtraSeats, seats + 1))}
                  >
                    <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
                      +
                    </span>
                  </button>
                </div>
                <p className="hint" style={{ margin: 0, flex: '1 1 260px' }}>
                  A seat is a person who can sign in and work on the same books. Invite them on
                  the <b>Your team</b> tab once you have added one.
                </p>
              </div>
            </div>

            {owner && (
              <div className="setsec">
                <h3>Your card</h3>
                <p className="ssub">
                  Card details go straight to Stripe. Variantage never sees or stores your card
                  number.
                </p>

                {!status.billingConfigured ? (
                  <Notice tone="warn" icon="alert" title="Card payments are not switched on yet">
                    The Stripe keys have not been added to this environment. Everything else
                    works, and your trial is unaffected. Adding the keys is the only step left,
                    and no code changes with it.
                  </Notice>
                ) : access.hasCard ? (
                  <>
                    <p style={{ fontSize: 'var(--fs-label)', marginBottom: 14 }}>
                      {access.cancelAtPeriodEnd
                        ? `Your subscription ends on ${formatDate(access.currentPeriodEnd)}.`
                        : access.currentPeriodEnd
                          ? `Next payment ${formatDate(access.currentPeriodEnd)}.`
                          : 'A card is on file.'}
                    </p>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => void goToStripe('portal')}
                    >
                      <Icon name="card" size={18} /> Manage billing with Stripe
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 'var(--fs-label)', marginBottom: 14 }}>
                      {access.state === 'trial'
                        ? `Adding a card now changes nothing until your trial ends${access.trialEndsAt ? ` on ${formatDate(access.trialEndsAt)}` : ''}. It just means the account carries on instead of stopping.`
                        : 'Add a card to start your subscription and turn writing back on.'}
                    </p>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={busy}
                      onClick={() => void goToStripe('checkout')}
                    >
                      <Icon name="lock" size={18} /> Add a card with Stripe
                    </button>
                  </>
                )}
              </div>
            )}

            {owner && payments.length > 0 && (
              <div className="setsec">
                <h3>Payment history</h3>
                <p className="ssub">Every charge Stripe has made, and every one that failed.</p>
                <div className="tblwrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th className="r">Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="date">{formatDate(p.paidAt ?? p.createdAt)}</td>
                          <td>{p.description ?? 'Subscription'}</td>
                          <td className="r">{price(p.amountCents, p.currency.toUpperCase())}</td>
                          <td>
                            <span className={`pill ${p.status === 'PAID' ? 'p-paid' : 'p-late'}`}>
                              {p.status === 'PAID' ? 'Paid' : 'Failed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <DevSimulator
              onChange={(next) => {
                setStatus((s) => (s ? { ...s, access: next } : s));
                setAccess(next);
              }}
            />
          </div>
        </div>

        <div className="rail">
          <div className="prev">
            <h4>{access.state === 'trial' ? 'When the trial ends' : 'Every month'}</h4>
            <div className="big">{price(monthly)}</div>
            <div className="then">
              {chosen?.name}
              {seats > 0 && `, plus ${seats} extra ${seats === 1 ? 'person' : 'people'}`}
            </div>
            {access.state === 'trial' && (
              <div className="quote">
                <b>Today</b>
                <span>
                  Nothing. {days(access.trialDaysLeft)} of the trial left
                  {access.trialEndsAt && `, ending ${formatDate(access.trialEndsAt)}`}.
                </span>
              </div>
            )}
            <div className="quote">
              <b>No fees of any kind</b>
              <span>
                No setup fee, no platform fee. The most any account pays is{' '}
                {price(4000 + 2 * catalogue.extraSeatCents)} a month.
              </span>
            </div>

            {owner && changed && (
              <button
                className="btn btn-primary btn-block"
                type="button"
                style={{ marginTop: 16 }}
                disabled={busy}
                onClick={() => void apply()}
              >
                {busy ? 'Saving…' : 'Save this plan'}
              </button>
            )}
          </div>

          {!owner && (
            <Notice icon="lock" title="Only the owner can change this">
              You can see what the account is on. Changing the plan, the seats or the card is
              the owner&apos;s to do.
            </Notice>
          )}

          <Notice icon="info" title="What happens when a trial ends">
            The account becomes read only. Every screen, every record and every export stays
            available. Nothing new can be added until a plan is active, and nothing is ever
            deleted, because the CRA requires six years of records.
          </Notice>
        </div>
      </div>
    </section>
  );
}

/* Development only. Waiting fourteen real days to see what day 15 looks like
   is not a test plan, and the endpoint behind this is not registered outside
   development, so the buttons simply fail anywhere else. */
function DevSimulator({ onChange }: { onChange: (access: BillingStatus['access']) => void }) {
  const toast = useToast();
  if (process.env.NODE_ENV !== 'development') return null;

  const states = ['trial', 'expired', 'active', 'past_due', 'cancelled'] as const;

  return (
    <div className="setsec">
      <h3>Try the other states</h3>
      <p className="ssub">
        Development only. Moves this account between trial, expired, paid and failed so the
        read only behaviour can be checked without waiting two weeks.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {states.map((s) => (
          <button
            key={s}
            className="btn btn-sm"
            type="button"
            onClick={() =>
              void simulateBilling(s)
                .then((r) => {
                  onChange(r.access);
                  toast(`Now: ${s.replace('_', ' ')}.`);
                })
                .catch(() => toast('That only works in development.', 'err'))
            }
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>
    </div>
  );
}
