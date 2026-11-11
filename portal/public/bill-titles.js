/**
 * The bill fields a server-rendered profile reads from /bills/index.json (1.8 MB): each bill's key,
 * title, aliases and jurisdiction, in index order, to link recorded votes to their bills
 * (vote-tables.js votingRows) and to title sponsored bills. scripts/build_growth_modules.mjs writes
 * it at release, so a cold isolate parses about 0.4 MB for a profile instead of the whole index.
 */
export const BILL_TITLES_PATH = '/growth/bill-titles.json';
const FIELDS = ['key', 'title', 'aliases', 'jurisdiction'];
/** /bills/index.json -> the file profiles read. */
export function billTitlesFile(index) {
  if (!Array.isArray(index?.bills)) throw new Error('bill titles: no bills');
  return {generated_at: index.generated_at, bills: index.bills.map(bill => Object.fromEntries(FIELDS.filter(k => bill[k] !== undefined).map(k => [k, bill[k]])))};
}
