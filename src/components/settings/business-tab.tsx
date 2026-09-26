'use client';

import { useState } from 'react';
import { Field, Notice, Select, TextInput } from '@/components/form';
import { Icon } from '@/components/icon';
import { ApiError, saveBusiness, type SettingsPayload } from '@/lib/api';
import { findProvince } from '@/lib/tax';
import { useDraft } from './use-draft';
import { useSaveBar } from './save-bar';
import { useToast } from './toast';

/* Who the business is, as the CRA and its clients need to see it.

   The province is shown here and set on the Tax tab. It appears twice on
   purpose: somebody checking their address wants to see the province in it,
   and somebody changing their province is changing their tax rate, which is a
   heavier decision than editing a line of an address. */

const TYPES = [
  { value: 'SOLE_PROPRIETOR', label: 'Sole proprietor' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'CORPORATION', label: 'Incorporated company' },
  { value: 'CONTRACTOR', label: 'Independent contractor' },
] as const;

type Form = {
  legalName: string;
  name: string;
  businessType: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  email: string;
  phone: string;
  website: string;
  businessNumber: string;
};

export function BusinessTab({
  data,
  onSaved,
}: {
  data: SettingsPayload;
  onSaved: (payload: SettingsPayload) => void;
}) {
  const b = data.business;
  const toast = useToast();
  const province = findProvince(b.province);

  const draft = useDraft<Form>({
    legalName: b.legalName ?? b.name,
    /* Blank when the trading name is the legal name, so the field reads as
       "nothing to say here" rather than as a duplicate to keep in step. */
    name: b.name === (b.legalName ?? b.name) ? '' : b.name,
    businessType: b.businessType,
    addressLine1: b.addressLine1 ?? '',
    addressLine2: b.addressLine2 ?? '',
    city: b.city ?? '',
    postalCode: b.postalCode ?? '',
    email: b.email ?? '',
    phone: b.phone ?? '',
    website: b.website ?? '',
    businessNumber: b.businessNumber ?? '',
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const payload = await saveBusiness(draft.value);
      draft.commit(draft.value);
      onSaved(payload);
      toast('Your business profile has been saved.');
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

  const v = draft.value;

  return (
    <section className="tabpane">
      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Business profile</h2>
              <p className="csub">Who you are, as the CRA and your clients need to see it.</p>
            </div>
          </div>

          <div className="setbody">
            <div className="setsec">
              <h3>The business</h3>
              <p className="ssub">
                The legal name is what appears on invoices. If you trade under a different
                name, both can be shown.
              </p>

              <Field label="Legal business name" required error={errors.legalName}>
                <TextInput
                  value={v.legalName}
                  invalid={!!errors.legalName}
                  onChange={(e) => draft.set('legalName', e.target.value)}
                />
              </Field>

              <div className="field-row">
                <Field label="Trading name, if different" error={errors.name}>
                  <TextInput
                    value={v.name}
                    placeholder="Leave blank to use the legal name"
                    invalid={!!errors.name}
                    onChange={(e) => draft.set('name', e.target.value)}
                  />
                </Field>
                <Field label="Business type">
                  <Select
                    value={v.businessType}
                    onChange={(e) => draft.set('businessType', e.target.value)}
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field
                label="Business number"
                hint="The nine digit number the CRA issued you. Your GST/HST registration is set on the Tax tab."
                error={errors.businessNumber}
              >
                <TextInput
                  value={v.businessNumber}
                  placeholder="123456789"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                  invalid={!!errors.businessNumber}
                  onChange={(e) => draft.set('businessNumber', e.target.value)}
                />
              </Field>
            </div>

            <div className="setsec">
              <h3>Business address</h3>
              <p className="ssub">
                Printed on every invoice. The CRA requires the seller&apos;s address on any
                invoice of $30 or more.
              </p>

              <Field label="Street address" error={errors.addressLine1}>
                <TextInput
                  value={v.addressLine1}
                  placeholder="118 Simcoe Street, Suite 400"
                  invalid={!!errors.addressLine1}
                  onChange={(e) => draft.set('addressLine1', e.target.value)}
                />
              </Field>

              <div className="field-3">
                <Field label="City" error={errors.city}>
                  <TextInput
                    value={v.city}
                    invalid={!!errors.city}
                    onChange={(e) => draft.set('city', e.target.value)}
                  />
                </Field>
                <Field label="Province" hint="Set on the Tax and currency tab.">
                  <TextInput value={province?.name ?? b.province} readOnly />
                </Field>
                <Field label="Postal code" error={errors.postalCode}>
                  <TextInput
                    value={v.postalCode}
                    placeholder="M5H 3G4"
                    style={{ textTransform: 'uppercase' }}
                    invalid={!!errors.postalCode}
                    onChange={(e) => draft.set('postalCode', e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="setsec">
              <h3>How people reach you</h3>
              <p className="ssub">
                These appear in the invoice footer, so a client can query a bill without
                hunting for your details.
              </p>

              <div className="field-row">
                <Field label="Business email" error={errors.email}>
                  <TextInput
                    type="email"
                    inputMode="email"
                    value={v.email}
                    placeholder="you@yourbusiness.ca"
                    invalid={!!errors.email}
                    onChange={(e) => draft.set('email', e.target.value)}
                  />
                </Field>
                <Field label="Phone" error={errors.phone}>
                  <TextInput
                    type="tel"
                    value={v.phone}
                    placeholder="416 555 0148"
                    invalid={!!errors.phone}
                    onChange={(e) => draft.set('phone', e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Website" error={errors.website}>
                <TextInput
                  value={v.website}
                  placeholder="yourbusiness.ca"
                  invalid={!!errors.website}
                  onChange={(e) => draft.set('website', e.target.value)}
                />
              </Field>
            </div>

            <div className="setsec">
              <h3>Your logo</h3>
              <p className="ssub">
                Appears at the top of every invoice and on the PDF. A PNG with a transparent
                background, or an SVG, gives the sharpest result.
              </p>

              {/* Drawn, and deliberately not working yet.

                  Uploading a file needs somewhere private to put it, and that is
                  Phase 8: private buckets, signed URLs, nothing public. A button
                  that accepted a logo and quietly dropped it would be worse than
                  one that says when it arrives. */}
              <button className="drop" type="button" style={{ width: '100%' }} disabled>
                <Icon name="upload" size={26} />
                <b>Logo upload arrives with receipt storage</b>
                Files need private storage and signed links, which is Phase 8
              </button>
            </div>
          </div>
        </div>

        <div className="rail">
          <Notice icon="invoice" title="Where these go">
            The name, address and business number print in the top left of every invoice.
            Email and phone print in the footer. Change one here and every invoice you send
            from then on carries the new detail. Issued invoices are never rewritten.
          </Notice>
          <Notice tone="warn" icon="alert" title="Still waiting on the real details">
            Variantage&apos;s own address, business number and footer wording drop straight in
            once they arrive. Nothing else has to change when they do.
          </Notice>
        </div>
      </div>
    </section>
  );
}
