'use client';

import { useEffect, useRef, useState } from 'react';
import { Field, Notice, Select, TextInput } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  ApiError,
  createClient,
  listClients,
  createEntry,
  updateEntry,
  type Category,
  type Client,
  type Entry,
  type EntryInput,
  type PaymentMethod,
  type TaxMode,
  type TxType,
  type Vendor,
} from '@/lib/api';
import { splitTax } from '@/lib/tax';
import { money } from '@/lib/format';
import { today } from '@/lib/period';

/* One drawer for money in and money out.

   Two things it does that a plain form would not, and both come straight from
   the reviewed screens:

   The tax is worked out, never asked for. The rate follows from the province
   on the business, so the owner types one figure and says whether it already
   includes tax. That single question is the most common source of wrong
   entries in small business books, and it is asked in plain words rather than
   assumed.

   Business expense and owner drawing are one control, not two screens. There
   is one place money goes out, and choosing between them changes what the form
   asks for and what it promises: a drawing has no tax, no vendor, and a
   purpose note, because it is not an expense and must never reach profit. */

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'E_TRANSFER', label: 'e-Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'PRE_AUTHORISED', label: 'Pre-authorised' },
  { value: 'OTHER', label: 'Other' },
];

export type DrawerMode = { side: 'INCOME' | 'MONEY_OUT'; entry: Entry | null };

type Form = {
  type: TxType;
  date: string;
  amount: string;
  taxMode: TaxMode;
  description: string;
  categoryId: string;
  clientId: string;
  vendorId: string;
  purpose: string;
  paymentMethod: PaymentMethod;
  reference: string;
};

const blank = (side: DrawerMode['side']): Form => ({
  type: side === 'INCOME' ? 'INCOME' : 'EXPENSE',
  date: today(),
  amount: '',
  /* Income defaults to before tax, because an invoice is quoted before tax.
     An expense defaults to tax included, because that is what a receipt shows.
     Getting these two defaults right removes the question most of the time. */
  taxMode: side === 'INCOME' ? 'ADD' : 'INCLUSIVE',
  description: '',
  categoryId: '',
  clientId: '',
  vendorId: '',
  purpose: '',
  paymentMethod: 'BANK_TRANSFER',
  reference: '',
});

const fromEntry = (e: Entry): Form => ({
  type: e.type,
  date: e.date,
  /* Cents back to dollars for the box. The one place this happens on the way
     in; on the way out the API does the conversion. */
  amount: (e.totalCents / 100).toFixed(2),
  taxMode: e.taxMode,
  description: e.description,
  categoryId: e.category?.id ?? '',
  clientId: e.client?.id ?? '',
  vendorId: e.vendor?.id ?? '',
  purpose: e.purpose ?? '',
  paymentMethod: e.paymentMethod ?? 'BANK_TRANSFER',
  reference: e.reference ?? '',
});

/* The amount typed in is the figure the person has in front of them, which
   for an edit is the total. Reopening an entry entered as "before tax" would
   otherwise show the pre-tax figure and quietly add tax to it again, so the
   mode is flipped to inclusive and the total is shown. */
const editable = (e: Entry): Form => ({
  ...fromEntry(e),
  taxMode: e.taxMode === 'NONE' ? 'NONE' : 'INCLUSIVE',
});

export function EntryDrawer({
  mode,
  categories,
  vendors,
  clients,
  taxLabel,
  taxRateBp,
  currency,
  onClose,
  onSaved,
  onClientAdded,
}: {
  mode: DrawerMode;
  categories: Category[];
  vendors: Vendor[];
  clients: Client[];
  taxLabel: string;
  taxRateBp: number;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  onClientAdded: (clients: Client[]) => void;
}) {
  const editing = mode.entry;
  const [form, setForm] = useState<Form>(() =>
    editing ? editable(editing) : blank(mode.side),
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newClient, setNewClient] = useState('');

  const firstField = useRef<HTMLInputElement>(null);

  /* Escape closes the drawer. One of the escape routes the accessibility rules
     ask for on anything modal, and the thing people reach for first. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(() => firstField.current?.focus(), 260);
    return () => clearTimeout(t);
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const drawing = form.type === 'DRAWING';
  const income = mode.side === 'INCOME';

  const kind = income ? 'INCOME' : drawing ? 'DRAWINGS' : 'EXPENSE';
  const usable = categories.filter((c) => c.kind === kind && !c.archived);
  const vendorsFor = form.categoryId
    ? vendors.filter((v) => !v.archived && (v.categoryId === form.categoryId || !v.categoryId))
    : vendors.filter((v) => !v.archived);

  /* The live read out, worked out here exactly as the API works it out on
     save. Same three modes, same rounding, so the figure shown before Save is
     the figure that lands in the books. */
  const amount = Math.round((Number(form.amount) || 0) * 100);
  const mode3 = drawing ? 'NONE' : form.taxMode;
  const { subtotalCents: subtotal, taxCents: tax } = splitTax(amount, mode3, taxRateBp);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    setErrors({});

    const input: EntryInput = {
      date: form.date,
      amount: Number(form.amount),
      description: form.description,
      categoryId: form.categoryId || null,
      paymentMethod: form.paymentMethod,
      reference: form.reference || null,
      ...(drawing
        ? { purpose: form.purpose }
        : { taxMode: form.taxMode, ...(income ? { clientId: form.clientId || null } : { vendorId: form.vendorId || null }) }),
    };

    try {
      if (editing) await updateEntry(form.type, editing.id, input);
      else await createEntry(form.type, input);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        else setProblem(err.message);
      } else {
        setProblem('We could not reach the server. Nothing has been saved.');
      }
      setBusy(false);
    }
  }

  /* Adding a client from here creates the same record the Clients screen
     works with, so there is one list rather than a thin one for this form. */
  async function saveClient() {
    if (!newClient.trim()) return;
    try {
      const created = await createClient({ name: newClient.trim() });
      const refreshed = await listClients();
      onClientAdded(refreshed.clients);
      set('clientId', created.client.id);
      setNewClient('');
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'We could not add that client.');
    }
  }

  const heading = income
    ? editing
      ? 'Edit this income'
      : 'Record income'
    : drawing
      ? editing
        ? 'Edit this drawing'
        : 'Record an owner drawing'
      : editing
        ? 'Edit this expense'
        : 'Record an expense';

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-labelledby="dr-title">
        <div className="drawer-head">
          <div>
            <h2 id="dr-title">{heading}</h2>
            <p className="sub">
              {income
                ? 'Money received into the business'
                : drawing
                  ? 'Money you have taken out for personal use'
                  : 'Money paid out to run the business'}
            </p>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="drawer-body">
        <form id="entry-form" onSubmit={save} noValidate>
          {problem && (
            <div style={{ marginBottom: 18 }}>
              <Notice tone="err" icon="alert">
                {problem}
              </Notice>
            </div>
          )}

          {editing && editing.amended && (
            <div style={{ marginBottom: 18 }}>
              <Notice icon="info" title="This entry has been corrected before">
                Every version is kept. Saving again writes another correction rather than
                overwriting what is here.
              </Notice>
            </div>
          )}

          {/* One place for money out, two things it can be. */}
          {!income && (
            <div className="typeswitch">
              <label className={form.type === 'EXPENSE' ? 'on' : undefined}>
                <input
                  type="radio"
                  name="etype"
                  checked={form.type === 'EXPENSE'}
                  disabled={!!editing}
                  onChange={() => set('type', 'EXPENSE')}
                />
                <b>Business expense</b>
                <span>Reduces profit. Tax is claimable back.</span>
              </label>
              <label className={`draw${drawing ? ' on' : ''}`}>
                <input
                  type="radio"
                  name="etype"
                  checked={drawing}
                  disabled={!!editing}
                  onChange={() => {
                    set('type', 'DRAWING');
                    set('categoryId', categories.find((c) => c.kind === 'DRAWINGS')?.id ?? '');
                  }}
                />
                <b>Owner drawing</b>
                <span>Personal. Not an expense, no tax claim.</span>
              </label>
            </div>
          )}

          {editing && (
            <p className="hint" style={{ margin: '-8px 0 18px' }}>
              An entry cannot change between an expense and a drawing. Remove it and record it
              again, so the correction is visible in the ledger.
            </p>
          )}

          <div className="field-row">
            <Field label="Date" required error={errors.date} hint="YYYY-MM-DD">
              <TextInput
                ref={firstField}
                type="date"
                value={form.date}
                invalid={!!errors.date}
                style={{ fontVariantNumeric: 'tabular-nums' }}
                onChange={(e) => set('date', e.target.value)}
              />
            </Field>
            <Field label="Amount" required error={errors.amount}>
              <TextInput
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                invalid={!!errors.amount}
                style={{ fontVariantNumeric: 'tabular-nums' }}
                onChange={(e) => set('amount', e.target.value)}
              />
            </Field>
          </div>

          {!drawing && (
            <Field
              label="How the amount was entered"
              hint={
                income
                  ? 'Most invoices are quoted before tax, so that is the default.'
                  : 'Most receipts show the total with tax already in it, so that is the default.'
              }
            >
              <Select
                value={form.taxMode}
                onChange={(e) => set('taxMode', e.target.value as TaxMode)}
              >
                <option value="ADD">Before tax, add {taxLabel}</option>
                <option value="INCLUSIVE">Tax included, work {taxLabel} back out</option>
                <option value="NONE">No tax on this entry</option>
              </Select>
            </Field>
          )}

          {/* The read out. Worked out, never typed. */}
          <div className="calc">
            <div className="row">
              <span>Before tax</span>
              <span>{money(subtotal, currency)}</span>
            </div>
            <div className="row">
              <span>{mode3 === 'NONE' ? 'No tax charged' : taxLabel}</span>
              <span>{money(tax, currency)}</span>
            </div>
            <div className="row tot">
              <span>{income ? 'Total received' : 'Total paid'}</span>
              <span>{money(subtotal + tax, currency)}</span>
            </div>
          </div>

          <Field label="Description" required error={errors.description}>
            <TextInput
              placeholder={income ? 'What was this payment for?' : 'What was bought?'}
              value={form.description}
              invalid={!!errors.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>

          {drawing ? (
            <>
              <Notice tone="warn" icon="wallet" title="This will not count as a business expense">
                It is excluded from your profit, from expense reports and from tax you claim
                back. It reduces the owner&apos;s equity only.
              </Notice>

              <Field
                label="What was it for?"
                required
                error={errors.purpose}
                hint="A short note so this still makes sense at year end."
              >
                <textarea
                  className="input"
                  rows={3}
                  maxLength={150}
                  placeholder="For example, monthly household transfer"
                  value={form.purpose}
                  aria-invalid={errors.purpose ? 'true' : undefined}
                  onChange={(e) => set('purpose', e.target.value)}
                />
                <div className="counter">
                  <span className="hint" style={{ margin: 0 }}>
                    Kept with the entry for six years.
                  </span>
                  <span className={`n${form.purpose.length > 120 ? ' warn' : ''}`}>
                    {form.purpose.length} / 150
                  </span>
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="Category" required error={errors.categoryId}>
                <Select
                  value={form.categoryId}
                  onChange={(e) => {
                    set('categoryId', e.target.value);
                    /* The vendor list narrows to the category, so a vendor
                       chosen under the old one has to go with it. */
                    if (!income) set('vendorId', '');
                  }}
                >
                  <option value="">Choose a category…</option>
                  {usable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              {income ? (
                <Field
                  label="Client"
                  error={errors.clientId}
                  hint="Optional. Leave it blank for a payment that is not from a client."
                >
                  <Select value={form.clientId} onChange={(e) => set('clientId', e.target.value)}>
                    <option value="">No client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <div className="addrow" style={{ marginTop: 10 }}>
                    <input
                      className="input"
                      placeholder="Or add a new client…"
                      value={newClient}
                      onChange={(e) => setNewClient(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        void saveClient();
                      }}
                    />
                    <button
                      className="btn"
                      type="button"
                      disabled={!newClient.trim()}
                      onClick={() => void saveClient()}
                    >
                      <Icon name="plus" size={18} /> Add
                    </button>
                  </div>
                </Field>
              ) : (
                <Field
                  label="Vendor"
                  error={errors.vendorId}
                  hint={
                    form.categoryId
                      ? `${vendorsFor.length} vendor${vendorsFor.length === 1 ? '' : 's'} under this category. Add new ones on the Vendors tab in Settings.`
                      : 'Vendors are grouped by category. Choose a category to narrow the list.'
                  }
                >
                  <Select value={form.vendorId} onChange={(e) => set('vendorId', e.target.value)}>
                    <option value="">No vendor</option>
                    {vendorsFor.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}

          <div className="field-row">
            <Field label="Payment method">
              <Select
                value={form.paymentMethod}
                onChange={(e) => set('paymentMethod', e.target.value as PaymentMethod)}
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference" error={errors.reference}>
              <TextInput
                placeholder="Cheque or transfer number"
                value={form.reference}
                invalid={!!errors.reference}
                onChange={(e) => set('reference', e.target.value)}
              />
            </Field>
          </div>

          {/* Drawn because it is on the approved screen, and deliberately inert.
              A receipt needs somewhere private to live, with signed links and
              nothing public, and that is Phase 8. A control that accepted a
              file and dropped it would be worse than one that says when it
              arrives. */}
          <Field label="Receipt or document">
            <button className="drop" type="button" style={{ width: '100%' }} disabled>
              <Icon name="upload" size={24} />
              <b>Attaching receipts arrives with document storage</b>
              Files need private storage and signed links, which is Phase 8
            </button>
          </Field>

        </form>
        </div>

        {/* Outside the scrolling body, so it stays put on a long form. The
            submit button reaches its form by id, which is what the form
            attribute is for. */}
        <div className="drawer-foot">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="entry-form"
            disabled={busy}
            aria-busy={busy}
          >
            {busy
              ? 'Saving…'
              : editing
                ? 'Save the correction'
                : income
                  ? 'Save income'
                  : drawing
                    ? 'Save drawing'
                    : 'Save expense'}
          </button>
        </div>
      </aside>
    </>
  );
}
