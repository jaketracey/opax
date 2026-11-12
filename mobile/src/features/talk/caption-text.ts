import type { TranscriptTurn } from '../../voice';

const digits = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];
const teens = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const tens = [
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];
const units = digits.slice(1).join('|');
const small = `(?:${tens.join('|')})(?:[ -](?:${units}))?|(?:${[...digits, ...teens].join('|')})`;
const hundred = `(?:(?:${units}) hundred(?: (?:and )?(?:${small}))?|(?:${small}))`;
const integer = `${hundred}(?: thousand(?: (?:and )?${hundred})?)?`;
const amount = `(?:${integer}|\\d+(?:\\.\\d+)?)(?: point (?:${digits.join('|')})(?:[ -](?:${digits.join('|')}))*)?`;
const values = new Map([
  ...digits.map((word, index) => [word, index] as const),
  ...teens.map((word, index) => [word, index + 10] as const),
  ...tens.map((word, index) => [word, (index + 2) * 10] as const),
]);

function number(text: string): string {
  text = text.toLowerCase();
  if (/^\d/.test(text)) return text;
  const [whole = '', fraction] = text.split(' point ');
  let total = 0;
  let group = 0;
  for (const word of whole.split(/[ -]+/)) {
    if (word === 'hundred') group *= 100;
    else if (word === 'thousand') {
      total += group * 1000;
      group = 0;
    } else group += values.get(word) ?? 0;
  }
  const decimal = fraction
    ?.split(/[ -]+/)
    .map((word) => values.get(word))
    .join('');
  return `${total + group}${decimal ? `.${decimal}` : ''}`;
}

const ordinals = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
];
const ordinal = `(?:twenty[ -](?:${ordinals.slice(0, 9).join('|')})|thirty[ -]first|thirtieth|${ordinals.join('|')})`;
const day = `(?:${ordinal}|thirty(?:[ -]one)?|twenty(?:[ -](?:${units}))?|${[...digits.slice(1), ...teens].join('|')}|\\d{1,2}(?:st|nd|rd|th)?)`;
const month =
  '([Jj]anuary|[Ff]ebruary|[Mm]arch|[Aa]pril|[Mm]ay|[Jj]une|[Jj]uly|[Aa]ugust|[Ss]eptember|[Oo]ctober|[Nn]ovember|[Dd]ecember)';
function dayNumber(text: string): number {
  const lower = text.toLowerCase();
  const index = ordinals.indexOf(lower);
  if (index >= 0) return index + 1;
  if (lower === 'thirtieth') return 30;
  if (/^(twenty|thirty)[ -]/.test(lower)) {
    const [ten, unit = ''] = lower.split(/[ -]/);
    const ordinalUnit = ordinals.indexOf(unit);
    if (ordinalUnit >= 0) return (ten === 'twenty' ? 20 : 30) + ordinalUnit + 1;
  }
  return /^\d/.test(lower) ? parseInt(lower, 10) : Number(number(lower));
}

function validDay(value: number, name: string, year?: string): boolean {
  const lower = name.toLowerCase();
  let maximum = ['april', 'june', 'september', 'november'].includes(lower)
    ? 30
    : 31;
  if (lower === 'february') {
    const y = year ? Number(year) : null;
    maximum =
      y === null || (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28;
  }
  return value >= 1 && value <= maximum;
}

const yearTail = `(?:(?:${tens.join('|')})(?:[ -](?:${units}))?|${teens.join('|')}|oh[ -](?:${units}))`;
const spokenYear = `(?:(?:nineteen|twenty) ${yearTail}|two thousand(?: (?:and )?(?:${small}))?)`;
// Compiled once: live level updates can redraw the complete caption history.
const fullDatePattern = new RegExp(
  `\\b${month} (${day}),? (${spokenYear}|\\d{4})\\b(?!-)`,
  'g',
);
const yearPattern = new RegExp(`\\b${spokenYear}\\b(?!-)`, 'g');
const datePattern = new RegExp(
  `\\b${month} (${day})(?:,? (\\d{4}))?\\b(?!-)`,
  'g',
);
const ordinalDatePattern = new RegExp(
  `\\b(?:[Tt]he )?(${day})(?: of)? ${month}(?:,? (\\d{4}))?\\b`,
  'g',
);
const moneyPattern = new RegExp(
  `\\b(${amount})(?: (thousand|million|billion))? dollars?\\b`,
  'gi',
);
const percentPattern = new RegExp(
  `\\b(${amount}) (?:per cent|percent)\\b`,
  'gi',
);
const unitPattern = new RegExp(
  `\\b(${amount}) (ayes?|no(?:es|s)?|votes?|cents?|kilometres?|metres?|centimetres?|millimetres?|kilograms?|grams?|tonnes?|litres?|hours?|minutes?|seconds?|days?|weeks?|months?|years?|seats?)\\b`,
  'gi',
);
const countPattern = new RegExp(
  `\\b(${integer}) (amendments?|bills?|divisions?|senators?|members?|supporters?|people|records?)\\b`,
  'gi',
);
function yearNumber(text: string): string {
  const lower = text.toLowerCase();
  if (lower.startsWith('two thousand')) return number(lower);
  const base = lower.startsWith('nineteen') ? 1900 : 2000;
  return String(
    base + Number(number(lower.replace(/^\w+ /, '').replace(/^oh[ -]/, ''))),
  );
}

// Do not rewrite just the tail of an unsupported number, or a hyphenated name.
function figureStart(text: string, offset: number): boolean {
  const prefix = text.slice(0, offset);
  if (prefix.endsWith('-')) return false;
  const previous = /\b([a-z]+)(?: and)?\s+$/i.exec(prefix)?.[1]?.toLowerCase();
  return (
    !previous ||
    (!values.has(previous) &&
      ![
        'hundred',
        'thousand',
        'million',
        'billion',
        'point',
        'senator',
        'dr',
        'mr',
        'mrs',
        'ms',
        'professor',
      ].includes(previous))
  );
}

function writtenFigures(text: string): string {
  // Resolve full dates first, so the day in "August nineteen twenty
  // twenty-six" cannot be mistaken for the start of a year.
  text = text.replace(
    fullDatePattern,
    (match, name: string, spokenDay: string, year: string) => {
      const value = dayNumber(spokenDay);
      const writtenYear = /^\d/.test(year) ? year : yearNumber(year);
      return validDay(value, name, writtenYear)
        ? `${value} ${name} ${writtenYear}`
        : match;
    },
  );
  // Years and dates use lower-case number words. Other figures require an
  // explicit lower-case unit, preserving title-cased names such as Seven Days.
  text = text.replace(yearPattern, (match, offset: number, original: string) =>
    figureStart(original, offset) || /\band\s+$/.test(original.slice(0, offset))
      ? yearNumber(match)
      : match,
  );
  text = text.replace(
    datePattern,
    (match, name: string, spokenDay: string, year?: string) => {
      const value = dayNumber(spokenDay);
      return validDay(value, name, year)
        ? `${value} ${name}${year ? ` ${year}` : ''}`
        : match;
    },
  );
  text = text.replace(
    ordinalDatePattern,
    (match, spokenDay: string, name: string, year?: string) =>
      validDay(dayNumber(spokenDay), name, year)
        ? `${dayNumber(spokenDay)} ${name}${year ? ` ${year}` : ''}`
        : match,
  );
  text = text.replace(
    moneyPattern,
    (
      match,
      value: string,
      scale: string | undefined,
      offset: number,
      original: string,
    ) =>
      figureStart(original, offset) &&
      / dollars?$/.test(match) &&
      (!scale || scale === scale.toLowerCase())
        ? `$${number(value)}${scale ? ` ${scale}` : ''}`
        : match,
  );
  text = text.replace(
    percentPattern,
    (match, value: string, offset: number, original: string) =>
      figureStart(original, offset) && / (?:per cent|percent)$/.test(match)
        ? `${number(value)}%`
        : match,
  );
  text = text.replace(
    unitPattern,
    (match, value: string, unit: string, offset: number, original: string) =>
      figureStart(original, offset) && unit === unit.toLowerCase()
        ? `${number(value)} ${unit}`
        : match,
  );
  return text.replace(
    countPattern,
    (match, value: string, noun: string, offset: number, original: string) =>
      figureStart(original, offset) &&
      noun === noun.toLowerCase() &&
      Number(number(value)) >= 10
        ? `${number(value)} ${noun}`
        : match,
  );
}

const opening =
  /^(?:let me (?:just )?check(?: the records?)?|let me (?:just )?look that up|one moment(?: please)?)(?:[.!…](?:\s+|$)|$)/i;
function withoutOpening(text: string): string {
  let next = text.trim();
  while (opening.test(next)) next = next.replace(opening, '').trim();
  return next;
}

/** Display only. Never write these edits back into the voice transcript. */
export function captionText(
  turn: Pick<TranscriptTurn, 'role' | 'text'>,
): string {
  if (turn.role === 'agent') return writtenFigures(withoutOpening(turn.text));
  const clean = turn.text
    .replace(
      /\b(uh|um|erm|ah)\b([,.]?)\s*/gi,
      (
        match,
        word: string,
        punctuation: string,
        offset: number,
        original: string,
      ) => {
        // A capitalised word before another name can be a name itself, as in
        // "Malcolm Ah Chee". Punctuation disambiguates a spoken interjection.
        return !punctuation &&
          /^[A-Z]/.test(word) &&
          /^[A-Z][a-z]/.test(original.slice(offset + match.length))
          ? match
          : '';
      },
    )
    .replace(/\b([a-z]+)(?:[ ,]+\1\b)+/gi, (match, word: string) =>
      values.has(word.toLowerCase()) ? match : word,
    )
    .replace(/\s+([,.?!])/g, '$1')
    .trim();
  return /^[,.?!…\s]*$/.test(clean) ? '' : writtenFigures(clean);
}

/** A placeholder belongs to the current working line, never the history. */
export function workingCaption(
  turn: TranscriptTurn | undefined,
): string | null {
  return turn?.role === 'agent' &&
    turn.text.trim() &&
    !withoutOpening(turn.text)
    ? (opening.exec(turn.text.trim())?.[0].trim() ?? null)
    : null;
}
