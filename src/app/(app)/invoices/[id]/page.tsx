'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ToastProvider, useToast } from '@/components/settings/toast';
import { PaymentDrawer } from '@/components/invoices/payment-drawer';
import {
  ApiError,
  getInvoice,
  removePayment,
  sendInvoice,
  voidInvoice,
  type Invoice,
  type InvoiceStatus,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDate, formatDateTime, money } from '@/lib/format';

/* The invoice document.

   What is on screen is exactly what the client receives and exactly what
   prints. The rail beside it does not print, which is what the noprint class
   in the foundation stylesheet is for, so Ctrl+P produces the document and
   nothing else. That is also the PDF: the browser's own print to PDF, which is
   what the approved mockup does, and it means the file the client gets is the
   same thing the owner is looking at.

   Every figure on it was stored when the invoice was raised. Nothing here is
   re-derived from today's settings, so a business that has since moved
   premises does not silently reprint last year's invoices with the new
   address. */

const STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'p-draft' },
  sent: { label: 'Sent', cls: 'p-sent' },
  part: { label: 'Partially paid', cls: 'p-part' },
  overdue: { label: 'Overdue', cls: 'p-late' },
  paid: { label: 'Paid', cls: 'p-paid' },
};

const METHOD: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  E_TRANSFER: 'e-Transfer',
  CHEQUE: 'Cheque',
  CASH: 'Cash',
  CARD: 'Card',
  PRE_AUTHORISED: 'Pre-authorised',
  OTHER: 'Other',
};

function Inner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = params.id;
  const { access } = useSession();
  const toast = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canWrite = access?.canWrite === true;

  const load = useCallback(() => {
    getInvoice(id)
      .then((r) => {
        setInvoice(r.invoice);
        setProblem(null);
      })
      .catch((err) =>
        setProblem(err instanceof ApiError ? err.message : 'We could not load that invoice.'),
      );
  }, [id]);

  useEffect(load, [load]);

  /* Arriving from the download button in the list opens the print dialog once
     the document is on screen. */
  useEffect(() => {
    if (invoice && search.get('print') === '1') {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [invoice, search]);

  async function act(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await work();
      toast(done);
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That did not work.', 'err');
    } finally {
      setBusy(false);
    }
  }

  if (problem) {
    return (
      <AppShell crumb="Invoice">
        <Notice tone="err" icon="alert">
          {problem}
        </Notice>
      </AppShell>
    );
  }

  if (!invoice) {
    return (
      <AppShell crumb="Invoice">
        <p className="hint">Loading…</p>
      </AppShell>
    );
  }

  const currency = 'CAD';
  const status = STATUS[invoice.status];

  return (
    <AppShell crumb={invoice.number}>
      <div className="phead noprint">
        <div>
          <h1>Invoice {invoice.number}</h1>
          <p className="sub">
            This is exactly what your client receives, and exactly what prints.
          </p>
        </div>
        <div className="acts">
          <Link className="btn btn-sm" href="/invoices">
            <Icon name="arrowLeft" size={18} /> All invoices
          </Link>
        </div>
      </div>

      <div className="doc-grid">
        {/* ------------------------------------------- the document itself --- */}
        <div className="doc">
          <div className="doc-head">
            <div className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/wordmark.svg" alt="Variantage" />
              <address>
                <b>{invoice.seller.name}</b>
                {invoice.seller.address && (
                  <>
                    <br />
                    {invoice.seller.address.split('\n').map((line) => (
                      <span key={line}>
                        {line}
                        <br />
                      </span>
                    ))}
                  </>
                )}
                {invoice.seller.email && (
                  <>
                    {invoice.seller.email}
                    <br />
                  </>
                )}
                {invoice.seller.phone}
              </address>
            </div>
            <div className="meta">
              <h1>Invoice</h1>
              <div className="no">{invoice.number}</div>
              <span className={`pill ${status.cls}`}>{status.label}</span>
            </div>
          </div>

          <div className="doc-parties">
            <div>
              <h3>Billed to</h3>
              <address>
                <b>{invoice.billTo.name}</b>
                {invoice.billTo.contact && (
                  <>
                    <br />
                    {invoice.billTo.contact}
                  </>
                )}
                {invoice.billTo.address && (
                  <>
                    <br />
                    {invoice.billTo.address.split('\n').map((line) => (
                      <span key={line}>
                        {line}
                        <br />
                      </span>
                    ))}
                  </>
                )}
              </address>
            </div>
            <div className="doc-dates">
              <div>
                <b>Invoice date</b>
                <span>{formatDate(invoice.issueDate)}</span>
              </div>
              <div>
                <b>Payment due</b>
                <span>{formatDate(invoice.dueDate)}</span>
              </div>
              <div>
                <b>Terms</b>
                <span>
                  {invoice.paymentTermsDays === 0
                    ? 'Due on receipt'
                    : `Net ${invoice.paymentTermsDays}`}
                </span>
              </div>
            </div>
          </div>

          <table className="doc-lines">
            <thead>
              <tr>
                <th>Description</th>
                <th className="r" style={{ width: 80 }}>
                  Qty
                </th>
                <th className="r" style={{ width: 120 }}>
                  Rate
                </th>
                <th className="r" style={{ width: 130 }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.description}</td>
                  <td className="r">{i.quantity}</td>
                  <td className="r">{money(i.unitPriceCents, currency)}</td>
                  <td className="r">{money(i.lineTotalCents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="doc-sum">
            <div className="box">
              <div className="row">
                <span>Subtotal</span>
                <span>{money(invoice.subtotalCents, currency)}</span>
              </div>
              {invoice.discountCents > 0 && (
                <div className="row">
                  <span>
                    Discount
                    {invoice.discountMode === 'PERCENT' && ` (${invoice.discountValue / 100}%)`}
                  </span>
                  <span>-{money(invoice.discountCents, currency)}</span>
                </div>
              )}
              <div className="row">
                <span>{invoice.chargeTax ? invoice.taxLabel : 'No tax charged'}</span>
                <span>{money(invoice.taxCents, currency)}</span>
              </div>
              <div className="row tot">
                <span>Total</span>
                <span>{money(invoice.totalCents, currency)}</span>
              </div>
              {invoice.paidCents > 0 && (
                <>
                  <div className="row">
                    <span>Received</span>
                    <span>{money(invoice.paidCents, currency)}</span>
                  </div>
                  <div className="row tot">
                    <span>Still owed</span>
                    <span>{money(invoice.balanceCents, currency)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {invoice.notes && (
            <p style={{ margin: '0 0 20px', fontSize: 'var(--fs-label)' }}>{invoice.notes}</p>
          )}

          <div className="doc-foot">
            <div>
              <h4>Payment terms</h4>
              <span>{invoice.terms ?? `Payment due within ${invoice.paymentTermsDays} days.`}</span>
            </div>
            {invoice.seller.gstHstNumber && (
              <div>
                <h4>GST / HST registration number</h4>
                <span className="doc-bn">{invoice.seller.gstHstNumber}</span>
              </div>
            )}
            {invoice.payTo && (
              <div>
                <h4>How to pay</h4>
                <span>{invoice.payTo}</span>
              </div>
            )}
            {invoice.footer && <div style={{ color: 'var(--ink-3)' }}>{invoice.footer}</div>}
          </div>
        </div>

        {/* ------------------------------------------------------- the rail --- */}
        <aside className="noprint">
          <div className="railcard">
            <h3>This invoice</h3>
            <div className="calc" style={{ margin: '0 0 16px' }}>
              <div className="row">
                <span>Total</span>
                <span>{money(invoice.totalCents, currency)}</span>
              </div>
              <div className="row">
                <span>Received</span>
                <span>{money(invoice.paidCents, currency)}</span>
              </div>
              <div className="row tot">
                <span>Still owed</span>
                <span>{money(invoice.balanceCents, currency)}</span>
              </div>
            </div>

            {invoice.status === 'draft' ? (
              canWrite && (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(() => sendInvoice(id), 'Marked as sent. It now counts towards what you are owed.')
                  }
                >
                  <Icon name="send" size={19} /> Mark as sent
                </button>
              )
            ) : (
              canWrite &&
              invoice.balanceCents > 0 && (
                <button className="btn btn-primary" type="button" onClick={() => setPaying(true)}>
                  <Icon name="wallet" size={19} /> Record a payment
                </button>
              )
            )}

            <button className="btn" type="button" onClick={() => window.print()}>
              <Icon name="download" size={19} /> Download or print
            </button>

            {canWrite && invoice.paidCents === 0 && (
              <Link className="btn" href={`/invoices/${id}/edit`}>
                <Icon name="edit" size={19} /> Edit invoice
              </Link>
            )}

            {canWrite && invoice.paidCents === 0 && (
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await voidInvoice(id);
                    router.push('/invoices');
                  }, 'Invoice removed. Its number stays in the sequence.')
                }
              >
                <Icon name="trash" size={19} /> Remove this invoice
              </button>
            )}
          </div>

          <div className="railcard">
            <h3>Payments</h3>
            {invoice.payments.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                Nothing received yet.
              </p>
            ) : (
              <div className="paylist" style={{ margin: 0 }}>
                {invoice.payments.map((p) => (
                  <div key={p.id} className="payrow">
                    <span>
                      <b>{money(p.amountCents, currency)}</b>
                      <br />
                      <span className="muted" style={{ fontSize: 13 }}>
                        {formatDate(p.date)}
                        {p.method && ` · ${METHOD[p.method]}`}
                        {p.reference && ` · ${p.reference}`}
                      </span>
                      <br />
                      <span className="muted" style={{ fontSize: 12 }}>
                        {p.by} · {formatDateTime(p.at)}
                      </span>
                    </span>
                    {canWrite && (
                      <button
                        type="button"
                        className="rm"
                        aria-label="Remove this payment"
                        title="Remove this payment"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () => removePayment(id, p.id),
                            'Payment removed, and the income entry it posted has been reversed.',
                          )
                        }
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {invoice.payments.length > 0 && (
            <Notice tone="ok" icon="check" title="Income has been posted for you">
              Each payment wrote one income entry, linked back to this invoice. It cannot be
              edited on the Income screen, so the same money can never be recorded twice.{' '}
              <Link href="/income">See it on Income</Link>
            </Notice>
          )}

          <Notice icon="shield" title="Why the registration number is on here">
            Without your 15 character GST/HST number, {invoice.billTo.name} can be refused their
            input tax credit. At $30 and above the CRA also wants the buyer&apos;s name and the
            payment terms. All of it comes from your invoice template, so it is never forgotten.
          </Notice>
        </aside>
      </div>

      {paying && (
        <PaymentDrawer
          invoiceId={id}
          onClose={() => setPaying(false)}
          onSaved={(updated) => {
            setPaying(false);
            setInvoice(updated);
            toast(
              updated.status === 'paid'
                ? 'Settled. The income has been posted for you.'
                : 'Part payment recorded, and the income posted for you.',
            );
          }}
        />
      )}
    </AppShell>
  );
}

export default function InvoicePage() {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <Inner />
      </Suspense>
    </ToastProvider>
  );
}
