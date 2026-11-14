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
