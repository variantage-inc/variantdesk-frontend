'use client';

import { useEffect, useState } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  adminAudit,
  adminBusiness,
  adminBusinesses,
  adminMetrics,
  adminPayments,
  type AdminBusiness,
  type AdminBusinessDetail,
  type AdminMetrics,
  type AdminPayment,
  type AuditEntry,
} from '@/lib/api';
import { formatDate, formatDateTime, price } from '@/lib/format';

/* The Variantage side of the product.

   Read only, deliberately. This version answers three questions: who is on the
   system, what are they paying, and what has failed. It does not let staff
   change a customer's books, because a support tool that can quietly edit
   somebody's accounts is a liability the moment there is a dispute about a
   figure.

   Every read here crosses a tenant boundary, so every read is recorded. The
   audit tab shows that log back to the people using it, which is the point:
   staff can see who else has been looking at what. */

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'businesses', label: 'Businesses' },
  { key: 'payments', label: 'Payments' },
  { key: 'audit', label: 'Access log' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const STATE_PILL: Record<string, string> = {
  trial: 'p-sent',
  active: 'p-paid',
  past_due: 'p-late',
  expired: 'p-draft',
  cancelled: 'p-draft',
  none: 'p-draft',
};

const STATE_LABEL: Record<string, string> = {
  trial: 'On trial',
  active: 'Paying',
  past_due: 'Payment failed',
  expired: 'Trial ended',
  cancelled: 'Cancelled',
  none: 'No plan',
};

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [detail, setDetail] = useState<AdminBusinessDetail | null>(null);
  const [search, setSearch] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([adminMetrics(), adminBusinesses()])
      .then(([m, b]) => {
        setMetrics(m);
        setBusinesses(b.businesses);
      })
      .catch(() => setProblem('We could not load the panel.'));
  }, []);

  useEffect(() => {
    if (tab === 'payments' && payments.length === 0) {
      adminPayments().then((r) => setPayments(r.payments)).catch(() => undefined);
    }
    if (tab === 'audit') {
      adminAudit().then((r) => setAudit(r.entries)).catch(() => undefined);
    }
  }, [tab, payments.length]);

  function open(id: string) {
    setDetail(null);
    adminBusiness(id)
      .then(setDetail)
      .catch(() => setProblem('We could not open that account.'));
  }

  const shown = businesses.filter((b) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      b.name.toLowerCase().includes(q) ||
      (b.ownerEmail ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="phead">
        <div>
          <h1>Superadmin</h1>
          <p className="sub">
            Every business on Variantage, what they are paying, and what has failed. Read only.
          </p>
        </div>
      </div>

      {problem && (
        <Notice tone="err" icon="alert">
          {problem}
        </Notice>
      )}

      <div className="statustabs" style={{ padding: '0 0 18px' }} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className={tab === t.key ? 'on' : undefined}
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setDetail(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && metrics && <Overview metrics={metrics} />}

      {tab === 'businesses' && (
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Businesses</h2>
              <p className="csub">{businesses.length} on the system.</p>
            </div>
            <div className="acts">
              <div className="tf">
                <label htmlFor="asearch">Search</label>
                <input
                  className="input"
                  id="asearch"
                  type="search"
                  placeholder="Business or owner email"
                  value={search}
                  style={{ height: 44, minWidth: 240 }}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Owner</th>
                  <th>Plan</th>
                  <th className="r">Seats</th>
                  <th className="r">Monthly</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="stack">
                        <span className="ttl">{b.name}</span>
                        <small>
                          {b.province} · since {formatDate(b.createdAt)}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="stack">
                        <span>{b.ownerName ?? '—'}</span>
                        <small>{b.ownerEmail ?? '—'}</small>
                      </div>
                    </td>
                    <td>{b.planName}</td>
                    <td className="r">
                      {b.seatsUsed} / {b.seatsPaid}
                    </td>
                    <td className="r">{b.monthlyCents ? price(b.monthlyCents) : '—'}</td>
                    <td>
                      <span className={`pill ${STATE_PILL[b.state] ?? 'p-draft'}`}>
                        {STATE_LABEL[b.state] ?? b.state}
                      </span>
                    </td>
                    <td>
                      <span className="rowacts">
                        <button type="button" aria-label={`Open ${b.name}`} onClick={() => open(b.id)}>
                          <Icon name="arrowRight" size={17} />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <span>
              Opening an account is recorded in the access log with your name and the time.
            </span>
          </div>
        </div>
      )}

      {tab === 'businesses' && detail && <Detail detail={detail} onClose={() => setDetail(null)} />}

      {tab === 'payments' && (
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Payments</h2>
              <p className="csub">
                Everything Stripe has told us about, newest first. Written by webhook, never by
                hand.
              </p>
            </div>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Business</th>
                  <th>Description</th>
                  <th className="r">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="date">{formatDate(p.paidAt ?? p.createdAt)}</td>
                    <td className="ttl">{p.businessName}</td>
                    <td>{p.description ?? 'Subscription'}</td>
                    <td className="r">{price(p.amountCents, p.currency.toUpperCase())}</td>
                    <td>
                      <span className={`pill ${p.status === 'PAID' ? 'p-paid' : 'p-late'}`}>
                        {p.status === 'PAID' ? 'Paid' : 'Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: '26px 16px' }}>
                      No payments yet. Stripe has not been given keys in this environment, so
                      nothing has been charged.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Access log</h2>
              <p className="csub">
                Every time a member of staff read across a tenant boundary. This is the price of
                a panel that can see everybody.
              </p>
            </div>
          </div>
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Did what</th>
                  <th>To which account</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td className="date">{formatDateTime(e.createdAt)}</td>
                    <td className="ttl">{e.actor}</td>
                    <td>{e.action}</td>
                    <td className="muted">{e.businessId ?? e.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function Overview({ metrics }: { metrics: AdminMetrics }) {
  return (
    <>
      <div className="stats">
        <div className="stat s-in">
          <div className="lbl">Monthly revenue</div>
          <div className="val">{price(metrics.monthlyCents)}</div>
          <div className="meta">
            {metrics.paying} paying · {metrics.seatsPaid} extra seats
          </div>
        </div>
        <div className="stat s-tax">
          <div className="lbl">Collected this month</div>
          <div className="val">{price(metrics.collectedThisMonthCents)}</div>
          <div className="meta">
            {metrics.failedThisMonth > 0 ? (
              <span className="dn">{metrics.failedThisMonth} failed</span>
            ) : (
              'Nothing failed'
            )}
          </div>
        </div>
        <div className="stat s-draw">
          <div className="lbl">On trial</div>
          <div className="val">{metrics.trialing}</div>
          <div className="meta">Not counted as revenue</div>
        </div>
        <div className="stat s-out">
          <div className="lbl">Needs attention</div>
          <div className="val">{metrics.pastDue}</div>
          <div className="meta">Payment failed, account read only</div>
        </div>
      </div>

      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Who is on what</h2>
              <p className="csub">
                Counted from accounts being billed. A trial is not revenue until it converts.
              </p>
            </div>
          </div>
          <div className="setbody">
            <div className="rows">
              {metrics.byPlan.map((p) => (
                <div key={p.id} className="rowitem">
                  <span className="nm">{p.name}</span>
                  <span className="ct">
                    {p.count} {p.count === 1 ? 'business' : 'businesses'}
                  </span>
                </div>
              ))}
              <div className="rowitem">
                <span className="nm">Cancelled</span>
                <span className="ct">{metrics.cancelled}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rail">
          <div className="prev">
            <h4>The system</h4>
            <div className="big">{metrics.businesses}</div>
            <div className="then">
              businesses · {metrics.users} people
            </div>
            <div className="quote">
              <b>The most any account can pay</b>
              <span>
                {price(5000)} a month. That is 360 Solutions with two extra people. There is no
                platform fee and no setup fee.
              </span>
            </div>
          </div>

          <Notice icon="shield" title="Why this panel cannot edit anything">
            A support tool that can quietly change somebody&apos;s books is a liability the
            moment there is a dispute about a figure. Everything here reads; nothing writes.
          </Notice>
        </div>
      </div>
    </>
  );
}

function Detail({ detail, onClose }: { detail: AdminBusinessDetail; onClose: () => void }) {
  const { business, access, members, pendingInvites, payments } = detail;

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="chead">
        <div>
          <h2>{business.name}</h2>
          <p className="csub">
            {business.legalName && business.legalName !== business.name
              ? `${business.legalName} · `
              : ''}
            {business.province} · {business.currency} ·{' '}
            {business.gstRegistered ? 'GST/HST registered' : 'Not registered for GST/HST'} · since{' '}
            {formatDate(business.createdAt)}
          </p>
        </div>
        <div className="acts">
          <button className="btn btn-sm" type="button" onClick={onClose}>
            <Icon name="x" size={17} /> Close
          </button>
        </div>
      </div>

      <div className="setbody">
        <div className="setsec">
          <h3>Plan</h3>
          <div className="rows">
            <div className="rowitem">
              <span className="nm">{access.planName}</span>
              <span className={`pill ${STATE_PILL[access.state] ?? 'p-draft'}`}>
                {STATE_LABEL[access.state] ?? access.state}
              </span>
              <span className="ct">
                {access.state === 'trial' && access.trialEndsAt
                  ? `Trial ends ${formatDate(access.trialEndsAt)}`
                  : access.currentPeriodEnd
                    ? `Renews ${formatDate(access.currentPeriodEnd)}`
                    : 'No renewal date'}
              </span>
              <span className="ct">
                {access.state === 'active' || access.state === 'past_due'
                  ? `${price(access.monthlyCents)} a month`
                  : 'Not being billed'}
              </span>
            </div>
          </div>
        </div>

        <div className="setsec">
          <h3>People</h3>
          <p className="ssub">
            {members.length} on the account, {access.extraSeats} extra{' '}
            {access.extraSeats === 1 ? 'seat' : 'seats'} paid for.
          </p>
          <div className="rows">
            {members.map((m) => (
              <div key={m.id} className="rowitem">
                <span className="nm">
                  {m.name}
                  <br />
                  <span className="ct" style={{ fontWeight: 400 }}>
                    {m.email} · signs in with {m.signInMethod}
                  </span>
                </span>
                <span className={m.role === 'OWNER' ? 'tag tag-lock' : 'ct'}>
                  {m.role === 'OWNER' ? 'Owner' : 'Member'}
                </span>
                <span className="ct">
                  {m.lastLoginAt ? `Last in ${formatDate(m.lastLoginAt)}` : 'Never signed in'}
                </span>
              </div>
            ))}
            {pendingInvites.map((i) => (
              <div key={i.email} className="rowitem" style={{ opacity: 0.7 }}>
                <span className="nm">{i.email}</span>
                <span className="ct">Invited, expires {formatDate(i.expiresAt)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="setsec">
          <h3>Payments</h3>
          {payments.length === 0 ? (
            <p className="hint">Nothing charged yet.</p>
          ) : (
            <div className="tblwrap">
              <table className="tbl mini">
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
          )}
        </div>
      </div>
    </div>
  );
}
