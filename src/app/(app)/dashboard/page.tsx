'use client';

import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icon';
import { useSession } from '@/lib/session';
import { days, price } from '@/lib/format';

/* The dashboard proper is Phase 7, and it cannot be built before there are
   income, expenses and invoices for it to derive from. Every figure on it is
   worked out from entries, so building it now would mean building it twice.

   What stands here instead is a start page: what the account is on, what has
   been set up, and the one thing worth doing next. It is honest about being
   unfinished rather than showing sample figures somebody might believe. */
export default function DashboardPage() {
  const { user, business, access } = useSession();

  return (
    <AppShell crumb="Dashboard">
      <div className="phead">
        <div>
          <h1>Good to see you, {user?.firstName}</h1>
          <p className="sub">
            {business?.name} · This is where the dashboard will be once there are entries to
            work it out from.
          </p>
        </div>
      </div>

      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>What is working today</h2>
              <p className="csub">
                The product is being built in order, and the order is deliberate: the screens
                everything else reads from come first.
              </p>
            </div>
          </div>

          <div className="setbody">
            <div className="setsec">
              <h3>Ready now</h3>
              <p className="ssub">Built, tested and yours to use.</p>
              <ul className="rules" style={{ marginTop: 0 }}>
                {[
                  'Your account, your password and the 15 minute idle sign out',
                  'Your plan, your free trial and the people on the account',
                  'Settings: business, tax, invoice template, categories and vendors',
                ].map((line) => (
                  <li key={line} className="ok">
                    <span className="rd">
                      <Icon name="check" size={12} sw={3.4} />
                    </span>{' '}
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="setsec">
              <h3>Being built next</h3>
              <p className="ssub">
                Marked in the sidebar so nothing there is a link to an empty page.
              </p>
              <ul className="rules" style={{ marginTop: 0 }}>
                {[
                  'Income, expenses and owner drawings',
                  'Clients and invoicing, with payments recorded on the invoice',
                  'This dashboard, receipts, reports and voice entry',
                ].map((line) => (
                  <li key={line}>
                    <span className="rd" /> {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="setsec">
              <h3>Worth doing first</h3>
              <p className="ssub">
                Settings is the screen every later screen quotes. Filling it in now means the
                first invoice you send is already right.
              </p>
              <Link className="btn btn-primary" href="/settings">
                <Icon name="settings" size={18} /> Open Settings
              </Link>
            </div>
          </div>
        </div>

        <div className="rail">
          <div className="prev">
            <h4>Your plan</h4>
            <div className="big">{access?.planName}</div>
            <div className="then">
              {access?.state === 'trial'
                ? `Free trial, ${days(access.trialDaysLeft)} left`
                : access?.state === 'active'
                  ? `${price(access.monthlyCents)} a month`
                  : 'Read only until a plan is chosen'}
            </div>
            <div className="quote">
              <b>What you will pay</b>
              <span>
                {price(access?.monthlyCents ?? 0)} a month
                {access && access.extraSeats > 0
                  ? `, including ${access.extraSeats} extra ${access.extraSeats === 1 ? 'person' : 'people'}`
                  : ''}
              </span>
            </div>
          </div>

          <div className="notice notice-info" style={{ margin: 0 }}>
            <Icon name="info" size={22} />
            <span>
              <b>Nothing here is sample data</b>
              Every figure this product shows will be worked out from entries you have made.
              Until there are some, there is nothing to show, and inventing numbers on a
              bookkeeping screen would be the wrong habit to start.
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
