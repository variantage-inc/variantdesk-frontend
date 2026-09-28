'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './icon';
import { useSession } from '@/lib/session';
import { initials, days } from '@/lib/format';
import { findProvince } from '@/lib/tax';

/* The frame every signed in screen sits inside.

   Taken from app.js in the mockups, with the same navigation, the same order
   and the same wording. Two things it does that the mockup could not:

   The screens that do not exist yet are marked and do not navigate. A sidebar
   full of links to blank pages is worse than a sidebar that says which parts
   are still being built, and the client is reviewing this while it is half
   finished.

   The access banner sits above everything. When a trial is running out, or an
   account has gone read only, that has to be visible on every screen rather
   than only on the one that happens to mention billing. */

type NavItem = { id: string; label: string; icon: IconName; href: string; phase?: string };
type NavEntry = { section: string } | NavItem;

/* Owner drawings deliberately has no menu item. Per the reviewed scope it is a
   category inside Expenses, so there is one place to record money going out. */
const NAV: NavEntry[] = [
  { section: 'Overview' },
  { id: 'dashboard', label: 'Dashboard', icon: 'grid', href: '/dashboard' },
  { section: 'Money in and out' },
  { id: 'income', label: 'Income', icon: 'income', href: '/income' },
  { id: 'expenses', label: 'Expenses', icon: 'expense', href: '/expenses' },
  { id: 'voice', label: 'Voice entry', icon: 'mic', href: '/voice' },
  { section: 'Getting paid' },
  { id: 'invoices', label: 'Invoices', icon: 'invoice', href: '/invoices' },
  { id: 'clients', label: 'Clients', icon: 'users', href: '/clients' },
  { section: 'Records' },
  { id: 'receipts', label: 'Receipts', icon: 'receipt', href: '/receipts' },
  { id: 'reports', label: 'Reports', icon: 'chart', href: '/reports' },
  { section: 'Setup' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/settings' },
];

const isItem = (e: NavEntry): e is NavItem => 'id' in e;

export function AppShell({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  const { user, business, access } = useSession();
  const pathname = usePathname();
  const tax = findProvince(business?.province ?? 'ON');

  return (
    <>
      <aside className="side">
        <div className="side-brand">
          <Link href="/dashboard">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wordmark-white.svg" alt="Variantage Finance" />
          </Link>
        </div>

        <nav className="side-nav">
          {NAV.map((entry) =>
            isItem(entry) ? (
              entry.phase ? (
                /* Not a link. A menu item that goes to a blank page reads as a
                   broken product; one that says which phase it belongs to
                   reads as one being built in order. */
                <span
                  key={entry.id}
                  className="nav-item"
                  style={{ opacity: 0.45, cursor: 'default' }}
                  title={`${entry.label} arrives in ${entry.phase}`}
                >
                  <Icon name={entry.icon} size={20} sw={1.9} />
                  <span>{entry.label}</span>
                  <span className="badge" style={{ background: 'rgba(255,255,255,.14)' }}>
                    soon
                  </span>
                </span>
              ) : (
                <Link
                  key={entry.id}
                  className={`nav-item${pathname.startsWith(entry.href) ? ' on' : ''}`}
                  href={entry.href}
                >
                  <Icon name={entry.icon} size={20} sw={1.9} />
                  <span>{entry.label}</span>
                </Link>
              )
            ) : (
              <div key={entry.section} className="nav-sec">
                {entry.section}
              </div>
            ),
          )}
        </nav>

        <div className="side-foot">
          {business?.name}
          <br />
          <span style={{ opacity: 0.7 }}>
            {tax?.name} · {tax?.rate}
          </span>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <div className="crumb">
            {business?.name} <span style={{ opacity: 0.5 }}>/</span> <b>{crumb}</b>
          </div>

          {/* No global search box: each list screen has its own search, and a
              box here that did nothing would be worse than none. */}
          <div style={{ flex: 1 }} />

          {/* Staff only. The API refuses /api/admin to everyone else, so this
              is a way in, not a guard. */}
          {user?.platformRole === 'SUPERADMIN' && (
            <Link className="btn btn-sm" href="/admin" style={{ marginRight: 10 }}>
              Superadmin
            </Link>
          )}

          <Link
            className="iconbtn"
            href="/settings#billing"
            aria-label="Plan and billing"
            title="Plan and billing"
          >
            <Icon name="card" size={21} sw={1.9} />
          </Link>

          <div className="who">
            <span className="av">{initials(user?.firstName ?? '', user?.lastName ?? '')}</span>
            <span>
              <span className="nm">
                {user?.firstName} {user?.lastName}
              </span>
              <br />
              <span className="bz">{user?.role === 'OWNER' ? 'Owner' : 'Member'}</span>
            </span>
          </div>
        </header>

        <div className="body">
          {access && <AccessBanner />}
          {children}
        </div>
      </div>
    </>
  );
}

/* One line, on every screen, whenever the account is not simply paid up.

   Silent when a subscription is active and when the trial has more than five
   days left, because a banner shown every day for a fortnight stops being
   read by the time it matters. */
function AccessBanner() {
  const { access, user } = useSession();
  if (!access) return null;

  const owner = user?.role === 'OWNER';

  if (access.state === 'trial') {
    const left = access.trialDaysLeft ?? 0;
    if (left > 5) return null;
    return (
      <div className="notice notice-warn" style={{ marginBottom: 18 }}>
        <Icon name="clock" size={22} />
        <span>
          <b>
            {left <= 0
              ? 'Your free trial ends today'
              : `Your free trial ends in ${days(left)}`}
          </b>
          {owner ? (
            <>
              After that the account stays readable and exportable, but nothing new can be
              added. <Link href="/settings#billing">Choose a plan</Link> to keep going.
            </>
          ) : (
            'After that the account stays readable and exportable, but nothing new can be added. The account owner can choose a plan.'
          )}
        </span>
      </div>
    );
  }

  if (access.state === 'past_due') {
    return (
      <div className="notice notice-err" style={{ marginBottom: 18 }}>
        <Icon name="alert" size={22} />
        <span>
          <b>Your last payment did not go through</b>
          The account is read only until it is settled. Everything you have is still here to
          view and export.{' '}
          {owner && <Link href="/settings#billing">Update your card</Link>}
        </span>
      </div>
    );
  }

  if (access.state === 'expired' || access.state === 'cancelled' || access.state === 'none') {
    return (
      <div className="notice notice-err" style={{ marginBottom: 18 }}>
        <Icon name="lock" size={22} />
        <span>
          <b>
            {access.state === 'cancelled'
              ? 'Your subscription has ended'
              : 'Your free trial has ended'}
          </b>
          The account is read only. Everything you have is still here to view and export, and
          nothing has been deleted.{' '}
          {owner && <Link href="/settings#billing">Choose a plan to start adding again</Link>}
        </span>
      </div>
    );
  }

  return null;
}
