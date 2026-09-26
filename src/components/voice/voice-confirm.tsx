'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import { Select, TextInput } from '@/components/form';
import {
  ApiError,
  confirmVoice,
  discardVoice,
  type VoiceDraft,
  type VoiceOptions,
} from '@/lib/api';
import { money } from '@/lib/format';
import { splitTax, type TaxMode } from '@/lib/tax';

/* The confirmation, which is the entire point of voice entry.

   Nothing reached the ledger to get here. What is on this screen is a
   proposal, and it becomes money only when somebody presses Save, at which
   point it is validated and written exactly as a typed entry is. The model's
   answer is not consulted again: whatever is in these fields is what is saved.

   ONE DEPARTURE FROM THE MOCKUP, and it is deliberate. The mockup gives a
   field either a Change button or an amber "Guessed" chip, never both, which
   means the fields most likely to be wrong are the ones you cannot correct.
   Here every field has a Change button and a guessed field ALSO carries the
   chip and the reason. Same visual language, without the trap. */

type Props = {
  draft: VoiceDraft;
  options: VoiceOptions;
  onSaved: (message: string) => void;
  onDiscarded: () => void;
  onAgain: () => void;
};

const KIND = {
  INCOME: { label: 'Income', tag: 'tag-in', note: 'Money coming into the business' },
  EXPENSE: { label: 'Business expense', tag: 'tag-out', note: 'Money paid out to run the business' },
  DRAWING: {
    label: 'Owner drawing',
    tag: 'tag-draw',
    note: 'Money taken out for personal use, never counted as an expense',
  },
} as const;

type Kind = keyof typeof KIND;

/* One row of the parsed list: the value, why it was guessed if it was, and a
   Change button that turns the row into the right control.

   At module scope rather than inside the screen, because a component defined
   during render is a new component type on every keystroke, and React throws
   away and rebuilds the input underneath the cursor. */
function Row({
  label,
  value,
  sub,
  why,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  why: string | null;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`pf${why ? ' guess' : ''}`}>
      <span className="k">{label}</span>
      {open ? (
        <span className="v" style={{ fontWeight: 500 }}>
          {children}
        </span>
      ) : (
        <span className="v">
          {value}
          {(sub || why) && <small>{why ?? sub}</small>}
        </span>
      )}
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {why && !open && (
          <span
            className="chip chip-tbc"
            style={{ background: 'transparent', borderColor: '#f0dcb8', color: 'var(--warn-600)' }}
          >
            <Icon name="alert" size={13} sw={2.6} /> Guessed
          </span>
        )}
        <button className="btn btn-sm" type="button" onClick={onToggle}>
          {open ? 'Done' : 'Change'}
        </button>
      </span>
    </div>
  );
}

export function VoiceConfirm({ draft, options, onSaved, onDiscarded, onAgain }: Props) {
  const [type, setType] = useState<Kind>((draft.type ?? 'EXPENSE') as Kind);
  const [amount, setAmount] = useState(((draft.amountCents ?? 0) / 100).toFixed(2));
  const [taxMode, setTaxMode] = useState<TaxMode>((draft.taxMode ?? 'INCLUSIVE') as TaxMode);
  const [date, setDate] = useState(draft.date ?? options.today);
  const [description, setDescription] = useState(draft.description ?? '');
  const [purpose, setPurpose] = useState(draft.purpose ?? '');
  const [categoryId, setCategoryId] = useState(draft.category?.id ?? '');
  const [clientId, setClientId] = useState(draft.client?.id ?? '');
  const [vendorId, setVendorId] = useState(draft.vendor?.id ?? '');

  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const drawing = type === 'DRAWING';
  const income = type === 'INCOME';
  const taxLabel = options.tax.label;
  const currency = options.currency;

  /* The same read out the typed drawer shows, from the same helper, so the
     figure approved here is the figure that lands in the books. */
  const cents = Math.round((Number(amount) || 0) * 100);
  const mode: TaxMode = drawing ? 'NONE' : taxMode;
  const split = splitTax(cents, mode, options.tax.totalBp);

  const reasonFor = (field: string): string | null =>
    draft.guesses.find((g) => g.field === field)?.reason ?? null;

  const categories = options.categories.filter((c) =>
    drawing ? c.kind === 'DRAWINGS' : c.kind === (income ? 'INCOME' : 'EXPENSE'),
  );

  async function save() {
    setProblem(null);

    if (!(cents > 0)) {
      setProblem('An amount has to be more than zero.');
      setEditing('amount');
      return;
    }
    if (!description.trim()) {
      setProblem('Say what it was for.');
      setEditing('description');
      return;
    }

    setSaving(true);
    try {
      await confirmVoice(draft.id, {
        type,
        date,
        amount: cents / 100,
        description: description.trim(),
        categoryId: categoryId || null,
        clientId: income ? clientId || null : null,
        vendorId: type === 'EXPENSE' ? vendorId || null : null,
        taxMode: mode,
        ...(drawing ? { purpose: purpose.trim() || description.trim() } : {}),
      });

      onSaved(
        `${KIND[type].label} of ${money(split.totalCents, currency)} saved` +
          (drawing ? ', and kept out of your profit.' : '.'),
      );
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That did not save. Try again.');
      setSaving(false);
    }
  }

  async function discard() {
    try {
      await discardVoice(draft.id);
    } catch {
      /* The draft is a proposal and it is money nowhere, so a failure to mark
         it discarded is not something to stop somebody over. */
    }
    onDiscarded();
  }

  return (
    <div className="stage" style={{ textAlign: 'left', padding: '26px 26px 28px' }}>
      <div style={{ width: '100%' }}>
        <div className="notice notice-ok" style={{ marginBottom: 20 }}>
          <Icon name="check" size={22} />
          <span>
            <b>Check this before it is saved</b>
            {drawing
              ? 'Nothing has been written to your books yet. This will be recorded as a drawing and kept out of your profit.'
              : 'Nothing has been written to your books yet. Change anything that is wrong, then press Save.'}
          </span>
        </div>

        <div className="heard" style={{ maxWidth: 'none', marginBottom: 18 }}>
          <span className="q">What you said</span>
          <span>{draft.transcript}</span>
        </div>

        {problem && (
          <div className="notice notice-err" style={{ marginBottom: 18 }}>
            <Icon name="alert" size={22} />
            <span>{problem}</span>
          </div>
        )}

        <div className="parsed">
          <Row
            why={reasonFor('kind')}
            open={editing === 'kind'}
            onToggle={() => setEditing(editing === 'kind' ? null : 'kind')}
            label="Type of entry"
            value={
              <span className={`tag ${KIND[type].tag}`} style={{ height: 28, fontSize: 14 }}>
                {KIND[type].label}
              </span>
            }
            sub={KIND[type].note}
          >
            <Select
              value={type}
              onChange={(e) => {
                const next = e.target.value as Kind;
                setType(next);
                /* The category belongs to the old kind, and a drawing takes
                   the locked one. Cleared rather than carried across, because
                   an expense category on an income entry is refused by the API
                   and confusing on the way there. */
                setCategoryId(
                  next === 'DRAWING'
                    ? (options.categories.find((c) => c.kind === 'DRAWINGS')?.id ?? '')
                    : '',
                );
              }}
            >
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Business expense</option>
              <option value="DRAWING">Owner drawing</option>
            </Select>
          </Row>

          <Row
            why={reasonFor('amount')}
            open={editing === 'amount'}
            onToggle={() => setEditing(editing === 'amount' ? null : 'amount')}
            label="Amount"
            value={money(cents, currency)}
            sub={
              drawing
                ? 'No tax on a drawing'
                : mode === 'INCLUSIVE'
                  ? 'As you said it, tax included'
                  : mode === 'ADD'
                    ? `Before tax, ${taxLabel} added`
                    : 'No tax on this entry'
            }
          >
            <div style={{ display: 'grid', gap: 8 }}>
              <TextInput
                inputMode="decimal"
                value={amount}
                style={{ fontVariantNumeric: 'tabular-nums' }}
                onChange={(e) => setAmount(e.target.value)}
              />
              {!drawing && (
                <Select value={taxMode} onChange={(e) => setTaxMode(e.target.value as TaxMode)}>
                  <option value="INCLUSIVE">Tax included, work {taxLabel} back out</option>
                  <option value="ADD">Before tax, add {taxLabel}</option>
                  <option value="NONE">No tax on this entry</option>
                </Select>
              )}
            </div>
          </Row>

          <Row
            why={reasonFor('categoryName')}
            open={editing === 'categoryName'}
            onToggle={() => setEditing(editing === 'categoryName' ? null : 'categoryName')}
            label="Category"
            value={
              categories.find((c) => c.id === categoryId)?.name ?? (
                <span className="muted">Not chosen</span>
              )
            }
          >
            <Select
              value={categoryId}
              disabled={drawing}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Row>

          {!drawing && (
            <Row
            why={reasonFor('party')}
            open={editing === 'party'}
            onToggle={() => setEditing(editing === 'party' ? null : 'party')}
              label={income ? 'Client' : 'Vendor'}
              value={
                income ? (
                  (options.clients.find((c) => c.id === clientId)?.name ?? (
                    <span className="muted">{draft.party ?? 'Nobody attached'}</span>
                  ))
                ) : (
                  (options.vendors.find((v) => v.id === vendorId)?.name ?? (
                    <span className="muted">{draft.party ?? 'Nobody attached'}</span>
                  ))
                )
              }
              sub={
                income
                  ? 'Who the money came from'
                  : 'Who it was paid to. Add a new one on the Vendors tab in Settings'
              }
            >
              {income ? (
                <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">No client</option>
                  {options.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                  <option value="">No vendor</option>
                  {options.vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              )}
            </Row>
          )}

          <Row
            why={reasonFor('date')}
            open={editing === 'date'}
            onToggle={() => setEditing(editing === 'date' ? null : 'date')} label="Date" value={date.replace(/-/g, '/')}>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Row>

          <Row
            why={reasonFor('description')}
            open={editing === 'description'}
            onToggle={() => setEditing(editing === 'description' ? null : 'description')}
            label="Description"
            value={description || <span className="muted">Not set</span>}
          >
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
          </Row>

          {drawing && (
            <Row
            why={reasonFor('purpose')}
            open={editing === 'purpose'}
            onToggle={() => setEditing(editing === 'purpose' ? null : 'purpose')}
              label="What it was for"
              value={purpose || <span className="muted">Not set</span>}
              sub="Kept so this still makes sense at year end"
            >
              <TextInput
                maxLength={150}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </Row>
          )}
        </div>

        <div className="calc" style={{ marginTop: 18 }}>
          {drawing ? (
            <>
              <div className="row">
                <span>Amount taken</span>
                <span>{money(split.totalCents, currency)}</span>
              </div>
              <div className="row">
                <span>Tax</span>
                <span>None, a drawing is not a purchase</span>
              </div>
              <div className="row tot">
                <span>Kept out of profit</span>
                <span>{money(split.totalCents, currency)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="row">
                <span>Amount before tax</span>
                <span>{money(split.subtotalCents, currency)}</span>
              </div>
              <div className="row">
                <span>{mode === 'NONE' ? 'No tax charged' : `${taxLabel} (${options.tax.name})`}</span>
                <span>{money(split.taxCents, currency)}</span>
              </div>
              <div className="row tot">
                <span>{income ? 'Received in total' : 'Paid in total'}</span>
                <span>{money(split.totalCents, currency)}</span>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          <button className="btn btn-primary" type="button" disabled={saving} onClick={save}>
            <Icon name="check" size={19} />{' '}
            {saving
              ? 'Saving…'
              : `Save ${income ? 'income' : drawing ? 'drawing' : 'expense'}`}
          </button>
          <button className="btn" type="button" disabled={saving} onClick={onAgain}>
            <Icon name="mic" size={18} /> Say it again
          </button>
          <button className="btn btn-quiet" type="button" disabled={saving} onClick={discard}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
