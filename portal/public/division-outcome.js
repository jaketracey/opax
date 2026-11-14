/* A division's result in the one wording OPAX shows everywhere: "Agreed" or
   "Not agreed". The record writes "affirmative" or "negative" (and the bills
   register "negatived"); those stay in the data and never reach a reader.
   Web pages, server pages, structured data, the app widget and share images
   all read the word from here (labels.js re-exports it for the SPA and the
   Worker). A bill's status (Passed, Lapsed, Assented) is a different thing
   and is not worded here. */

export const AGREED = 'Agreed';
export const NOT_AGREED = 'Not agreed';

const AGREED_WORDS = /^(?:affirmative|agreed(?: to)?|carried|passed|ayes?)$/;
const NOT_AGREED_WORDS = /^(?:negative|negatived|not agreed(?: to)?|defeated|lost|rejected|no|noes)$/;
const count = (n) => typeof n === 'number' && Number.isFinite(n) ? n : null;

/** "Agreed" or "Not agreed" for a recorded result. A result the record does
 *  not name reads from the counts (more ayes than noes is agreed); with
 *  neither, it is '' and the caller says the outcome is not recorded. */
export function divisionOutcome(result, counts) {
  const word = String(result ?? '').trim().toLocaleLowerCase('en-AU').replace(/[_\s]+/g, ' ');
  if (AGREED_WORDS.test(word)) return AGREED;
  if (NOT_AGREED_WORDS.test(word)) return NOT_AGREED;
  const ayes = count(counts?.ayes), noes = count(counts?.noes);
  if (ayes === null || noes === null) return '';
  return ayes > noes ? AGREED : NOT_AGREED;
}

/** The register's "negatived" in a stage or event line, as the site's "not agreed". */
export function notAgreedWording(text) {
  return String(text ?? '').replace(/\bnegatived\b/gi, (w) => w[0] === 'N' ? 'Not agreed' : 'not agreed');
}
