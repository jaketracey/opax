// Number and date formats from IOS-UX section 6. Formatting is done by hand,
// not Intl: en-AU locale data writes "Sept", and the app uses three-letter
// months throughout. Every formatter is pure and covered by tests.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "13,867"; negatives keep a leading minus. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  const [whole, fraction] = Math.abs(value).toString().split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + grouped + (fraction ? `.${fraction}` : '');
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
function trimmed(value: number, places: number): string {
  return roundTo(value, places).toFixed(places).replace(/\.0+$/, '');
}

/** To the dollar, for records and rates of pay: "$4,537,500". */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${formatCount(Math.round(Math.abs(value)))}`;
}

/**
 * Compact money, for charts and tight figures only, in one style: lowercase
 * "k", "m" and "bn", one decimal, trailing ".0" dropped. "$4.2m", "$1.1bn",
 * "$10m", "$507k". Below $10,000 the full amount is clearer.
 */
export function formatMoneyCompact(value: number): string {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  const amount = Math.abs(value);
  if (amount < 10_000) return sign + formatMoney(amount);
  // Round first, so $999,950 reads "$1m", not "$1,000k".
  if (amount < 999_500) return `${sign}$${trimmed(amount / 1e3, 0)}k`;
  if (roundTo(amount / 1e6, 1) < 1000)
    return `${sign}$${trimmed(amount / 1e6, 1)}m`;
  return `${sign}$${trimmed(amount / 1e9, 1)}bn`;
}

/** Running text: "$4.7 million", "$1.2 billion"; smaller sums to the dollar. */
export function formatMoneyWords(value: number): string {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  const amount = Math.abs(value);
  if (amount < 1e6) return sign + formatMoney(amount);
  if (roundTo(amount / 1e6, 1) < 1000)
    return `${sign}$${trimmed(amount / 1e6, 1)} million`;
  return `${sign}$${trimmed(amount / 1e9, 1)} billion`;
}

/** What VoiceOver reads for a money figure: "4,537,500 dollars". */
export function moneyAccessibilityLabel(
  value: number,
  compact = false,
): string {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? 'minus ' : '';
  const amount = Math.abs(value);
  if (compact && amount >= 10_000) {
    const words = formatMoneyWords(amount);
    if (words.includes('million') || words.includes('billion'))
      return `${sign}${words.slice(1)} dollars`;
    return `${sign}${trimmed(amount / 1e3, 0)} thousand dollars`;
  }
  return `${sign}${formatCount(Math.round(amount))} dollars`;
}

/** A share of a whole, one decimal: "78.4%". Takes a percentage, not a fraction. */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '';
  return `${roundTo(value, decimals).toFixed(decimals)}%`;
}

/**
 * Whole-number percentages that add to 100 for a set shown together
 * (largest remainder), as the grants exports do.
 */
export function largestRemainder(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!total) return values.map(() => 0);
  const exact = values.map((value) => (Math.max(0, value) / total) * 100);
  const floors = exact.map(Math.floor);
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - floors[index]! }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    floors[index]! += 1;
    remaining -= 1;
  }
  return floors;
}

export type DateInput = string | number | Date;
interface CalendarDate {
  year: number;
  month: number; // 0-11
  day: number;
}
/**
 * A date-only string ("2026-09-25") is a calendar date and is never shifted
 * by time zone. Timestamps and epoch milliseconds use the device's zone,
 * which is what "Saved [date]" means to the reader.
 */
export function calendarDate(value: DateInput): CalendarDate | null {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) {
      const [year, month, day] = [
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
      ];
      const check = new Date(Date.UTC(year, month - 1, day));
      if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day)
        return null;
      return { year, month: month - 1, day };
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };
}

/** "17 September 2026" (long, the default) or "17 Sep 2026" (dense rows). */
export function formatDate(
  value: DateInput,
  style: 'long' | 'short' = 'long',
): string {
  const date = calendarDate(value);
  if (!date) return '';
  const month = MONTHS[date.month]!;
  return `${date.day} ${style === 'short' ? month.slice(0, 3) : month} ${date.year}`;
}

/** Financial year with an en dash: 2024 → "2024–25". */
export function formatFinancialYear(startYear: number): string {
  return `${startYear}–${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Money exports mix annual FY-start keys and election polling years without
 * per-cell return types. Preserve the bare source year, as the web does; never
 * infer a financial year from an election key. Shared by map and party page.
 */
export function formatDisclosureYear(year: number): string {
  return String(year);
}
export const disclosureYearNote =
  'Annual returns use the first year of the financial year; election returns use polling year.';

/** Ranges in prose: "1998 to 2026". */
export function formatYearRange(from: number, to: number): string {
  return from === to ? String(from) : `${from} to ${to}`;
}

/** Voice time with tabular figures: 462 → "7:42". */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export interface AsAt {
  /** The source file's own date: meta.as_of, generated_at, the roster check date. */
  asOf: DateInput | null;
  /**
   * The citation: source names, several joined with "; ". (Not `source`,
   * which is reserved for image sources.)
   */
  citation?: string | readonly string[];
  /** Licence, where it applies: "CC BY 4.0". */
  licence?: string;
  /** Coverage detail after the licence: "to March quarter 2026". */
  detail?: string;
  /** Set when the content is a saved copy that could not be refreshed. */
  savedAt?: DateInput | null;
}
/**
 * "As at 17 September 2026 · Source: Remuneration Tribunal; Parliamentary
 * Handbook". With a licence: "As at [date] · Source: IPEA quarterly
 * expenditure reports, CC BY 4.0, to [quarter]". A stale copy adds
 * "Saved [date]" so it is never silently mixed with fresh data.
 */
export function asAtText({
  asOf,
  citation,
  licence,
  detail,
  savedAt,
}: AsAt): string {
  const date = asOf == null ? '' : formatDate(asOf);
  const parts = [date ? `As at ${date}` : 'Date not published'];
  const sources = typeof citation === 'string' ? [citation] : (citation ?? []);
  const named = [sources.filter(Boolean).join('; '), licence, detail].filter(
    (part): part is string => !!part,
  );
  if (named.length) parts.push(`Source: ${named.join(', ')}`);
  const saved = savedAt == null ? '' : savedText(savedAt);
  if (saved) parts.push(saved);
  return parts.join(' · ');
}

/** "Saved 3 October 2026", for a copy kept on this iPhone. */
export function savedText(savedAt: DateInput): string {
  const saved = formatDate(savedAt);
  return saved ? `Saved ${saved}` : '';
}

/** W12 `_meta` in votes.json (scripts/export_votes.py, schema 1). */
export interface VotesMeta {
  content_changed_at?: string | null;
  latest_division_date?: string | null;
  latest_division_date_by_jurisdiction?: Record<string, string> | null;
  schema?: number;
}
/**
 * The voting record's line: "Record last changed [date] · Divisions through
 * [the record's jurisdiction date]". Without `_meta` the date is unknown, and
 * the line says so rather than borrowing another file's date.
 */
export function votesAsAtText(
  meta: VotesMeta | null | undefined,
  jurisdiction?: string,
): string {
  const changed = meta?.content_changed_at
    ? formatDate(meta.content_changed_at)
    : '';
  const through =
    (jurisdiction
      ? meta?.latest_division_date_by_jurisdiction?.[jurisdiction]
      : undefined) ?? meta?.latest_division_date;
  const parts: string[] = [];
  if (changed) parts.push(`Record last changed ${changed}`);
  if (through) {
    const date = formatDate(through);
    if (date) parts.push(`Divisions through ${date}`);
  }
  return parts.length ? parts.join(' · ') : 'Record date not published';
}

/** "Saved 3 October 2026. It may be out of date." */
export function staleText(savedAt: DateInput): string {
  const saved = formatDate(savedAt);
  return saved
    ? `Saved ${saved}. It may be out of date.`
    : 'This is a saved copy. It may be out of date.';
}
