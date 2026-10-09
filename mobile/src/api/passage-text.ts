// One text pipeline for every passage or snippet the app draws: Ask sources,
// record readers, search snippets and "What they talk about". It never splits
// words the source already joined ("senatorsinterjecting"): with no tag left
// between them, any split is a guess. Those are fixed in the web exporter.

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
   * The length the source slices passages to before they reach the app (the
   * Ask Worker cuts each source's passage at 600 characters, mid-word). A
   * passage of exactly that length ends on its last whole word, with an
   * ellipsis, unless it already ends a sentence.
   */
  slicedAt?: number;
}

export function passageText(
  raw: string | null | undefined,
  { paragraphs = false, max, slicedAt }: PassageOptions = {},
) {
  const source = String(raw ?? '');
  let s = decodeEntities(stripTags(source))
    .replace(/\r\n?|\u2028|\u2029/g, '\n')
    .replace(/\u00ad/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n');
  s = paragraphs
    ? s.replace(/\n{3,}/g, '\n\n').trim()
    : s.replace(/\s+/g, ' ').trim();
  const ended = /[.!?…]["'”’)]*$/.test(s);
  // A search window opens with an ellipsis and can open and close mid-word
  // ("…nd is standing", "secret auctions at ope"): whole words only.
  const window = s.startsWith('…');
  if (window) s = s.replace(/^…\p{Ll}\S*\s+(?=\S)/u, '…');
  const sliced =
    !ended &&
    (window || (slicedAt !== undefined && source.length === slicedAt));
  if (max !== undefined && s.length > max) {
    // A space just past the limit means the last word fits whole.
    const head = s.slice(0, max);
    s = endOnWord(/\s/.test(s[max]!) ? `${head} ` : head);
  } else if (sliced) s = endOnWord(s);
  return s;
}
