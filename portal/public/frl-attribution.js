/* The Federal Register of Legislation's CC BY 4.0 attribution, in the register's own dated words, wherever a date
   from the register appears: an Act's assent date (the register's making date, linked to the Act as made) and a
   Royal Assent stage read from the register while ParlInfo was paused (a key_dates row with source "frl", written
   by scripts/bills_held_sources.py). The date is the day OPAX downloaded the register's record (`retrieved`), else
   the day the bills export read it. Policy: parli/ingest/source_policy.json, frl_acts.
   No imports: the Worker (Ask and MCP record text, the daily edition) and the browser (the bill page, through
   labels.js) share it. */
export const FRL_SITE = 'https://www.legislation.gov.au';
export const FRL_NAME = 'Federal Register of Legislation';
export const FRL_LICENCE = 'CC BY 4.0';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "17 November 2026" from a YYYY-MM-DD day, or an ISO stamp's date as written; '' when it is not a real date. */
export function frlFullDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof value === 'string' ? value.trim() : '');
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])], date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${d} ${MONTHS[mo - 1]} ${y}` : '';
}

/** The register's required attribution for content OPAX derived from it, dated; '' without a date. */
export function frlAttribution(day) {
  const full = frlFullDate(day);
  // The register's mandatory wording, verbatim (parli/ingest/source_policy.json holds the same text).
  return full ? `Based on content from the Federal Register of Legislation at ${full}. For the latest information on Australian Government legislation please go to https://www.legislation.gov.au.` : '';
}

/** A key_dates row read from the register. */
export const isFrlStage = (row) => row?.source === 'frl';

/** The day to date a bill's register facts by: the newest `retrieved` on its Acts, its register stages and its
 *  register sources; else `fallback` (the bills export's day); '' when neither is a date. */
export function frlRetrieved(bill, fallback = '') {
  const days = [...(bill?.acts || []), ...(bill?.key_dates || []).filter(isFrlStage), ...(bill?.sources || []).filter((s) => s?.kind === 'frl_act')]
    .map((row) => String(row?.retrieved || '')).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && frlFullDate(day)).sort();
  if (days.length) return days[days.length - 1];
  const day = String(fallback || '').slice(0, 10);
  return frlFullDate(day) ? day : '';
}

/** Does the bill show a date from the register: an Act with an assent date, or a Royal Assent stage read from it? */
export function billHasFrlDates(bill) {
  return (bill?.acts || []).some((act) => act?.assent_date) || (bill?.key_dates || []).some((row) => isFrlStage(row) && row?.date);
}

/** The attribution for a bill that shows a register date, else ''. */
export function billFrlAttribution(bill, fallback = '') {
  return billHasFrlDates(bill) ? frlAttribution(frlRetrieved(bill, fallback)) : '';
}
