'use client';

import { useEffect, useState } from 'react';
import { Field, Notice, Select, TextInput } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  ApiError,
  createClient,
  getClient,
  updateClient,
  type ClientInput,
} from '@/lib/api';
import { PROVINCES } from '@/lib/tax';

/* Adding or editing a client.

   The billing address is not optional decoration. The CRA wants the buyer's
   name and address on any invoice of $30 or more, and the invoice copies both
   off this record when it is raised. Leaving it blank means every invoice
   raised for this client is missing something its recipient needs. */

const BLANK: ClientInput = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  province: 'ON',
  postalCode: '',
  paymentTermsDays: null,
  notes: '',
};

const TERMS = [
  [30, 'Net 30'],
  [15, 'Net 15'],
  [14, 'Net 14'],
  [7, 'Net 7'],
  [0, 'Due on receipt'],
] as const;

export function ClientDrawer({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState<ClientInput>(BLANK);
  const [defaultTerms, setDefaultTerms] = useState(30);
  const [loading, setLoading] = useState(Boolean(clientId));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    getClient(clientId)
      .then((r) => {
        if (cancelled) return;
        setForm({ ...BLANK, ...r.client });
        setDefaultTerms(r.client.defaultTermsDays);
      })
      .catch(() => !cancelled && setProblem('We could not load that client.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof ClientInput>(key: K, value: ClientInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    setErrors({});
    try {
      const r = clientId ? await updateClient(clientId, form) : await createClient(form);
      onSaved(r.client.id!);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        else setProblem(err.message);
      } else {
        setProblem('We could not reach the server.');
      }
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-labelledby="cl-title">
        <div className="drawer-head">
          <div>
            <h2 id="cl-title">{clientId ? 'Edit this client' : 'Add a client'}</h2>
            <p className="sub">Their details go on every invoice you raise for them.</p>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="drawer-body">
          {loading ? (
            <p className="hint">Loading…</p>
          ) : (
            <form id="client-form" onSubmit={save} noValidate>
              {problem && (
                <div style={{ marginBottom: 18 }}>
                  <Notice tone="err" icon="alert">
                    {problem}
                  </Notice>
                </div>
              )}

              <Field label="Business name" required error={errors.name}>
                <TextInput
                  autoFocus
                  value={form.name}
                  invalid={!!errors.name}
                  placeholder="Northwind Studio"
                  onChange={(e) => set('name', e.target.value)}
                />
              </Field>

              <Field label="Who you deal with" error={errors.contactName}>
                <TextInput
                  value={form.contactName ?? ''}
                  invalid={!!errors.contactName}
                  placeholder="Dan Petrov"
                  onChange={(e) => set('contactName', e.target.value)}
                />
              </Field>

              <div className="field-row">
                <Field label="Email" error={errors.email}>
                  <TextInput
                    type="email"
                    inputMode="email"
                    value={form.email ?? ''}
                    invalid={!!errors.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </Field>
                <Field label="Phone" error={errors.phone}>
                  <TextInput
                    type="tel"
                    value={form.phone ?? ''}
                    invalid={!!errors.phone}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </Field>
              </div>

              <Field
                label="Billing address"
                error={errors.addressLine1}
                hint="The CRA wants the buyer's name and address on any invoice of $30 or more."
              >
                <TextInput
                  value={form.addressLine1 ?? ''}
                  invalid={!!errors.addressLine1}
                  placeholder="55 King Street West"
                  onChange={(e) => set('addressLine1', e.target.value)}
                />
              </Field>

              <div className="field-3">
                <Field label="City" error={errors.city}>
                  <TextInput
                    value={form.city ?? ''}
                    invalid={!!errors.city}
                    onChange={(e) => set('city', e.target.value)}
                  />
                </Field>
                <Field label="Province">
                  <Select
                    value={form.province ?? 'ON'}
                    onChange={(e) => set('province', e.target.value)}
                  >
                    {PROVINCES.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Postal code" error={errors.postalCode}>
                  <TextInput
                    value={form.postalCode ?? ''}
                    invalid={!!errors.postalCode}
                    style={{ textTransform: 'uppercase' }}
                    onChange={(e) => set('postalCode', e.target.value)}
                  />
                </Field>
              </div>

              <Field
                label="Payment terms for this client"
                hint="Overrides your template for their invoices only."
              >
                <Select
                  value={form.paymentTermsDays ?? ''}
                  onChange={(e) =>
                    set('paymentTermsDays', e.target.value === '' ? null : Number(e.target.value))
                  }
                >
                  <option value="">
                    Use my usual terms, Net {defaultTerms === 0 ? '0' : defaultTerms}
                  </option>
                  {TERMS.map(([days, label]) => (
                    <option key={days} value={days}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Notes" error={errors.notes} hint="Only you see these.">
                <textarea
                  className="input"
                  rows={3}
                  value={form.notes ?? ''}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </Field>
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
            form="client-form"
            disabled={busy || loading}
            aria-busy={busy}
          >
            {busy ? 'Saving…' : clientId ? 'Save changes' : 'Add client'}
          </button>
        </div>
      </aside>
    </>
  );
}
