// Two text pipelines for the passages and snippets the app draws.
// - passageText: text still raw from the source (the static evidence shards,
//   report passages, catalog rows, bill text): tags out, entities decoded once.
// - serverPassage: text the Worker has already normalized (/ask sources and
//   evidence excerpts, /api/search snippets, /api/resource text). Its entities
//   are decoded and its cuts are word-bounded and marked "…", so the app only
//   lays it out: decoding again would show a literal "&#38;" as "&".
// Neither splits words the source already joined ("senatorsinterjecting"):
// with no tag left between them, any split is a guess. The web fixes those.

const named: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  shy: '\u00ad',
  ndash: '–',
  mdash: '—',
  minus: '−',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  bull: '•',
  middot: '·',
  prime: '′',
  Prime: '″',
  dagger: '†',
  sect: '§',
  para: '¶',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup2: '²',
  sup3: '³',
  ordm: 'º',
  ordf: 'ª',
  copy: '©',
  reg: '®',
  trade: '™',
  pound: '£',
  euro: '€',
  cent: '¢',
  yen: '¥',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  auml: 'ä',
  atilde: 'ã',
  aring: 'å',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  iacute: 'í',
  igrave: 'ì',
  icirc: 'î',
  iuml: 'ï',
  oacute: 'ó',
  ograve: 'ò',
  ocirc: 'ô',
  ouml: 'ö',
  otilde: 'õ',
  oslash: 'ø',
  uacute: 'ú',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  ccedil: 'ç',
  ntilde: 'ñ',
  Eacute: 'É',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
};

/**
 * Named, decimal and hex character references, decoded once: `&amp;amp;`
 * reads `&amp;`. Unknown names stay as written ("DR&VM;" in a Queensland
 * grant recipient is a name, not an entity).
 */
export function decodeEntities(text: string) {
  return text.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/g,
    (whole, dec?: string, hex?: string, name?: string) => {
      if (name) return Object.hasOwn(named, name) ? named[name]! : whole;
      const code = dec ? Number(dec) : parseInt(hex!, 16);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : whole;
    },
  );
}

const BLOCK_TAG =
  /<\/?(?:p|div|li|ul|ol|blockquote|h[1-6]|tr|table|section|article|para|talk\.start|interjection)\b[^<>]*>|<br\s*\/?>/gi;
const INLINE_TAGS = /(?:<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>)+/g;
const WORD = /[\p{L}\p{N}]/u;

/** Tags out: a block tag is a line break; a run of inline tags between two
 * words ("senators</span><span>interjecting") is a space, else nothing. */
function stripTags(text: string) {
  return text
    .replace(BLOCK_TAG, '\n')
    .replace(INLINE_TAGS, (tags, at: number, all: string) =>
      WORD.test(all[at - 1] ?? '') && WORD.test(all[at + tags.length] ?? '')
        ? ' '
        : '',
    );
}

/** Ends a cut passage on a whole word with an ellipsis. */
function endOnWord(text: string) {
  const whole = text.replace(/\s+\S*$/, '');
  return (whole || text).replace(/[\s,;:—–-]+$/, '') + '…';
}

export interface PassageOptions {
  /** Keep paragraph breaks (one blank line); otherwise one running line. */
  paragraphs?: boolean;
  /** Longest passage drawn, in characters, cut on a word with an ellipsis. */
  max?: number;
  /**
   * The length the source sliced passages to before they reached the app
   * (Ask answers saved before 9 Oct cut each source's raw passage at 600
   * characters, mid-word). A passage of exactly that length ends on its last
   * whole word, with an ellipsis, unless it already ends a sentence.
   */
  slicedAt?: number;
}

/** Collapses whitespace: one blank line between paragraphs, or one line. */
function layout(text: string, paragraphs: boolean) {
  const s = text
    .replace(/\r\n?|\u2028|\u2029/g, '\n')
    .replace(/\u00ad/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n');
  return paragraphs
    ? s.replace(/\n{3,}/g, '\n\n').trim()
    : s.replace(/\s+/g, ' ').trim();
}

/** The app's own length cap, cut on a word with an ellipsis. */
function cap(s: string, max: number | undefined) {
  if (max === undefined || s.length <= max) return s;
  // A space just past the limit means the last word fits whole.
  const head = s.slice(0, max);
  return endOnWord(/\s/.test(s[max]!) ? `${head} ` : head);
}

/** Raw source text: tags out, entities decoded once, cuts closed on a word. */
export function passageText(
  raw: string | null | undefined,
  { paragraphs = false, max, slicedAt }: PassageOptions = {},
) {
  const source = String(raw ?? '');
  let s = layout(decodeEntities(stripTags(source)), paragraphs);
  const ended = /[.!?…]["'”’)]*$/.test(s);
  // An old search window opens with an ellipsis and can open and close
  // mid-word ("…nd is standing", "secret auctions at ope"): whole words only.
  const window = s.startsWith('…');
  if (window) s = s.replace(/^…\p{Ll}\S*\s+(?=\S)/u, '…');
  const sliced =
    !ended &&
    (window || (slicedAt !== undefined && source.length === slicedAt));
  if (max !== undefined && s.length > max) return cap(s, max);
  return sliced ? endOnWord(s) : s;
}

/**
 * Worker-normalized text, drawn as sent: no tag stripping, no entity decode
 * and no trimming at its "…" markers, which only stand for omitted text.
 */
export function serverPassage(
  text: string | null | undefined,
  { paragraphs = false, max }: Omit<PassageOptions, 'slicedAt'> = {},
) {
  return cap(layout(String(text ?? ''), paragraphs), max);
}
