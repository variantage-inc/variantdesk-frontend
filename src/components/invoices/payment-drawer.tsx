'use client';

import { useEffect, useState } from 'react';
import { Field, Notice, Select, TextInput } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  ApiError,
  paymentContext,
  recordPayment,
  type Invoice,
  type PaymentContext,
  type PaymentMethod,
} from '@/lib/api';
import { money } from '@/lib/format';
import { today } from '@/lib/period';

/* Recording a payment.

   This is the one place a payment is recorded, and the one place income is
   posted for an invoice. There is deliberately no second door: the entry it
   writes cannot be edited on the Income screen, which is what stops the same
   money being counted twice.

   The box says what the amount will do before it is saved. A part payment
   leaves a balance and keeps the invoice open; the exact balance settles it
   and posts the income; more than is owed is refused, because a credit balance
   is a different thing with different accounting and swallowing the difference
   would hide a typo. */

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'E_TRANSFER', label: 'e-Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
];

export function PaymentDrawer({
  invoiceId,
  onClose,
  onSaved,
}: {
  invoiceId: string;
  onClose: () => void;
  onSaved: (invoice: Invoice) => void;
}) {
  const [ctx, setCtx] = useState<PaymentContext | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    paymentContext(invoiceId)
      .then((r) => {
        if (cancelled) return;
        setCtx(r);
        /* Prefilled with the full balance, because settling an invoice in full
           is what usually happens, and typing the figure again is a chance to
           get it wrong. */
        setAmount((r.balanceCents / 100).toFixed(2));
      })
      .catch(() => !cancelled && setProblem('We could not load this invoice.'));
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cents = Math.round((Number(amount) || 0) * 100);
  const left = (ctx?.balanceCents ?? 0) - cents;
  const currency = 'CAD';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const r = await recordPayment(invoiceId, {
        date,
        amount: Number(amount),
        method,
        reference: reference || null,
      });
      onSaved(r.invoice);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'We could not record that payment.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <div className="drawer-head">
          <div>
            <h2 id="pay-title">Record a payment</h2>
            <p className="sub">
              {ctx ? `${ctx.number} · ${ctx.clientName}` : 'Loading…'}
            </p>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="drawer-body">
          {ctx && (
            <form id="pay-form" onSubmit={save} noValidate>
              {problem && (
                <div style={{ marginBottom: 18 }}>
                  <Notice tone="err" icon="alert">
                    {problem}
                  </Notice>
                </div>
              )}

              <div className="calc" style={{ marginTop: 0 }}>
                <div className="row">
                  <span>Invoice total</span>
                  <span>{money(ctx.totalCents, currency)}</span>
                </div>
                <div className="row">
                  <span>Already received</span>
                  <span>{money(ctx.paidCents, currency)}</span>
                </div>
                <div className="row tot">
                  <span>Still owed</span>
                  <span>{money(ctx.balanceCents, currency)}</span>
                </div>
              </div>

              <Field label="Amount received" required>
                <TextInput
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              {/* What this amount will do, before it is saved. */}
              <div style={{ margin: '18px 0' }}>
                {cents <= 0 ? (
                  <Notice tone="warn" icon="info">
                    Enter the amount you have received.
                  </Notice>
                ) : left > 0 ? (
                  <Notice tone="warn" icon="info" title="This is a part payment">
                    {money(left, currency)} will still be owed, and the invoice stays{' '}
                    <b>Partially paid</b>. A proportional share of the tax is posted with it.
                  </Notice>
                ) : left === 0 ? (
                  <Notice tone="ok" icon="check" title="This settles the invoice">
                    It becomes <b>Paid</b>, and the income is posted for you as one entry linked
                    back here.
                  </Notice>
                ) : (
                  <Notice tone="err" icon="alert" title="That is more than is owed">
                    The balance is {money(ctx.balanceCents, currency)}.
                  </Notice>
                )}
              </div>

              <div className="field-row">
                <Field label="Date received" hint="The day the money actually arrived.">
                  <TextInput
                    type="date"
                    value={date}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                <Field label="How it was paid">
                  <Select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  >
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Reference">
                <TextInput
                  placeholder="Transfer or cheque number"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>

              <Notice icon="info" title="This posts your income">
                One entry, on the date above, linked back to this invoice. It appears on the
                Income screen and cannot be edited there, which is what stops the same money
                being recorded twice.
              </Notice>
            </form>
          )}
        </div>

        <div className="drawer-foot">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="pay-form"
            disabled={busy || !ctx || cents <= 0 || left < 0}
            aria-busy={busy}
          >
            {busy ? 'Saving…' : 'Record the payment'}
          </button>
        </div>
      </aside>
    </>
  );
}
