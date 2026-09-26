'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ToastProvider, useToast } from '@/components/settings/toast';
import { PaymentDrawer } from '@/components/invoices/payment-drawer';
import { InvoiceDocument } from '@/components/invoices/invoice-document';
import { ReceiptDrawer } from '@/components/receipts/receipt-drawer';
import { RECEIPT_ACCEPT } from '@/components/receipts/file-drop';
import {
  ApiError,
  attachToInvoice,
  cardPaymentsStatus,
  getInvoice,
  invoiceLink,
  type CardPaymentsStatus,
  removePayment,
  sendInvoice,
  voidInvoice,
  type Invoice,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { fileSize, formatDate, formatDateTime, money } from '@/lib/format';

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
  const [viewing, setViewing] = useState<string | null>(null);
  const [cards, setCards] = useState<CardPaymentsStatus | null>(null);

  useEffect(() => {
    cardPaymentsStatus()
      .then(setCards)
      .catch(() => undefined);
  }, []);
  const picker = useRef<HTMLInputElement>(null);

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
        <InvoiceDocument doc={invoice} currency={currency} />

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

          {/* The link the client opens to see and pay the invoice. There
              is no invoice email, so this is how it reaches them. */}
          {invoice.status !== 'draft' && (
            <div className="railcard">
              <h3>Share with your client</h3>
              {invoice.publicUrl ? (
                <>
                  <input
                    className="input"
                    readOnly
                    value={invoice.publicUrl}
                    aria-label="Link to this invoice"
                    onFocus={(e) => e.target.select()}
                    style={{ fontSize: 13, height: 44, marginBottom: 10 }}
                  />
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(invoice.publicUrl!)
                        .then(() => toast('Link copied. Paste it into your message to the client.'))
                    }
                  >
                    <Icon name="send" size={19} /> Copy the link
                  </button>
                  {canWrite && (
                    <button
                      className="btn btn-quiet"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => invoiceLink(id, true),
                          'A new link is ready. The old one no longer opens this invoice.',
                        )
                      }
                    >
                      Replace the link
                    </button>
                  )}
                </>
              ) : canWrite ? (
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => void act(() => invoiceLink(id), 'Link ready. Copy it and send it to your client.')}
                >
                  <Icon name="send" size={19} /> Make a link to send
                </button>
              ) : (
                <p className="hint" style={{ margin: 0 }}>No link has been made yet.</p>
              )}
              <p className="hint" style={{ margin: '12px 0 0' }}>
                {cards?.chargesEnabled
                  ? 'Your client sees this invoice and can pay it by card. The payment is recorded here by itself.'
                  : 'Your client sees this invoice. To let them pay it by card, connect Stripe on the Invoice template tab in Settings.'}
              </p>
            </div>
          )}

          {invoice.cardFailure && invoice.balanceCents > 0 && (
            <Notice tone="warn" icon="card" title="A card payment was declined">
              {invoice.billTo.name} tried to pay by card on {formatDateTime(invoice.cardFailure.at)}.
              Stripe said: {invoice.cardFailure.message ?? 'the card was declined'}. Nothing was
              recorded; the invoice is still open.
            </Notice>
          )}

          {invoice.balanceCents < 0 && (
            <Notice tone="warn" icon="alert" title="This invoice has been overpaid">
              {money(-invoice.balanceCents, currency)} more arrived than was owed, usually a card
              payment landing after one was recorded by hand. Refund the difference to the client.
            </Notice>
          )}

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
                        {p.card
                          ? ' · Card, paid online'
                          : `${p.method ? ` · ${METHOD[p.method]}` : ''}${p.reference ? ` · ${p.reference}` : ''}`}
                      </span>
                      <br />
                      <span className="muted" style={{ fontSize: 12 }}>
                        {p.card
                          ? `Stripe ${p.card.reference}${p.card.feeCents !== null ? ` · fee ${money(p.card.feeCents, currency)}` : ''}`
                          : `${p.by} · ${formatDateTime(p.at)}`}
                      </span>
                    </span>
                    {/* A card payment is undone by refunding it in Stripe,
                        which reverses it here. Removing it here would leave
                        the money in the bank and off the books. */}
                    {canWrite && !p.card && (
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

          {/* Documents that belong with this invoice: a signed purchase order,
              a remittance, the client's own copy. Never printed. */}
          <div className="railcard">
            <h3>Documents</h3>
            {(invoice.attachments ?? []).length === 0 ? (
              <p className="hint" style={{ margin: '0 0 12px' }}>
                Nothing attached. A signed purchase order or a remittance belongs here.
              </p>
            ) : (
              <div className="paylist" style={{ margin: '0 0 12px' }}>
                {(invoice.attachments ?? []).map((a) => (
                  <div key={a.id} className="payrow">
                    <span>
                      <b style={{ wordBreak: 'break-word' }}>{a.fileName}</b>
                      <br />
                      <span className="muted" style={{ fontSize: 13 }}>
                        {fileSize(a.sizeBytes)} · {formatDate(a.createdAt)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="rm"
                      aria-label={`Open ${a.fileName}`}
                      title="Open"
                      onClick={() => setViewing(a.id)}
                    >
                      <Icon name="eye" size={17} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {canWrite && (
              <>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => picker.current?.click()}
                >
                  <Icon name="clip" size={19} /> Attach a document
                </button>
                <input
                  ref={picker}
                  type="file"
                  accept={RECEIPT_ACCEPT}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void act(() => attachToInvoice(id, file), `${file.name} attached to ${invoice.number}.`);
                  }}
                />
              </>
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

      {viewing && (
        <ReceiptDrawer
          files={(invoice.attachments ?? []).filter((a) => a.id === viewing)}
          on={{
            kind: 'INVOICE',
            id: invoice.id,
            date: invoice.issueDate,
            title: `Invoice ${invoice.number}`,
            party: invoice.billTo.name,
            category: null,
            totalCents: invoice.totalCents,
            taxCents: invoice.taxCents,
            fromInvoice: null,
          }}
          currency={currency}
          dateFormat="YYYY/MM/DD"
          canWrite={canWrite}
          onClose={() => setViewing(null)}
          onDeleted={(message) => {
            setViewing(null);
            toast(message);
            load();
          }}
        />
      )}

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
