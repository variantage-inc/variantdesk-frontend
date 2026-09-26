/* The Month / Quarter / Year / Custom filter that sits on every list screen.

   Ranges are worked out in plain local dates and handed to the API as
   YYYY-MM-DD strings. No timezone conversion anywhere: a bookkeeping period is
   a date on a calendar, not an instant, and treating it as an instant is how
   an entry made in the evening lands in the wrong month.

   The financial year start is deliberately NOT applied to Year. "Year" here
   means the calendar year the customer is looking at, which is what somebody
   scanning a list expects. The financial year matters to reports, and Phase 9
   applies it there where it means something. */

export type PeriodKind = 'month' | 'quarter' | 'year' | 'custom';

export type Range = { from: string; to: string };

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* Day 0 of the next month is the last day of this one, which is how February
   and the thirty day months take care of themselves. */
const endOfMonth = (year: number, month: number): Date => new Date(year, month + 1, 0);

export function rangeFor(kind: PeriodKind, anchor = new Date()): Range {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  if (kind === 'quarter') {
    const first = Math.floor(month / 3) * 3;
    return { from: iso(new Date(year, first, 1)), to: iso(endOfMonth(year, first + 2)) };
  }
  if (kind === 'year') {
    return { from: iso(new Date(year, 0, 1)), to: iso(new Date(year, 11, 31)) };
  }
  /* Custom starts as the current month and is then edited by hand, so there is
     never an empty date box to work out. */
  return { from: iso(new Date(year, month, 1)), to: iso(endOfMonth(year, month)) };
}

/* What the heading says, in the same words the mockups use. */
export function describe(kind: PeriodKind, range: Range): string {
  const from = new Date(`${range.from}T00:00:00`);

  if (kind === 'month') {
    return from.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  }
  if (kind === 'quarter') {
    return `Q${Math.floor(from.getMonth() / 3) + 1} ${from.getFullYear()}`;
  }
  if (kind === 'year') return String(from.getFullYear());

  return `${range.from.replace(/-/g, '/')} to ${range.to.replace(/-/g, '/')}`;
}

/* Today, as the API wants it. Used as the default date on a new entry, because
   most entries are made on the day the money moved. */
export const today = (): string => iso(new Date());
