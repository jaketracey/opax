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
 * Abbreviated dollars for charts and tight figures: $2.35B, $24.4M, $507K,
 * $950. A figure that would round up to 1000 of one unit takes the next
 * ($999,800 is $1.0M, not $1000K).
 */
export function shortMoney(value) {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 999.95e6) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 999.5e3) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 999.5) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}
