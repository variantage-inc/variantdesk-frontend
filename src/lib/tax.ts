/* Canadian sales tax by province, current to 2026.

   Copied from the mockups so the sign up screen shows the same rates the client
   reviewed. It is display only: the rate that lands on an actual invoice is
   worked out and stored by the API, never sent up from the browser. */

export type Province = {
  code: string;
  name: string;
  rate: string;
  note: string;
};

export const PROVINCES: Province[] = [
  { code: 'AB', name: 'Alberta', rate: 'GST 5%', note: 'GST only. No provincial sales tax.' },
  {
    code: 'BC',
    name: 'British Columbia',
    rate: 'GST 5% + PST 7%',
    note: 'Charged separately, never compounded. PST is not recoverable.',
  },
  {
    code: 'MB',
    name: 'Manitoba',
    rate: 'GST 5% + RST 7%',
    note: 'Charged separately. RST is not recoverable.',
  },
  {
    code: 'NB',
    name: 'New Brunswick',
    rate: 'HST 15%',
    note: 'Single harmonised rate, fully recoverable.',
  },
  {
    code: 'NL',
    name: 'Newfoundland and Labrador',
    rate: 'HST 15%',
    note: 'Single harmonised rate, fully recoverable.',
  },
  { code: 'NS', name: 'Nova Scotia', rate: 'HST 14%', note: 'Reduced from 15% on 1 April 2025.' },
  {
    code: 'NT',
    name: 'Northwest Territories',
    rate: 'GST 5%',
    note: 'GST only. No territorial sales tax.',
  },
  { code: 'NU', name: 'Nunavut', rate: 'GST 5%', note: 'GST only. No territorial sales tax.' },
  {
    code: 'ON',
    name: 'Ontario',
    rate: 'HST 13%',
    note: 'Single harmonised rate, fully recoverable.',
  },
  {
    code: 'PE',
    name: 'Prince Edward Island',
    rate: 'HST 15%',
    note: 'Single harmonised rate, fully recoverable.',
  },
  {
    code: 'QC',
    name: 'Quebec',
    rate: 'GST 5% + QST 9.975%',
    note: 'Charged separately. QST is recoverable for registrants.',
  },
  {
    code: 'SK',
    name: 'Saskatchewan',
    rate: 'GST 5% + PST 6%',
    note: 'Charged separately. PST is not recoverable.',
  },
  { code: 'YT', name: 'Yukon', rate: 'GST 5%', note: 'GST only. No territorial sales tax.' },
];

export const findProvince = (code: string): Province | undefined =>
  PROVINCES.find((p) => p.code === code);

/* The three tax modes, worked out in one place.

   The API does this in `lib/money.ts` and it is the authority; this is the
   read out a screen shows BEFORE saving, with the same rounding, so the figure
   somebody approves is the figure that lands in the books. Two screens need
   it, the typed entry drawer and the voice confirmation, and two copies of it
   would be two answers waiting to differ by a cent. */
export type TaxMode = 'ADD' | 'INCLUSIVE' | 'NONE';

export function splitTax(
  amountCents: number,
  mode: TaxMode,
  taxRateBp: number,
): { subtotalCents: number; taxCents: number; totalCents: number } {
  if (mode === 'NONE') {
    return { subtotalCents: amountCents, taxCents: 0, totalCents: amountCents };
  }
  if (mode === 'INCLUSIVE') {
    const subtotal = Math.round((amountCents * 10000) / (10000 + taxRateBp));
    return {
      subtotalCents: subtotal,
      taxCents: amountCents - subtotal,
      totalCents: amountCents,
    };
  }
  const tax = Math.round((amountCents * taxRateBp) / 10000);
  return { subtotalCents: amountCents, taxCents: tax, totalCents: amountCents + tax };
}
