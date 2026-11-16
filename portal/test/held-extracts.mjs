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
// Every run of five consecutive words in the five extracts, as the SHA-256 of the run, so a partial
// lift fails as well as an exact match. The two runs that lie wholly inside the commissioner's name
// are left out: the name is a fact the record keeps.
export const SHINGLE = 5;
export const SHINGLES = new Set([
  '01a5e596da9e323528f562c48b9248f319fb742255023e3aada1fe27fa97423b',
  '06a9d2c15a06d0c3fbaa00069013537aa5095090229a0dd5fd73d992145de3c5',
  '13e9bdad348ec847036d0a2494971d95f4c9e4e1c4a21f3504315adb0b61b49e',
  '252d86390e7fbee5959fc6068e5e154474ac2d8740875167fbf3cd5d8cafbfc1',
  '3015202ecef160d74f66253de6b080e2725241a2226fca806af29710e39c05da',
  '33e9d75b9828b5367ff6e77e7189689c7b40e7296d49ebd17c238b69e8666457',
  '3add48563464f1021b34ff307012a18dc4d8e135ee7bff741a6a6df9601781f4',
  '3bb3bf3c77b7d86d09ba38604b6c1db64c70a7c22f85f5074deddbc49287a7d4',
  '574c8f04d282674159d848eb46da755bf1bcdee4195d79bd578145079f4f612b',
  '5ce3727f39b4ff5b97c9ded842297d48eddd3f6f810c74bd5abff1e742b1da94',
  '829f8ea97090834dab0f6f8023c36879d569ed62c278e0440818b95d076c21d3',
  '84c0224329f8483fff9be089456c3a54f3060f8909c92e980e983ecfa99d605f',
  '941ea44030e399d07f512865cd97f9ed8a8a4eec49350e263908ced62da9c62c',
  '96a404f148969a814475b93dfba69e7e3164b69ded269a3438732eb09fb22ffd',
  '9ddf3715d17d829ac069ab7ef814b4833e26a1912843f8710575d701aee8fe96',
  'b2dce763f49e13044821c21006103e36aea64df5bac77e97951cf3c52128da89',
  'bd6024916799f7062a53ce72aee70ca17b39307bcdb30c8a13a4e2fbebd2cc5e',
  'c080ae7ea1d425694e288a5f8b88783edfa62ef15cc59c9705be00bd93cb9bad',
  'cef63464ebcca2926b4107086d834b8cc11f6f14056639adb244f862919b934c',
  'd526465722e142908af1a5035ca6bc1bd55fa3ed8c4aff41509fa74f99e19aef',
  'f0e24ab5670ec975d7bdb76b7040240027da0416ed684d592d401550dccbfb78',
  'f6d9ae396bd6fa12abbef59b3c77814493fb6e38d16f86402fa7ae8b357807de',
]);
/** The pinned five-word runs found anywhere in the text. */
export function liftedRuns(text, pinned = SHINGLES, size = SHINGLE) {
  const words = normalWords(text), found = new Set();
  for (let i = 0; i + size <= words.length; i++) { const h = sha(words.slice(i, i + size).join(' ')); if (pinned.has(h)) found.add(h); }
  return [...found];
}
export const shingles = (line, size = SHINGLE) => { const w = normalWords(line); return new Set(w.slice(0, Math.max(0, w.length - size + 1)).map((_, i) => sha(w.slice(i, i + size).join(' ')))); };

// Field names that hold a document's own wording; none may carry a value on this commission's record.
export const TEXT_KEYS = ['date_quote', 'quote', 'quotes', 'excerpt', 'excerpts', 'text', 'full_text', 'snippet', 'text_matches'];
// A quotation: any double quotation mark or guillemet, or a single one that opens a word (an apostrophe has a letter before it).
export const QUOTATION = /["\u201c\u201d\u201e\u201f\u00ab\u00bb\u2039\u203a]|(?<![A-Za-z0-9])['\u2018\u2019\u201a\u201b](?=\w)/;

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
  assert.deepEqual(liftedRuns(text), [], label + ' shares a run of five words with an extract that was removed');
  if (typeof value !== 'string') {
    assert.deepEqual(textFields(value), [], label + ' has a field with a document\'s wording');
    assert.deepEqual(strings(value).filter(s => QUOTATION.test(s)), [], label + ' carries a quotation');
  }
}
