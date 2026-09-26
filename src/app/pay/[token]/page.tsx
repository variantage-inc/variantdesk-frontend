'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { InvoiceDocument } from '@/components/invoices/invoice-document';
import { ApiError, getPublicInvoice, startPublicCheckout, type PublicInvoice } from '@/lib/api';
import { money } from '@/lib/format';

/* The invoice, as the client receives it.

   Reached by a link the business sent, with no account and no sign in. It
   shows the document, exactly as the business sees it, and a Pay Now that goes
   to Stripe on the business's own account.

   Coming back from Stripe does not mark anything paid. The payment is recorded
   when Stripe's webhook says the money arrived, which is usually within a few
   seconds, so the page asks again a few times and says what is happening
   rather than claiming a result it does not have yet. */

function Pay() {
  const { token } = useParams<{ token: string }>();
  const returned = useSearchParams().get('paid') === '1';

  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);

  const load = useCallback(() => {
    getPublicInvoice(token)
      .then((r) => {
        setInvoice(r.invoice);
        setProblem(null);
      })
      .catch((err) =>
        setProblem(err instanceof ApiError ? err.message : 'This invoice could not be loaded.'),
      );
  }, [token]);

  useEffect(load, [load]);

  /* Back from Stripe and not yet shown as paid: ask again, every three seconds,
     for half a minute. */
  const waiting = returned && invoice !== null && invoice.status !== 'paid' && tries < 10;
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => {
      setTries((n) => n + 1);
      load();
    }, 3000);
    return () => clearTimeout(t);
  }, [waiting, tries, load]);

  async function pay() {
    setBusy(true);
    setProblem(null);
    try {
      const { url } = await startPublicCheckout(token);
      window.location.href = url;
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Stripe could not be reached. Try again.');
      setBusy(false);
    }
  }

  if (problem && !invoice) {
    return (
      <div className="paywrap">
        <Notice tone="err" icon="alert" title="This link does not open an invoice">
          {problem}
        </Notice>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="paywrap">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  const paid = invoice.status === 'paid';

  return (
    <div className="paywrap">
      {problem && (
        <div style={{ marginBottom: 14 }}>
          <Notice tone="err" icon="alert">
            {problem}
          </Notice>
        </div>
      )}

      {returned && !paid && (
        <div style={{ marginBottom: 14 }}>
          <Notice icon="clock" title="Thank you, your payment is being confirmed">
            {waiting
              ? 'Stripe is confirming it now. This page updates by itself in a few seconds.'
              : 'It has not shown here yet. There is no need to pay again: your card statement and Stripe’s email are your receipt.'}
          </Notice>
        </div>
      )}

      <div className="paybar">
        <div className="due">
          {paid ? 'Paid in full' : invoice.paidCents > 0 ? 'Balance due' : 'Amount due'}
          <b>{money(paid ? invoice.totalCents : invoice.balanceCents, invoice.currency)}</b>
        </div>
        {paid ? (
          <span className="pill p-paid" style={{ marginLeft: 'auto' }}>
            Paid, thank you
          </span>
        ) : invoice.canPayByCard ? (
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void pay()}
          >
            <Icon name="card" size={19} /> {busy ? 'Opening Stripe…' : 'Pay now by card'}
          </button>
        ) : (
          <span className="hint" style={{ marginLeft: 'auto', maxWidth: 360 }}>
            {invoice.payTo
              ? 'See How to pay at the foot of the invoice.'
              : `Contact ${invoice.seller.name} for how to pay.`}
          </span>
        )}
        <button className="btn btn-sm" type="button" onClick={() => window.print()}>
          <Icon name="print" size={17} /> Print
        </button>
      </div>

      <InvoiceDocument doc={invoice} currency={invoice.currency} dateFormat={invoice.dateFormat} />

      <p className="payfoot">
        {invoice.canPayByCard
          ? `Card payments are handled by Stripe and go directly to ${invoice.seller.name}. Your card details never reach this page.`
          : `Sent by ${invoice.seller.name}.`}
      </p>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={null}>
      <Pay />
    </Suspense>
  );
}
