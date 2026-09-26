'use client';

import { useState } from 'react';
import { Field, Notice, Select, TextInput } from '@/components/form';
import { Icon } from '@/components/icon';
import { ApiError, saveTax, type SettingsPayload } from '@/lib/api';
import { money } from '@/lib/format';
import { useDraft } from './use-draft';
import { useSaveBar } from './save-bar';
import { useToast } from './toast';

/* The province, and the rates that follow from it. You never type a tax rate.

   The province is shown, not chosen: it is set at signup and fixed, because
   every tax figure already in the books was worked out from it. */

const MONTHS = [
  [1, 'January'],
  [4, 'April'],
  [7, 'July'],
  [9, 'September'],
] as const;

const SAMPLE_CENTS = 1_154_000;

type Form = {
  currency: string;
  dateFormat: string;
  fyStartMonth: number;
  gstRegistered: boolean;
  gstHstNumber: string;
};

export function TaxTab({
  data,
  onSaved,
}: {
  data: SettingsPayload;
  onSaved: (payload: SettingsPayload) => void;
}) {
  const b = data.business;
  const toast = useToast();

  const draft = useDraft<Form>({
    currency: b.currency,
    dateFormat: b.dateFormat,
    fyStartMonth: b.fyStartMonth,
    gstRegistered: b.gstRegistered,
    gstHstNumber: b.gstHstNumber ?? '',
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const v = draft.value;
  const chosen = data.provinces.find((p) => p.code === b.province);

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const payload = await saveTax(v);
      draft.commit({
        currency: payload.business.currency,
        dateFormat: payload.business.dateFormat,
        fyStartMonth: payload.business.fyStartMonth,
        gstRegistered: payload.business.gstRegistered,
        gstHstNumber: payload.business.gstHstNumber ?? '',
      });
      onSaved(payload);
      toast('Your tax and currency settings have been saved.');
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

  const sampleDate =
    v.dateFormat === 'DD/MM/YYYY'
      ? '09/08/2026'
      : v.dateFormat === 'MM/DD/YYYY'
        ? '08/09/2026'
        : '2026/08/09';

  return (
    <section className="tabpane">
      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Tax and currency</h2>
              <p className="csub">
                Your province sets the tax. You never type a tax rate.
              </p>
            </div>
          </div>

          <div className="setbody">
            <div className="setsec">
              <h3>Where you do business</h3>
              <p className="ssub">
                The province sets which sales tax applies and at what rate, on every invoice
                and every expense.
              </p>

              <Field
                label="Province or territory"
                hint="Set when the account was created, and fixed from then on, because every tax figure in your books was worked out from it. If your business has moved, contact support."
              >
                <TextInput value={chosen?.name ?? b.province} readOnly />
              </Field>

              <Notice icon="shield">
                <b>
                  {chosen?.name} — {chosen?.label}
                </b>
                {chosen?.note}
              </Notice>
            </div>

            <div className="setsec">
              <h3>Registration</h3>
              <p className="ssub">
                Registration is required once you pass $30,000 in revenue over four
                consecutive quarters. Until then, charging tax is optional.
              </p>

              <label className="check" style={{ marginBottom: 18 }}>
                <input
                  type="checkbox"
                  checked={v.gstRegistered}
                  onChange={(e) => draft.set('gstRegistered', e.target.checked)}
                />
                <span className="box">
                  <Icon name="check" size={15} sw={3.4} />
                </span>
                <span>My business is registered for GST/HST</span>
              </label>

              {v.gstRegistered && (
                <Field
                  label="GST/HST registration number"
                  required
                  error={errors.gstHstNumber}
                  hint="Fifteen characters: nine digits, then RT and four more. It must appear on every invoice you charge tax on, or the client cannot claim it back."
                >
                  <TextInput
                    value={v.gstHstNumber}
                    placeholder="123456789 RT0001"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                    invalid={!!errors.gstHstNumber}
                    onChange={(e) => draft.set('gstHstNumber', e.target.value)}
                  />
                </Field>
              )}
            </div>

            <div className="setsec">
              <h3>Money and dates</h3>
              <p className="ssub">How figures and dates are written everywhere in Variantage.</p>

              <div className="field-3">
                <Field label="Currency">
                  <Select
                    value={v.currency}
                    onChange={(e) => draft.set('currency', e.target.value)}
                  >
                    <option value="CAD">Canadian dollar, CAD</option>
                    <option value="USD">US dollar, USD</option>
                  </Select>
                </Field>
                <Field label="Date format" hint="YYYY/MM/DD sorts correctly and cannot be misread.">
                  <Select
                    value={v.dateFormat}
                    onChange={(e) => draft.set('dateFormat', e.target.value)}
                  >
                    <option>YYYY/MM/DD</option>
                    <option>DD/MM/YYYY</option>
                    <option>MM/DD/YYYY</option>
                  </Select>
                </Field>
                <Field label="Financial year starts" hint='Sets what "this year" means in reports.'>
                  <Select
                    value={v.fyStartMonth}
                    onChange={(e) => draft.set('fyStartMonth', Number(e.target.value))}
                  >
                    {MONTHS.map(([n, label]) => (
                      <option key={n} value={n}>
                        1 {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="prev">
                <h4>How your figures will read</h4>
                <div className="big">{money(SAMPLE_CENTS, v.currency)}</div>
                <div className="then">
                  Invoice dated {sampleDate} · financial year from 1{' '}
                  {MONTHS.find(([n]) => n === v.fyStartMonth)?.[1] ?? 'January'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rail">
          <Notice tone="ok" icon="check" title="Rates are never typed in">
            Every province is already in the system, including the ones where GST and PST are
            charged separately rather than combined. Every invoice, every expense and the tax
            report use your province&apos;s rate, and each keeps the rate it was recorded at.
          </Notice>
          <Notice icon="info" title="One currency for your books">
            Canadian or US dollars. This is the currency the business keeps its books in, not a
            converter.
          </Notice>
        </div>
      </div>
    </section>
  );
}
