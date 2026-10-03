// The site's short forms for dates and dollars, in one place: the pages'
// modules import them, the Worker and the money map bundle them, and app.js
// (a classic script, which cannot import) keeps a copy that
// test/format.test.mjs holds to this one. Long forms stay with their pages:
// exact dollars in records and tables, "4 September 2026" in prose.

/** Three-letter months. Not Intl: en-AU writes September "Sept", and the site writes "Sep". */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "4 Sep 2026" from an ISO date (or a timestamp that starts with one), read as
 * written, with no time zone to shift it; a Date is read in local time.
 * Anything else comes back as it was.
 */
export function shortDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : `${value.getDate()} ${MONTHS[value.getMonth()]} ${value.getFullYear()}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return month ? `${Number(m[3])} ${month} ${m[1]}` : String(value ?? '');
}

/**
 * Abbreviated dollars for charts and tight figures: $2.35B, $24.4M, $6.3K,
 * $950. Billions keep two decimals and millions and thousands one, so no
 * figure is coarser than any short form the site used before; under $1,000
 * the dollars are exact, with cents when there are any. A figure that would
 * round up to 1000 of one unit takes the next ($999,960 is $1.0M). A record's
 * own figure in a table is not abbreviated at all: tables show exact dollars.
 */
export function shortMoney(value) {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  // Rounded in whole steps, not by toFixed on a fraction: 6,050,000 is $6.1M,
  // where (6.05).toFixed(1) would give the binary 6.0499... and "6.0".
  if (a >= 999.95e6) return `${sign}$${(Math.round(a / 1e7) / 100).toFixed(2)}B`;
  if (a >= 999.95e3) return `${sign}$${(Math.round(a / 1e5) / 10).toFixed(1)}M`;
  if (a >= 999.995) return `${sign}$${(Math.round(a / 100) / 10).toFixed(1)}K`;
  const cents = Math.round(a * 100) / 100;
  return `${sign}$${Number.isInteger(cents) ? cents : cents.toFixed(2)}`;
}
