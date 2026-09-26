/* How figures and dates are written, in one place.

   Money arrives from the API as whole cents and is only ever turned into a
   decimal here, at the last possible moment before it is drawn. Doing the
   division earlier is how a total ends up a cent away from the sum of its
   lines. */

export const money = (cents: number, currency = 'CAD'): string =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);

/* The price list is written in whole dollars, so a trailing .00 on every plan
   is noise. Anything with cents in it still shows them. */
export const price = (cents: number, currency = 'CAD'): string =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/* YYYY/MM/DD is the default because it sorts correctly and cannot be misread:
   2026/03/04 is unambiguous where 03/04/2026 is not. The business can choose
   another on the Tax tab, and every screen reads that choice from here. */
export type DateFormat = 'YYYY/MM/DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';

export function formatDate(value: string | Date | null, fmt: DateFormat = 'YYYY/MM/DD'): string {
  if (!value) return '';
  /* A bare date is a calendar day, not an instant. Read as UTC midnight it
     becomes the previous evening anywhere west of Greenwich, which is all of
     Canada, so it is read as local midnight instead. Timestamps still convert. */
  const d =
    typeof value === 'string'
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
      : value;
  if (Number.isNaN(d.getTime())) return '';

  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  if (fmt === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
  if (fmt === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  return `${yyyy}/${mm}/${dd}`;
}

export const formatDateTime = (value: string | null, fmt: DateFormat = 'YYYY/MM/DD'): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatDate(d, fmt)} at ${time}`;
};

/* "3 days", "1 day", "today". Used for the trial countdown, where "in 0 days"
   would be both wrong and alarming on the last morning. */
export const days = (n: number | null): string => {
  if (n === null) return '';
  if (n <= 0) return 'today';
  return n === 1 ? '1 day' : `${n} days`;
};

/* The browser and platform out of a user agent string, roughly.

   Deliberately rough. This labels a row on the "where you are signed in" list,
   where being told "Chrome on Windows" is what makes somebody recognise their
   own laptop. Getting it slightly wrong costs nothing; parsing it properly
   would mean shipping a device database to do the same job. */
export function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device';

  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'A browser';

  const platform = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'an unknown system';

  return `${browser} on ${platform}`;
}

export const fileSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/* What kind of file, in words, from the type the API proved from its bytes. */
export const fileKind = (contentType: string): string =>
  contentType === 'application/pdf'
    ? 'PDF'
    : contentType === 'image/svg+xml'
      ? 'Vector'
      : contentType === 'image/jpeg' || contentType === 'image/heic'
        ? 'Photo'
        : contentType.startsWith('image/')
          ? 'Image'
          : 'File';

export const initials = (first: string, last: string): string =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
