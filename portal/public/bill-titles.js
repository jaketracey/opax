import {shortDate} from './format.js';
/**
 * The bill fields the app and profiles read from /bills/index.json (1.8 MB), in index order:
 * - key, titles, aliases and jurisdiction: the server-rendered profile links recorded votes to
 *   their bills (vote-tables.js votingRows) and titles sponsored bills; the app's profile does the
 *   same and words its suggested vote question (growth-modules.js personQuestions, short_title);
 * - status, status_as_of, ended_label and has_summary: a speech page names the bill its debate is
 *   about, with its dated status (a dead bill's exact ending when the export names one) and, when
 *   one is written, the first sentence of its summary (app.js renderDocBillPanel).
 * scripts/build_growth_modules.mjs writes it at release.
 */
export const BILL_TITLES_PATH = '/growth/bill-titles.json';
const FIELDS = ['key', 'title', 'short_title', 'aliases', 'jurisdiction', 'status', 'status_as_of', 'ended_label', 'has_summary'];
/** /bills/index.json -> the file profiles read. */
export function billTitlesFile(index) {
  if (!Array.isArray(index?.bills)) throw new Error('bill titles: no bills');
  return {generated_at: index.generated_at, bills: index.bills.map(bill => Object.fromEntries(FIELDS.filter(k => bill[k] !== undefined).map(k => [k, bill[k]])))};
}
/** The bill export's date, /bills/index.json generated_at: all a bill page reads from the index
 *  (the "updated" line under each of its blocks). scripts/build_growth_modules.mjs writes it at release. */
export const BILLS_DATE_PATH = '/growth/bills-date.json';
/** /bills/index.json -> the file bill pages read. */
export function billsDateFile(index) {
  if (typeof index?.generated_at !== 'string') throw new Error('bills date: no generated_at');
  return {generated_at: index.generated_at};
}
/** How old a bill's recorded status and stages are: the bills export's day, from its generated_at. The words are
 *  one line wherever a bill's status is shown (the bill page, the daily edition, Ask and MCP results), and the
 *  story cover keeps the line with the bill's standing when it clips (og.ts). */
export const BILL_PROGRESS_WORDS = 'Bill progress as at';
const SYDNEY_DAY = new Intl.DateTimeFormat('en-AU', {timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'});
/**
 * "2026-10-05": the export's day in Sydney (hub ruling, 17 Nov 2026). generated_at is a UTC stamp, and
 * 2026-10-04T16:27:54Z is 03:27 on 5 Oct AEDT, so its day is 5 Oct; the conversion names Australia/Sydney, so AEST
 * and AEDT both hold and no viewer's own zone moves it. A bare date is its own day; a stamp with no offset is UTC.
 * '' when it is not a real date and time.
 */
export function billsAsAtIso(generatedAt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(typeof generatedAt === 'string' ? generatedAt.trim() : '');
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])], date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return '';
  if (m[4] === undefined) return `${m[1]}-${m[2]}-${m[3]}`;
  const zone = !m[8] || /^z$/i.test(m[8]) ? 'Z' : m[8].includes(':') ? m[8] : `${m[8].slice(0, 3)}:${m[8].slice(3)}`;
  const at = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${m[7] ?? ''}${zone}`);
  if (!Number.isFinite(at) || Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6] ?? 0) > 59) return '';
  const part = Object.fromEntries(SYDNEY_DAY.formatToParts(new Date(at)).map(p => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day}`;
}
/**
 * "5 Oct 2026": the export's Sydney day in the site's short form, or '' when there is none. Given a bill, also ''
 * when the bill's own record is newer than the export: an exposure draft merged in after it (export_bills.py
 * --merge-drafts keeps the index's generated_at) would otherwise say its progress is as at a day before its release.
 */
export function billsAsAtDay(generatedAt, bill = null) {
  const day = billsAsAtIso(generatedAt);
  if (!day) return '';
  const own = [bill?.introduced, bill?.status_as_of].map(v => typeof v === 'string' ? v.slice(0, 10) : '').filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v));
  return own.some(v => v > day) ? '' : shortDate(day);
}
/** "Bill progress as at 5 Oct 2026", or '' when the export's generated_at is missing or not a date (or, given a
 *  bill, when the bill's own record is newer than the export). */
export function billProgressAsAt(generatedAt, bill = null) {
  const day = billsAsAtDay(generatedAt, bill);
  return day ? `${BILL_PROGRESS_WORDS} ${day}` : '';
}
/** The bills with recorded divisions, in index order, with the fields a party page sorts them by:
 *  the party page's "Bills they divided on" picks its newest candidates from these (app.js
 *  renderPartyBillDivisions) instead of /bills/index.json. scripts/build_growth_modules.mjs writes it at release. */
export const DIVISION_BILLS_PATH = '/growth/division-bills.json';
const DIVISION_FIELDS = ['key', 'divisions', 'status_as_of', 'introduced'];
/** /bills/index.json -> the file party pages read. */
export function divisionBillsFile(index) {
  if (!Array.isArray(index?.bills)) throw new Error('division bills: no bills');
  return {generated_at: index.generated_at, bills: index.bills.filter(bill => Number(bill?.divisions) > 0)
    .map(bill => Object.fromEntries(DIVISION_FIELDS.filter(k => bill[k] !== undefined).map(k => [k, bill[k]])))};
}
