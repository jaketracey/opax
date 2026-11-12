// Shared tokenizer for the generated public-record index and runtime queries.
export function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
const STOP = new Set('a an and are as at be by for from has in into is it of on or the to was were with'.split(' '));
const SPELLING = { defense: 'defence', organization: 'organisation', labour: 'labor' };
export function tokens(value) {
  return [...new Set(normalize(value).split(' ').filter(t => (t.length > 1 || /^\d$/.test(t)) && !STOP.has(t)).map(t => {
    const singular = t.length > 4 && t.endsWith('ies') ? t.slice(0, -3) + 'y'
      : t.length > 4 && t.endsWith('s') && !/(?:ss|is|us)$/.test(t) ? t.slice(0, -1) : t;
    return Object.hasOwn(SPELLING, singular) ? SPELLING[singular] : singular;
  }))];
}
// Retry question-shaped catalogue misses with their subject. Never union arbitrary
// search words: names, identifiers, dates and quoted phrases keep AND matching.
export function questionSubject(value) {
  const q = String(value ?? '').trim().replace(/\?$/, '').trim();
  if (/["“”]/.test(q)) return null;
  const patterns = [
    /^what (?:is|are) (?:the )?government doing about (.+)$/i,
    /^how (?:does|do) (.+?) work$/i,
    /^why (?:is|are) (.+?) (?:so (?:high|expensive)|rising|falling|increasing|decreasing)$/i,
    /^who (?:funds|funded|finances) (.+)$/i,
    /^what (?:is|are) (.+)$/i,
  ];
  for (const pattern of patterns) {
    const subject = q.match(pattern)?.[1];
    if (subject && tokens(subject).length) return subject;
  }
  return null;
}

// These aliases are attached only when the named parliamentarian is in the roster.
export const PERSON_SEARCH_ALIASES = { 'Anthony Albanese': ['Albo'], 'Scott Morrison': ['ScoMo'] };
export function bucket(term) {
  let hash = 2166136261;
  for (const c of term.slice(0, 2)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) % 64;
}
