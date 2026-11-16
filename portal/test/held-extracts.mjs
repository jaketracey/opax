// Extracts once held from the Victorian major infrastructure royal commission's hearing transcripts.
// OPAX lists that commission by its documents only. The five extracts are pinned by the SHA-256 of
// their normalised words (lower case, runs of other characters as one space), never as text, so this
// file does not republish them. `first` and `last` are the start of the SHA-256 of the first and last
// word, so a large file is scanned without hashing every run of words.
import { createHash } from 'node:crypto';

export const COMMISSION = 'vic-major-infrastructure';
export const SLUG = 'royal-commission-' + COMMISSION;
const sha = text => createHash('sha256').update(text).digest('hex');
export const PINNED = [
  { words: 7, sha256: '75c44b047d33e6c8834ecf9a630a75a0195b1208440801587ce4ce3bdf6da5d0', first: '65714f40dc569981', last: 'e0b9a8799f32453a' },
  { words: 9, sha256: 'f29b53401df0607d07055ca5744dc3829a3178d3e35d19fccf841d563ecae01d', first: 'b8d31e852725afb1', last: 'ab6db599234d2636' },
  { words: 9, sha256: 'ecec8e5686f6b6ba3eccdaa0d08aa6a25220be983bb89e26038efca7f5555cfc', first: 'b8d31e852725afb1', last: 'ab6db599234d2636' },
  { words: 6, sha256: '20192459eb70be07ed07277fa4a0c2f129ad108cd85addc7c30ed5ff12510282', first: 'bcee72e6df5d5631', last: 'ea0890697a77af0a' },
  { words: 15, sha256: '12b90efdb2d5059b5630a23478ccb3356d38377a1d6872ea3862b13c5454a288', first: 'b9776d7ddf459c9a', last: '5313e5bf17148de8' },
];
// Field names that hold a document's own wording; none may carry a value on this commission's record.
export const TEXT_KEYS = ['date_quote', 'quote', 'quotes', 'excerpt', 'excerpts', 'text', 'full_text', 'snippet', 'text_matches'];
export const QUOTE_MARKS = /["“”]/;

export const normalWords = text => String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const wordSha = new Map();
const short = word => { let h = wordSha.get(word); if (!h) { if (wordSha.size > 500_000) wordSha.clear(); wordSha.set(word, h = sha(word).slice(0, 16)); } return h; };
export const pin = line => { const w = normalWords(line); return { words: w.length, sha256: sha(w.join(' ')), first: short(w[0]), last: short(w.at(-1)) }; };

/** The pinned extracts found anywhere in the text: every run of n words is hashed and compared. */
export function heldExtracts(text, pinned = PINNED) {
  const words = normalWords(text), found = new Set();
  const ends = words.map(short);
  for (const p of pinned) for (let i = 0; i + p.words <= words.length; i++) {
    if (ends[i] === p.first && ends[i + p.words - 1] === p.last && sha(words.slice(i, i + p.words).join(' ')) === p.sha256) found.add(p.sha256);
  }
  return [...found];
}

/** Paths of every field, at any depth, whose name says it holds a document's wording and that has a value. */
export function textFields(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((v, i) => textFields(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(TEXT_KEYS.includes(k) && v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length) ? [`${path}/${k}`] : []),
    ...textFields(v, `${path}/${k}`)]);
}

/** Every string in a value, at any depth. */
export function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  return value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
}

/** Asserts that an output for this commission holds no pinned extract, no text field and no quotation. */
export function assertNoExtract(assert, value, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  assert.deepEqual(heldExtracts(text), [], label + ' holds an extract that was removed');
  if (typeof value !== 'string') {
    assert.deepEqual(textFields(value), [], label + ' has a field with a document\'s wording');
    assert.deepEqual(strings(value).filter(s => QUOTE_MARKS.test(s)), [], label + ' carries a quotation');
  }
}
