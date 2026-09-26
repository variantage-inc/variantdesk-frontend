'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { useSession } from '@/lib/session';
import { Field, Notice, Select, TextInput } from '@/components/form';
import {
  ApiError,
  cardPaymentsStatus,
  connectStripe,
  saveInvoiceTemplate,
  type CardPaymentsStatus,
  type SettingsPayload,
} from '@/lib/api';
import { formatDate, type DateFormat } from '@/lib/format';
import { useDraft } from './use-draft';
import { useSaveBar } from './save-bar';
import { useToast } from './toast';

/* The invoice template: what is filled in on every new invoice, so nothing is
   retyped and nothing is forgotten.

   The panel on the right is computed rather than drawn. The next invoice
   number really is built from the prefix, the number and the padding, and the
   due date really is today plus the chosen terms. If this preview is right,
   the invoice will be right, because Phase 6 uses the same three fields. */

const TERMS = [
  [30, 'Net 30, due 30 days after the invoice date'],
  [15, 'Net 15, due 15 days after'],
  [14, 'Net 14, due 14 days after'],
  [7, 'Net 7, due 7 days after'],
  [0, 'Due on receipt'],
] as const;

const INTEREST = [
  [200, '2% per month'],
  [150, '1.5% per month'],
  [100, '1% per month'],
  [0, 'None'],
] as const;

type Form = {
  invoicePrefix: string;
  nextInvoiceNumber: number;
  invoiceNumberPad: number;
  paymentTermsDays: number;
  lateInterestBp: number;
  invoiceTerms: string;
  invoiceFooter: string;
  invoicePayTo: string;
};

const numberFor = (prefix: string, n: number, pad: number) =>
  `${prefix}${pad > 0 ? String(n).padStart(pad, '0') : String(n)}`;

export function InvoiceTab({
  data,
  onSaved,
}: {
  data: SettingsPayload;
  onSaved: (payload: SettingsPayload) => void;
}) {
  const b = data.business;
  const toast = useToast();

  const draft = useDraft<Form>({
    invoicePrefix: b.invoicePrefix,
    nextInvoiceNumber: b.nextInvoiceNumber,
    invoiceNumberPad: b.invoiceNumberPad,
    paymentTermsDays: b.paymentTermsDays,
    lateInterestBp: b.lateInterestBp ?? 200,
    invoiceTerms: b.invoiceTerms ?? '',
    invoiceFooter: b.invoiceFooter ?? '',
    invoicePayTo: b.invoicePayTo ?? '',
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const v = draft.value;

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const payload = await saveInvoiceTemplate(v);
      draft.commit(v);
      onSaved(payload);
      toast('Your invoice template has been saved.');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        toast(err.fields ? 'Some fields need attention.' : err.message, 'err');
      } else {
        toast('We could not reach the server.', 'err');
      }
    } finally {
      setSaving(false);
    }
  }

  useSaveBar(draft.dirty, saving, () => void save(), draft.reset);

  const fmt = b.dateFormat as DateFormat;
  const issued = new Date();
  const due = new Date(issued.getTime() + v.paymentTermsDays * 24 * 60 * 60 * 1000);

  return (
    <section className="tabpane">
      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Invoice template</h2>
              <p className="csub">
                Filled in on every new invoice, so nothing is retyped and nothing is forgotten.
              </p>
            </div>
          </div>

          <div className="setbody">
            <div className="setsec">
              <h3>Numbering</h3>
              <p className="ssub">
                Invoice numbers must run in an unbroken sequence. Variantage takes the next one
                automatically. You only set where it starts.
              </p>

              <div className="field-3">
                <Field
                  label="Prefix"
                  hint="Anything you like, or leave it empty."
                  error={errors.invoicePrefix}
                >
                  <TextInput
                    value={v.invoicePrefix}
                    placeholder="INV-"
                    invalid={!!errors.invoicePrefix}
                    onChange={(e) => draft.set('invoicePrefix', e.target.value)}
                  />
                </Field>
                <Field label="Next number" error={errors.nextInvoiceNumber}>
                  <TextInput
                    type="number"
                    min={1}
                    value={v.nextInvoiceNumber}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                    invalid={!!errors.nextInvoiceNumber}
                    onChange={(e) => draft.set('nextInvoiceNumber', Number(e.target.value))}
                  />
                </Field>
                <Field label="Digits">
                  <Select
                    value={v.invoiceNumberPad}
                    onChange={(e) => draft.set('invoiceNumberPad', Number(e.target.value))}
                  >
                    <option value={3}>3, {numberFor('', v.nextInvoiceNumber, 3)}</option>
                    <option value={4}>4, {numberFor('', v.nextInvoiceNumber, 4)}</option>
                    <option value={5}>5, {numberFor('', v.nextInvoiceNumber, 5)}</option>
                    <option value={0}>No padding, {v.nextInvoiceNumber}</option>
                  </Select>
                </Field>
              </div>
            </div>

            <div className="setsec">
              <h3>Payment terms</h3>
              <p className="ssub">
                Used to work out the due date. A client can be given their own terms on their
                record, which overrides this.
              </p>

              <div className="field-row">
                <Field label="Standard terms">
                  <Select
                    value={v.paymentTermsDays}
                    onChange={(e) => draft.set('paymentTermsDays', Number(e.target.value))}
                  >
                    {TERMS.map(([days, label]) => (
                      <option key={days} value={days}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Late payment interest">
                  <Select
                    value={v.lateInterestBp}
                    onChange={(e) => draft.set('lateInterestBp', Number(e.target.value))}
                  >
                    {INTEREST.map(([bp, label]) => (
                      <option key={bp} value={bp}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            <div className="setsec">
              <h3>Wording</h3>
              <p className="ssub">
                The terms line and the footer, printed on every invoice exactly as written here.
              </p>

              <Counted
                label="Terms line"
                hint="Printed under the totals."
                max={160}
                rows={2}
                value={v.invoiceTerms}
                error={errors.invoiceTerms}
                onChange={(next) => draft.set('invoiceTerms', next)}
              />
              <Counted
                label="Footer"
                hint="The last line on the page."
                max={240}
                rows={3}
                value={v.invoiceFooter}
                error={errors.invoiceFooter}
                onChange={(next) => draft.set('invoiceFooter', next)}
              />
              <Counted
                label="How to pay"
                hint="Optional, but invoices that say how to pay get paid faster."
                max={240}
                rows={3}
                placeholder="For example: e-Transfer to you@yourbusiness.ca, or bank transfer to…"
                value={v.invoicePayTo}
                error={errors.invoicePayTo}
                onChange={(next) => draft.set('invoicePayTo', next)}
              />
            </div>

            <CardPayments />
          </div>
        </div>

        <div className="rail">
          <div className="prev">
            <h4>Your next invoice will be</h4>
            <div className="big">
              {numberFor(v.invoicePrefix, v.nextInvoiceNumber, v.invoiceNumberPad)}
            </div>
            <div className="then">
              then{' '}
              {[1, 2, 3]
                .map((i) =>
                  numberFor(v.invoicePrefix, v.nextInvoiceNumber + i, v.invoiceNumberPad),
                )
                .join(', ')}
              …
            </div>
            <div className="quote">
              <b>Due date</b>
              <span>
                {v.paymentTermsDays === 0
                  ? `Issued ${formatDate(issued, fmt)}, due on receipt.`
                  : `Issued ${formatDate(issued, fmt)}, due ${formatDate(due, fmt)}.`}
              </span>
            </div>
            {v.invoiceTerms && (
              <div className="quote">
                <b>Terms line</b>
                <span>{v.invoiceTerms}</span>
              </div>
            )}
            {v.invoiceFooter && (
              <div className="quote">
                <b>Footer</b>
                <span>{v.invoiceFooter}</span>
              </div>
            )}
          </div>

          <Notice icon="info" title="Filled in on every new invoice">
            Everything here is already on the form before you type a thing, so there is no need
            to copy an old invoice and carry over last month&apos;s mistakes.
          </Notice>
          <Notice tone="warn" icon="alert" title="The number can go forward, never back">
            Moving it forward is how you continue a sequence started somewhere else. Moving it
            back would hand out a number that is already on a document a client is holding, so
            once invoices exist it is refused.
          </Notice>
        </div>
      </div>
    </section>
  );
}

/* A textarea with the live character count from the mockups. The count turns
   amber at 80% and red past the limit, so somebody writing a footer knows they
   are close before the form tells them they are over. */
function Counted({
  label,
  hint,
  max,
  rows,
  value,
  error,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  max: number;
  rows: number;
  value: string;
  error?: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const n = value.length;
  const tone = n > max ? 'over' : n > max * 0.8 ? 'warn' : '';

  return (
    <Field label={label} error={error}>
      <textarea
        className="input"
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="counter">
        <span className="hint" style={{ margin: 0 }}>
          {hint}
        </span>
        <span className={`n${tone ? ` ${tone}` : ''}`}>
          {n} / {max}
        </span>
      </div>
    </Field>
  );
}

/* Card payments on invoices.

   The business links its OWN Stripe account; a client's card payment lands
   there, with Stripe's fee taken from it, and never passes through Variantage.
   Setup is Stripe's own page. Coming back from it lands here with
   ?stripe=back, which is the moment to ask Stripe whether it is finished. */
function CardPayments() {
  const { user } = useSession();
  const toast = useToast();
  const owner = user?.role === 'OWNER';
  const [status, setStatus] = useState<CardPaymentsStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const back = new URLSearchParams(window.location.search).has('stripe');
    cardPaymentsStatus(back)
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await connectStripe();
      window.location.href = url;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Stripe could not be reached.', 'err');
      setBusy(false);
    }
  }

  const ready = status?.chargesEnabled;

  return (
    <div className="setsec">
      <h3>Card payments</h3>
      <p className="ssub">
        Let clients pay an invoice by card from its link. The money goes to your own Stripe
        account, Stripe takes its fee from it, and the payment is recorded here with the tax
        split, by itself.
      </p>

      {!status ? (
        <p className="hint">Checking…</p>
      ) : !status.configured ? (
        <Notice tone="warn" icon="alert" title="Not available yet">
          Card payments are not switched on for this environment.
        </Notice>
      ) : ready ? (
        <Notice tone="ok" icon="check" title="Taking card payments">
          Every invoice link now has a Pay Now button. Refunds are made in your Stripe dashboard,
          and come off the invoice here by themselves.
        </Notice>
      ) : (
        <>
          <Notice icon="card" title={status.connected ? 'Stripe setup is not finished' : 'Not connected'}>
            {status.connected
              ? 'Stripe still needs some details before it can take payments for you. Carry on where you left off.'
              : 'Connect a Stripe account, or create one, in a few minutes on Stripe’s own page. Nothing is charged to connect.'}
          </Notice>
          {owner ? (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void connect()}
              style={{ marginTop: 14 }}
            >
              <Icon name="card" size={19} />{' '}
              {busy ? 'Opening Stripe…' : status.connected ? 'Finish Stripe setup' : 'Connect Stripe'}
            </button>
          ) : (
            <p className="hint">The account owner can connect Stripe.</p>
          )}
        </>
      )}
    </div>
  );
}
