'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ToastProvider, useToast } from '@/components/settings/toast';
import { ClientDrawer } from '@/components/invoices/client-drawer';
import { ApiError, archiveClient, getClient, type ClientDetail, type InvoiceStatus } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDate, money } from '@/lib/format';

/* One client: what they have been billed, what they have paid, and what they
   still owe.

   Every figure is derived from the invoices below it. Nothing about a balance
   is stored on the client, so the number at the top and the list underneath it
   cannot disagree. */

const STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'p-draft' },
  sent: { label: 'Sent', cls: 'p-sent' },
  part: { label: 'Partially paid', cls: 'p-part' },
  overdue: { label: 'Overdue', cls: 'p-late' },
  paid: { label: 'Paid', cls: 'p-paid' },
};

function Inner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { access } = useSession();
  const toast = useToast();

  const [data, setData] = useState<ClientDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const canWrite = access?.canWrite === true;

  /* A promise chain rather than an async function, so the state lands in a
     callback instead of synchronously in the effect body. Same behaviour,
     and it is the shape the React compiler can actually verify. */
  const load = useCallback(() => {
    getClient(id)
      .then((r) => {
        setData(r);
        setProblem(null);
      })
      .catch((err) =>
        setProblem(err instanceof ApiError ? err.message : 'We could not load that client.'),
      );
  }, [id]);

  useEffect(load, [load]);

  const currency = data?.currency ?? 'CAD';
  const fmt = data?.dateFormat ?? 'YYYY/MM/DD';
  const c = data?.client;
  const s = data?.stats;

  return (
    <AppShell crumb={c?.name ?? 'Client'}>
      <div className="phead">
        <div>
          <h1>{c?.name ?? 'Loading…'}</h1>
          <p className="sub">
            {c?.contactName && `${c.contactName} · `}
            Client since {c ? formatDate(c.since, fmt) : ''}
            {c && ` · terms Net ${c.paymentTermsDays ?? c.defaultTermsDays}`}
            {c && c.paymentTermsDays === null && ' (your usual)'}
          </p>
        </div>
        <div className="acts">
          <Link className="btn btn-sm" href="/clients">
            <Icon name="arrowLeft" size={18} /> All clients
          </Link>
          {canWrite && (
            <>
              <button className="btn btn-sm" type="button" onClick={() => setEditing(true)}>
                <Icon name="edit" size={18} /> Edit
              </button>
              <Link className="btn btn-primary" href={`/invoices/new?client=${id}`}>
                <Icon name="plus" size={19} /> New invoice
              </Link>
            </>
          )}
        </div>
      </div>

      {problem && (
        <Notice tone="err" icon="alert">
          {problem}
        </Notice>
      )}

      <div className="stats">
        <div className="stat s-in">
          <div className="lbl">
            <Icon name="income" size={15} /> Billed in total
          </div>
          <div className="val">{money(s?.billedCents ?? 0, currency)}</div>
          <div className="meta">
            {s?.invoiceCount ?? 0} invoice{s?.invoiceCount === 1 ? '' : 's'} sent
          </div>
        </div>
        <div className="stat s-in">
          <div className="lbl">
            <Icon name="wallet" size={15} /> Received
          </div>
          <div className="val">{money(s?.paidCents ?? 0, currency)}</div>
          <div className="meta">
            {s?.averageDaysToPay !== null && s?.averageDaysToPay !== undefined
              ? `Settles in about ${s.averageDaysToPay} days`
              : 'Nothing settled yet'}
          </div>
        </div>
        <div className="stat s-out">
          <div className="lbl">
            <Icon name="invoice" size={15} /> Still owed
          </div>
          <div className="val">{money(s?.outstandingCents ?? 0, currency)}</div>
          <div className="meta">
            {s?.overdueCount ? (
              <span className="dn">
                {s.overdueCount} overdue
              </span>
            ) : (
              'Nothing overdue'
            )}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">
            <Icon name="edit" size={15} /> In draft
          </div>
          <div className="val">{money(s?.draftCents ?? 0, currency)}</div>
          <div className="meta">
            {s?.draftCount ? `${s.draftCount} not yet sent` : 'No drafts'}
          </div>
        </div>
      </div>

      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Invoice history</h2>
              <p className="csub">
                Every invoice raised for {c?.name}, newest first. Drafts are shown but do not
                count towards what they owe.
              </p>
            </div>
          </div>

          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice</th>
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
                    <td className="date">{formatDate(i.issueDate, fmt)}</td>
                    <td className="date">
                      {i.status === 'draft' ? (
                        <span className="muted">Not sent</span>
                      ) : i.status === 'paid' ? (
                        <span className="muted">—</span>
                      ) : (
                        formatDate(i.dueDate, fmt)
                      )}
                    </td>
                    <td>
                      <span className={`pill ${STATUS[i.status].cls}`}>
                        {STATUS[i.status].label}
                      </span>
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
                          style={{ display: 'grid', placeItems: 'center' }}
                        >
                          <Icon name="eye" size={17} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}

                {data && data.invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: '30px 16px' }}>
                      Nothing invoiced yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rail">
          <div className="railcard">
            <h3>Contact</h3>
            <div style={{ display: 'grid', gap: 10, fontSize: 'var(--fs-label)' }}>
              {c?.contactName && <div>{c.contactName}</div>}
              {c?.email && <div className="muted">{c.email}</div>}
              {c?.phone && <div className="muted">{c.phone}</div>}
              {c?.addressLine1 && (
                <address style={{ fontStyle: 'normal', color: 'var(--ink-3)', lineHeight: 1.6 }}>
                  {c.addressLine1}
                  {c.addressLine2 && (
                    <>
                      <br />
                      {c.addressLine2}
                    </>
                  )}
                  <br />
                  {[c.city, c.province, c.postalCode].filter(Boolean).join(' ')}
                </address>
              )}
              {!c?.addressLine1 && (
                <p className="hint" style={{ margin: 0 }}>
                  No billing address yet. The CRA wants one on any invoice of $30 or more.
                </p>
              )}
            </div>
            {c?.notes && (
              <p className="hint" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>
                {c.notes}
              </p>
            )}
          </div>

          <div className="railcard">
            <h3>Payments received</h3>
            {data && data.payments.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>
                Nothing received yet.
              </p>
            )}
            <div className="paylist">
              {data?.payments.slice(0, 8).map((p) => (
                <div key={p.id} className="payrow">
                  <span>
                    <b>{money(p.amountCents, currency)}</b>
                    <br />
                    <span className="muted" style={{ fontSize: 13 }}>
                      <Link href={`/invoices/${p.invoiceId}`}>{p.invoiceNumber}</Link> ·{' '}
                      {formatDate(p.date, fmt)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {canWrite && s?.outstandingCents === 0 && (
            <div className="railcard">
              <h3>Archive</h3>
              <p className="hint" style={{ margin: '0 0 12px' }}>
                Takes them out of the dropdowns. Their invoices stay exactly as they are, which
                is what the six year rule requires.
              </p>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  void archiveClient(id)
                    .then(() => {
                      toast(`${c?.name} archived.`);
                      void load();
                    })
                    .catch((err) =>
                      toast(err instanceof ApiError ? err.message : 'That did not work.', 'err'),
                    )
                }
              >
                Archive this client
              </button>
            </div>
          )}

          <Notice icon="shield" title="These figures are worked out, not stored">
            Billed, received and still owed all come from the invoices in this list every time
            the page loads, so a client&apos;s balance can never drift away from the invoices
            underneath it.
          </Notice>
        </div>
      </div>

      {editing && (
        <ClientDrawer
          clientId={id}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast('Client saved.');
            void load();
          }}
        />
      )}
    </AppShell>
  );
}

export default function ClientDetailPage() {
  return (
    <ToastProvider>
      <Inner />
    </ToastProvider>
  );
}
