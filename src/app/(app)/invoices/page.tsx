'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ApiError, listInvoices, type InvoiceList, type InvoiceStatus } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDate, money } from '@/lib/format';

/* The invoice list, as revised in the September review.

   Two money columns only, Total and Received. The HST breakdown and the
   still-owed column came off: the list is for finding an invoice, and the
   arithmetic belongs on the invoice itself where the payments are.

   Three actions per row, view, edit and download. Recording a payment is NOT
   one of them. It lives on the invoice, where the balance and the payment
   history are already in front of you, which is the only place somebody can
   check the figure before typing it.

   Status is never stored. The API works it out from the payments and the due
   date, so the pill, the tab counts and the summary above are all reading the
   same thing and cannot disagree. */

const STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'p-draft' },
  sent: { label: 'Sent', cls: 'p-sent' },
  part: { label: 'Partially paid', cls: 'p-part' },
  overdue: { label: 'Overdue', cls: 'p-late' },
  paid: { label: 'Paid', cls: 'p-paid' },
};

const TABS: ('all' | InvoiceStatus)[] = ['all', 'draft', 'sent', 'part', 'overdue', 'paid'];

export default function InvoicesPage() {
  const { access } = useSession();
  const [data, setData] = useState<InvoiceList | null>(null);
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all');
  const [search, setSearch] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const canWrite = access?.canWrite === true;

  const load = useCallback(async () => {
    try {
      setData(await listInvoices({ status, search: search.trim() || undefined }));
      setProblem(null);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'We could not load your invoices.');
    }
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const currency = data?.currency ?? 'CAD';
  const fmt = data?.dateFormat ?? 'YYYY/MM/DD';
  const s = data?.summary;

  return (
    <AppShell crumb="Invoices">
      <div className="phead">
        <div>
          <h1>Invoices</h1>
          <p className="sub">What you have billed, and what is still owed.</p>
        </div>
        <div className="acts">
          <Link className="btn btn-sm" href="/clients">
            <Icon name="users" size={18} /> Clients
          </Link>
          {canWrite && (
            <Link className="btn btn-primary" href="/invoices/new">
              <Icon name="plus" size={19} /> New invoice
            </Link>
          )}
        </div>
      </div>

      {problem && (
        <Notice tone="err" icon="alert">
          {problem}
        </Notice>
      )}

      <div className="stats">
        <div className="stat s-out">
          <div className="lbl">
            <Icon name="invoice" size={15} /> Owed to you
          </div>
          <div className="val">{money(s?.owedCents ?? 0, currency)}</div>
          <div className="meta">
            {s?.owedCount ?? 0} awaiting payment · amounts include tax
          </div>
        </div>
        <div className="stat s-out">
          <div className="lbl">
            <Icon name="alert" size={15} /> Overdue
          </div>
          <div className="val">{money(s?.lateCents ?? 0, currency)}</div>
          <div className="meta">
            {s?.lateCount
              ? `${s.lateCount} invoice${s.lateCount === 1 ? '' : 's'} · oldest ${-s.oldestLateDays} days past due`
              : 'Nothing overdue'}
          </div>
        </div>
        <div className="stat s-in">
          <div className="lbl">
            <Icon name="wallet" size={15} /> Received
          </div>
          <div className="val">
            {money(
              (data?.invoices ?? []).reduce((n, i) => n + i.paidCents, 0),
              currency,
            )}
          </div>
          <div className="meta">Across the invoices shown</div>
        </div>
        <div className="stat">
          <div className="lbl">
            <Icon name="edit" size={15} /> In draft
          </div>
          <div className="val">{money(s?.draftCents ?? 0, currency)}</div>
          <div className="meta">
            {s?.draftCount ? `${s.draftCount} not yet sent to the client` : 'No drafts'}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="statustabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={status === t}
              className={status === t ? 'on' : undefined}
              onClick={() => setStatus(t)}
            >
              {t === 'all' ? 'All invoices' : STATUS[t].label}
              <span className="n">{data?.counts[t] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="toolbar">
          <div className="tf">
            <label htmlFor="f-search">Search</label>
            <input
              className="input"
              id="f-search"
              type="search"
              placeholder="Invoice number or client"
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
                <th>Invoice</th>
                <th>Client</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                <th className="r">Total</th>
                <th className="r">Received</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.invoices.map((i) => (
                <tr key={i.id}>
                  <td className="date">
                    <div className="ttl">{i.number}</div>
                  </td>
                  <td>
                    <Link href={`/clients/${i.client.id}`}>{i.client.name}</Link>
                  </td>
                  <td className="date">{formatDate(i.issueDate, fmt)}</td>
                  <td className="date">
                    <DueCell invoice={i} fmt={fmt} />
                  </td>
                  <td>
                    <span className={`pill ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
                  </td>
                  <td className="r">{money(i.totalCents, currency)}</td>
                  <td className="r">
                    {i.paidCents > 0 ? (
                      <span className="money-in">{money(i.paidCents, currency)}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <div className="rowacts">
                      <Link
                        href={`/invoices/${i.id}`}
                        aria-label={`Open ${i.number}`}
                        title="Open the invoice"
                        style={{ display: 'grid', placeItems: 'center' }}
                      >
                        <Icon name="eye" size={17} />
                      </Link>
                      {canWrite && i.paidCents === 0 && (
                        <Link
                          href={`/invoices/${i.id}/edit`}
                          aria-label={`Edit ${i.number}`}
                          title="Edit the invoice"
                          style={{ display: 'grid', placeItems: 'center' }}
                        >
                          <Icon name="edit" size={17} />
                        </Link>
                      )}
                      <Link
                        href={`/invoices/${i.id}?print=1`}
                        aria-label={`Download ${i.number}`}
                        title="Download or print"
                        style={{ display: 'grid', placeItems: 'center' }}
                      >
                        <Icon name="download" size={17} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {data && data.invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: '34px 16px' }}>
                    {search || status !== 'all'
                      ? 'Nothing matches. Try another status or clear the search.'
                      : 'No invoices yet. The template already has your numbering, terms and footer, so there is very little to fill in.'}
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
            {data ? `${data.total} ${data.total === 1 ? 'invoice' : 'invoices'}` : ''}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Notice icon="info" title="Income is posted when an invoice is paid, not when it is sent">
          Sending an invoice creates a debt, not revenue. Recording the payment on the invoice
          writes the income entry for you, linked back here, which is what stops the same money
          being counted twice.
        </Notice>
      </div>
    </AppShell>
  );
}

/* A settled invoice has no due date worth showing. The day it was due stopped
   mattering the moment it was paid. */
function DueCell({
  invoice,
  fmt,
}: {
  invoice: { status: InvoiceStatus; dueDate: string; daysToDue: number };
  fmt: 'YYYY/MM/DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
}) {
  if (invoice.status === 'draft') return <span className="muted">Not sent</span>;
  if (invoice.status === 'paid') return <span className="muted">—</span>;

  return (
    <>
      {formatDate(invoice.dueDate, fmt)}
      {invoice.daysToDue < 0 ? (
        <div className="sub2" style={{ color: 'var(--red-600)', fontWeight: 600 }}>
          {-invoice.daysToDue} days late
        </div>
      ) : (
        <div className="sub2">
          {invoice.daysToDue === 0 ? 'due today' : `in ${invoice.daysToDue} days`}
        </div>
      )}
    </>
  );
}
