/**
 * The bill fields a profile reads from /bills/index.json (1.8 MB): each bill's key, titles, aliases
 * and jurisdiction, in index order. The server-rendered profile links recorded votes to their bills
 * (vote-tables.js votingRows) and titles sponsored bills; the app's profile does the same and words
 * its suggested vote question (growth-modules.js personQuestions, which uses short_title).
 * scripts/build_growth_modules.mjs writes it at release.
 */
export const BILL_TITLES_PATH = '/growth/bill-titles.json';
const FIELDS = ['key', 'title', 'short_title', 'aliases', 'jurisdiction'];
/** /bills/index.json -> the file profiles read. */
export function billTitlesFile(index) {
  if (!Array.isArray(index?.bills)) throw new Error('bill titles: no bills');
  return {generated_at: index.generated_at, bills: index.bills.map(bill => Object.fromEntries(FIELDS.filter(k => bill[k] !== undefined).map(k => [k, bill[k]])))};
}
