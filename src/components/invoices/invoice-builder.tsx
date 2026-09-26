'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Field, Notice, Select, TextInput } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  ApiError,
  createInvoice,
  getInvoice,
  invoiceDefaults,
  listClients,
  sendInvoice,
  updateInvoice,
  type Client,
  type InvoiceDefaults,
  type InvoiceInput,
} from '@/lib/api';
import { formatDate, money } from '@/lib/format';
import { today } from '@/lib/period';

/* The invoice builder.

   Most of an invoice is already written. The business details, the terms, the
   footer, the tax setting and the next number all come from the template in
   Settings, so the owner chooses a client and types the lines. That is the
   feature that replaced "duplicate an invoice", which the client cut in the
   review: there is nothing to copy, because everything repeatable is already
   here, and copying last month's invoice also copies last month's mistakes.

   Two things are worked out rather than asked for: the due date, from the
   terms, and the tax, from the province. The running total moves as you type,
   with the discount coming off before tax, which is the way the CRA expects
   it. */

type Line = { description: string; quantity: string; unitPrice: string };

const BLANK: Line = { description: '', quantity: '1', unitPrice: '' };

const TERMS = [
  [30, 'Net 30, due 30 days after the invoice date'],
  [15, 'Net 15, due 15 days after'],
  [14, 'Net 14, due 14 days after'],
  [7, 'Net 7, due 7 days after'],
  [0, 'Due on receipt'],
] as const;

export function InvoiceBuilder({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const [defaults, setDefaults] = useState<InvoiceDefaults | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [number, setNumber] = useState('');

  const [clientId, setClientId] = useState(params.get('client') ?? '');
  const [issueDate, setIssueDate] = useState(today());
  const [termsDays, setTermsDays] = useState(30);
  const [lines, setLines] = useState<Line[]>([{ ...BLANK }]);
  const [discountMode, setDiscountMode] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [discountValue, setDiscountValue] = useState('0');
  const [chargeTax, setChargeTax] = useState(true);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([invoiceDefaults(), listClients(), invoiceId ? getInvoice(invoiceId) : null])
      .then(([d, c, existing]) => {
        if (cancelled) return;
        setDefaults(d);
        setClients(c.clients);
        setNumber(existing?.invoice.number ?? d.nextNumber);

        if (existing) {
          const inv = existing.invoice;
          setClientId(inv.client.id);
          setIssueDate(inv.issueDate);
          setTermsDays(inv.paymentTermsDays);
          setLines(
            inv.items.map((i) => ({
              description: i.description,
              quantity: String(i.quantity),
              unitPrice: (i.unitPriceCents / 100).toFixed(2),
            })),
          );
          setDiscountMode(inv.discountMode);
          setDiscountValue(
            inv.discountMode === 'PERCENT'
              ? String(inv.discountValue / 100)
              : (inv.discountValue / 100).toFixed(2),
          );
          setChargeTax(inv.chargeTax);
          setNotes(inv.notes ?? '');
        } else {
          setTermsDays(d.paymentTermsDays);
        }
      })
      .catch(() => !cancelled && setProblem('We could not load the invoice template.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const rate = defaults?.tax.totalBp ?? 1300;
  const currency = defaults?.currency ?? 'CAD';
  const fmt = defaults?.dateFormat ?? 'YYYY/MM/DD';

  /* The same arithmetic the API does on save, so the running total on screen
     is the figure that lands in the database. */
  const lineTotals = lines.map((l) =>
    Math.round((Math.round((Number(l.quantity) || 0) * 1000) * Math.round((Number(l.unitPrice) || 0) * 100)) / 1000),
  );
  const subtotalCents = lineTotals.reduce((n, v) => n + v, 0);
  const discountCents =
    discountMode === 'PERCENT'
      ? Math.round((subtotalCents * Math.round((Number(discountValue) || 0) * 100)) / 10000)
      : Math.round((Number(discountValue) || 0) * 100);
  const taxableCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = chargeTax ? Math.round((taxableCents * rate) / 10000) : 0;
  const totalCents = taxableCents + taxCents;

  const dueDate = new Date(
    new Date(`${issueDate}T00:00:00`).getTime() + termsDays * 86_400_000,
  );

  const chosen = clients.find((c) => c.id === clientId);

  /* The Canadian part. Without the 15 character registration number a client
     can be refused their input tax credit, and at $30 and above the CRA wants
     the buyer's name and address and the payment terms on the document. */
  const checklist = [
    { ok: Boolean(clientId), text: 'A client is chosen' },
    { ok: lines.some((l) => l.description.trim() && Number(l.unitPrice) > 0), text: 'At least one line with an amount' },
    {
      ok: Boolean(defaults?.gstHstNumber) || !chargeTax,
      text: chargeTax
        ? 'Your GST/HST registration number is on it'
        : 'No tax charged, so no registration number needed',
    },
    { ok: Boolean(defaults?.sellerAddress), text: 'Your business address is on it' },
    { ok: Boolean(chosen), text: "The buyer's name is on it" },
    { ok: Boolean(defaults?.terms), text: 'The payment terms are printed' },
  ];

  /* Choosing a client applies their own terms, if they have any.

     Done here rather than in an effect watching the client id, because it is a
     consequence of an action rather than a fact that has to stay in sync: if
     the owner then picks different terms by hand, changing the client should
     not silently undo that. */
  function chooseClient(next: string) {
    setClientId(next);
    if (invoiceId) return;
    const terms = clients.find((c) => c.id === next)?.paymentTermsDays;
    if (terms !== null && terms !== undefined) setTermsDays(terms);
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  }

  async function save(andSend: boolean) {
    setBusy(true);
    setProblem(null);

    const input: InvoiceInput = {
      clientId,
      issueDate,
      paymentTermsDays: termsDays,
      lines: lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description.trim(),
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
        })),
      discountMode,
      discountValue: Number(discountValue) || 0,
      chargeTax,
      notes: notes || null,
    };

    try {
      const r = invoiceId ? await updateInvoice(invoiceId, input) : await createInvoice(input);
      if (andSend) await sendInvoice(r.invoice.id);
      router.push(`/invoices/${r.invoice.id}`);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'We could not save that invoice.');
      setBusy(false);
    }
  }

  return (
    <AppShell crumb={invoiceId ? `Edit ${number}` : 'New invoice'}>
      <div className="phead">
        <div>
          <h1>{invoiceId ? `Edit ${number}` : 'New invoice'}</h1>
          <p className="sub">
            Most of it is already written. Choose a client and type what you are charging for.
          </p>
        </div>
        <div className="acts">
          <Link className="btn btn-sm" href="/invoices">
            <Icon name="arrowLeft" size={18} /> All invoices
          </Link>
        </div>
      </div>

      {problem && (
        <Notice tone="err" icon="alert">
          {problem}
        </Notice>
      )}

      {loading ? (
        <p className="hint">Loading your template…</p>
      ) : (
        <div className="doc-grid">
          <div>
            <div className="panel" style={{ marginBottom: 18 }}>
              <div className="chead">
                <div>
                  <h2>Who and when</h2>
                  <p className="csub">The due date is worked out from the terms, not typed.</p>
                </div>
              </div>

              <div style={{ padding: '18px 22px 24px' }}>
                <div className="field-row">
                  <Field label="Client" required>
                    <Select value={clientId} onChange={(e) => chooseClient(e.target.value)}>
                      <option value="">Choose a client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Invoice number" hint="Next in the sequence. Numbers are never reused.">
                    <TextInput value={number} readOnly />
                  </Field>
                </div>

                {chosen && (
                  <div
                    style={{
                      padding: '16px 18px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r)',
                      marginBottom: 20,
                      fontSize: 'var(--fs-label)',
                    }}
                  >
                    <b>{chosen.name}</b>
                    {chosen.contactName && <> · {chosen.contactName}</>}
                    {chosen.outstandingCents > 0 && (
                      <div className="sub2" style={{ color: 'var(--red-600)' }}>
                        Already owes {money(chosen.outstandingCents, currency)}
                      </div>
                    )}
                  </div>
                )}

                <div className="field-3">
                  <Field label="Invoice date">
                    <TextInput
                      type="date"
                      value={issueDate}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                      onChange={(e) => setIssueDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Payment terms">
                    <Select value={termsDays} onChange={(e) => setTermsDays(Number(e.target.value))}>
                      {TERMS.map(([days, label]) => (
                        <option key={days} value={days}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Payment due" hint="Worked out from the terms.">
                    <TextInput value={formatDate(dueDate, fmt)} readOnly />
                  </Field>
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginBottom: 18 }}>
              <div className="chead">
                <div>
                  <h2>What you are charging for</h2>
                  <p className="csub">Amounts are before tax. Tax is added below.</p>
                </div>
                <div className="acts">
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => setLines((p) => [...p, { ...BLANK }])}
                  >
                    <Icon name="plus" size={17} /> Add a line
                  </button>
                </div>
              </div>

              <div style={{ padding: '18px 22px 24px' }}>
                <table className="lines">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="r" style={{ width: 90 }}>
                        Qty
                      </th>
                      <th className="r" style={{ width: 130 }}>
                        Rate
                      </th>
                      <th className="r" style={{ width: 130 }}>
                        Amount
                      </th>
                      <th style={{ width: 44 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            className="input"
                            placeholder="What was done"
                            value={l.description}
                            onChange={(e) => setLine(i, { description: e.target.value })}
                          />
                        </td>
                        <td className="r">
                          <input
                            className="input r"
                            inputMode="decimal"
                            style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                            value={l.quantity}
                            onChange={(e) => setLine(i, { quantity: e.target.value })}
                          />
                        </td>
                        <td className="r">
                          <input
                            className="input"
                            inputMode="decimal"
                            placeholder="0.00"
                            style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                            value={l.unitPrice}
                            onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                          />
                        </td>
                        <td
                          className="r"
                          style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
                        >
                          {money(lineTotals[i] ?? 0, currency)}
                        </td>
                        <td>
                          {lines.length > 1 && (
                            <button
                              type="button"
                              className="rm"
                              aria-label="Remove this line"
                              onClick={() => setLines((p) => p.filter((_, n) => n !== i))}
                            >
                              <Icon name="trash" size={17} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="field-3" style={{ marginTop: 24 }}>
                  <Field label="Discount">
                    <Select
                      value={discountMode}
                      onChange={(e) => setDiscountMode(e.target.value as 'AMOUNT' | 'PERCENT')}
                    >
                      <option value="AMOUNT">A fixed amount</option>
                      <option value="PERCENT">A percentage</option>
                    </Select>
                  </Field>
                  <Field label="How much" hint="Taken off before tax is worked out.">
                    <TextInput
                      inputMode="decimal"
                      value={discountValue}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                      onChange={(e) => setDiscountValue(e.target.value)}
                    />
                  </Field>
                  <Field label={`Charge ${defaults?.tax.label ?? 'tax'}`}>
                    <Select
                      value={chargeTax ? 'yes' : 'no'}
                      onChange={(e) => setChargeTax(e.target.value === 'yes')}
                    >
                      <option value="yes">
                        Yes, {defaults?.tax.label}, {defaults?.tax.name}
                      </option>
                      <option value="no">No, zero rated or exempt</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Notes on this invoice" hint="Printed under the totals.">
                  <textarea
                    className="input"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="panel">
              <div className="chead">
                <div>
                  <h2>What the template adds for you</h2>
                  <p className="csub">Set once in Settings, printed on every invoice.</p>
                </div>
              </div>
              <div style={{ padding: '20px 22px 24px', display: 'grid', gap: 18 }}>
                <TemplateBit label="Payment terms" value={defaults?.terms} />
                <TemplateBit
                  label="GST / HST registration number"
                  value={defaults?.gstHstNumber}
                  missing="Not registered. Turn it on in Settings if you charge tax."
                />
                <TemplateBit label="Footer" value={defaults?.footer} />
                <TemplateBit label="How to pay" value={defaults?.payTo} />
                <p className="hint" style={{ margin: 0 }}>
                  This is what replaced <b>duplicate invoice</b>. There is nothing to copy from a
                  previous one, because everything repeatable is already here.
                </p>
              </div>
            </div>
          </div>

          <aside>
            <div className="railcard">
              <h3>Running total</h3>
              <div className="calc" style={{ margin: '0 0 12px' }}>
                <div className="row">
                  <span>Lines</span>
                  <span>{money(subtotalCents, currency)}</span>
                </div>
                {discountCents > 0 && (
                  <div className="row">
                    <span>
                      Discount
                      {discountMode === 'PERCENT' && ` (${discountValue}%)`}
                    </span>
                    <span>-{money(discountCents, currency)}</span>
                  </div>
                )}
                <div className="row">
                  <span>{chargeTax ? defaults?.tax.label : 'No tax charged'}</span>
                  <span>{money(taxCents, currency)}</span>
                </div>
                <div className="row tot">
                  <span>Total</span>
                  <span>{money(totalCents, currency)}</span>
                </div>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                The discount comes off before tax, which is the way the CRA expects it.
              </p>
            </div>

            <div className="railcard">
              <h3>Before you send it</h3>
              <ul className="checklist">
                {checklist.map((c) => (
                  <li key={c.text} className={c.ok ? 'ok' : undefined}>
                    <span className="rd">{c.ok && <Icon name="check" size={12} sw={3.4} />}</span>{' '}
                    {c.text}
                  </li>
                ))}
              </ul>
            </div>

            <div className="railcard">
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !clientId || subtotalCents === 0}
                onClick={() => void save(true)}
              >
                {busy ? 'Saving…' : 'Save and mark as sent'}
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy || !clientId}
                onClick={() => void save(false)}
              >
                Save as a draft
              </button>
              <p className="hint" style={{ margin: '12px 0 0' }}>
                Income is posted when the invoice is <b>paid</b>, not when it is sent. That is
                what stops the same money being counted twice.
              </p>
            </div>

            <Notice icon="info" title="No Email this invoice">
              It was cut in your review. Save it, then download or print the PDF and send it
              however you normally do.
            </Notice>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function TemplateBit({
  label,
  value,
  missing = 'Not set yet. Add it in Settings.',
}: {
  label: string;
  value?: string | null;
  missing?: string;
}) {
  return (
    <div>
      <h4
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '.09em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginBottom: 6,
        }}
      >
        {label}
      </h4>
      {value ? (
        <p style={{ margin: 0, fontSize: 'var(--fs-label)' }}>{value}</p>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          {missing} <Link href="/settings#invoice">Open Settings</Link>
        </p>
      )}
    </div>
  );
}
