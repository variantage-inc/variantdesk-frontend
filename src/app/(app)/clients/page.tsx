'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ToastProvider, useToast } from '@/components/settings/toast';
import { ClientDrawer } from '@/components/invoices/client-drawer';
import { ApiError, listClients, type ClientList } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDate, money } from '@/lib/format';

/* Who pays you.

   Every figure on this screen is worked out from the invoices, never stored on
   the client, so a client's outstanding cannot drift away from the invoices
   underneath it. The sum of every client's outstanding is exactly the "owed to
   you" figure on the invoice list, reached from the other direction. If those
   two ever disagree, one of them is wrong. */

export function ClientsScreen() {
  const { access } = useSession();
  const toast = useToast();

  const [data, setData] = useState<ClientList | null>(null);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<{ id: string | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const canWrite = access?.canWrite === true;

  const load = useCallback(async () => {
    try {
      setData(await listClients(search.trim() || undefined));
      setProblem(null);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'We could not load your clients.');
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const currency = data?.currency ?? 'CAD';
  const fmt = data?.dateFormat ?? 'YYYY/MM/DD';

  return (
    <AppShell crumb="Clients">
      <div className="phead">
        <div>
          <h1>Clients</h1>
          <p className="sub">
            Who pays you, what they have been billed and what they still owe.
          </p>
        </div>
        <div className="acts">
          <Link className="btn btn-sm" href="/invoices">
            <Icon name="invoice" size={18} /> Invoices
          </Link>
          {canWrite && (
            <button className="btn btn-primary" type="button" onClick={() => setDrawer({ id: null })}>
              <Icon name="plus" size={19} /> Add a client
            </button>
          )}
        </div>
      </div>

      {problem && (
        <Notice tone="err" icon="alert">
          {problem}
        </Notice>
      )}

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat s-in">
          <div className="lbl">
            <Icon name="income" size={15} /> Billed in total
          </div>
          <div className="val">{money(data?.totals.billedCents ?? 0, currency)}</div>
          <div className="meta">Drafts excluded. A draft is not a debt yet</div>
        </div>
        <div className="stat s-in">
          <div className="lbl">
            <Icon name="wallet" size={15} /> Received
          </div>
          <div className="val">{money(data?.totals.paidCents ?? 0, currency)}</div>
          <div className="meta">Every payment recorded against an invoice</div>
        </div>
        <div className="stat s-out">
          <div className="lbl">
            <Icon name="invoice" size={15} /> Still owed
          </div>
          <div className="val">{money(data?.totals.outstandingCents ?? 0, currency)}</div>
          <div className="meta">The same figure as Owed to you on Invoices</div>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <div className="tf">
            <label htmlFor="c-search">Search</label>
            <input
              className="input"
              id="c-search"
              type="search"
              placeholder="Business, contact or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="spacer" />
        </div>

        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Client since</th>
                <th className="r">Billed</th>
                <th className="r">Received</th>
                <th className="r">Still owed</th>
                <th>Standing</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="ttl">
                      <Link href={`/clients/${c.id}`}>{c.name}</Link>
                    </div>
                    {c.draftCount > 0 && (
                      <div className="sub2">
                        {c.draftCount} draft{c.draftCount === 1 ? '' : 's'} not sent
                      </div>
                    )}
                  </td>
                  <td>
                    {c.contactName ?? <span className="muted">—</span>}
                    {c.email && <div className="sub2">{c.email}</div>}
                  </td>
                  <td className="date">{formatDate(c.since, fmt)}</td>
                  <td className="r">{money(c.billedCents, currency)}</td>
                  <td className="r">
                    {c.paidCents > 0 ? (
                      <span className="money-in">{money(c.paidCents, currency)}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="r">
                    {c.outstandingCents > 0 ? (
                      <span className="money-out">{money(c.outstandingCents, currency)}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <Standing client={c} />
                  </td>
                  <td>
                    <div className="rowacts">
                      <Link
                        href={`/clients/${c.id}`}
                        aria-label={`Open ${c.name}`}
                        style={{ display: 'grid', placeItems: 'center' }}
                      >
                        <Icon name="arrowRight" size={17} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {data && data.clients.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: '34px 16px' }}>
                    {search
                      ? `Nothing matching "${search}".`
                      : 'No clients yet. Add one here, or add one while recording income.'}
                  </td>
                </tr>
              )}

              {!data && (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: '34px 16px' }}>
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <span>
            Clients are the people who pay <b>you</b>. The companies you pay are vendors, and
            they live in Settings.
          </span>
        </div>
      </div>

      {drawer && (
        <ClientDrawer
          clientId={drawer.id}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            toast('Client saved.');
            void load();
          }}
        />
      )}
    </AppShell>
  );
}

/* Overdue first, because that is the only standing anybody acts on. */
function Standing({
  client,
}: {
  client: { overdueCount: number; outstandingCents: number; averageDaysToPay: number | null };
}) {
  if (client.overdueCount > 0) {
    return (
      <span className="pill p-late">
        {client.overdueCount} overdue
      </span>
    );
  }
  if (client.outstandingCents > 0) return <span className="pill p-sent">Awaiting payment</span>;
  if (client.averageDaysToPay !== null) {
    return (
      <span className="pill p-paid">
        Settles in {client.averageDaysToPay} day{client.averageDaysToPay === 1 ? '' : 's'}
      </span>
    );
  }
  return <span className="muted">Nothing billed yet</span>;
}

export default function ClientsPage() {
  return (
    <ToastProvider>
      <ClientsScreen />
    </ToastProvider>
  );
}
