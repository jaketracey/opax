import { editionTitles, type EditionView } from '../../api/selectors';
import { editionTier as tierFor, type EditionTier } from '../edition/model';

/**
 * Today's rules, each a pure function of a Sydney calendar day
 * ("2026-11-08"). Nothing here reads the clock: callers pass `sydneyDay()`.
 */
export type SydneyDate = string;
export type { EditionTier };

/** The calendar day in Sydney for an instant (the device clock by default). */
export function sydneyDay(now: Date | number = Date.now()): SydneyDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const DAY = 86_400_000;
const utc = (day: SydneyDate) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: SydneyDate, to: SydneyDate): number {
  return Math.round((utc(to) - utc(from)) / DAY);
}
/** The day `n` days after `day`. */
export function addDays(day: SydneyDate, n: number): SydneyDate {
  return new Date(utc(day) + n * DAY).toISOString().slice(0, 10);
}
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * The edition's freshness on Today by Sydney date: fresh 0 to 3 days, recent
 * 4 to 14, old beyond. A missing or failed read is never fresh.
 */
export function editionTier(
  date: string,
  today: SydneyDate | Date = new Date(),
): EditionTier {
  return tierFor(date.slice(0, 10), today);
}

/**
 * From the archive: a different year each day, 1998 to 2026 in order.
 * year = 1998 + ((Sydney day of the year − 1) mod 29).
 */
export function archiveYear(today: SydneyDate): number {
  const dayOfYear = daysBetween(`${today.slice(0, 4)}-01-01`, today) + 1;
  return 1998 + mod(dayOfYear - 1, 29);
}

/** Today's question: (days since 1 January 2026, Sydney) mod the deck size. */
export function questionIndex(today: SydneyDate, size: number): number {
  return size > 0 ? mod(daysBetween('2026-01-01', today), size) : -1;
}

/** Ask about parliament: two starters a day, in order, wrapping. */
export function starterPair<T>(today: SydneyDate, list: readonly T[]): T[] {
  if (!list.length) return [];
  const start = mod(daysBetween('2026-01-01', today) * 2, list.length);
  return Array.from(
    { length: Math.min(2, list.length) },
    (_, i) => list[(start + i) % list.length]!,
  );
}

/**
 * The card's title: a bill's short title; otherwise the record's name when
 * it is 80 characters or fewer, else its first clause (cut before " (" when
 * that comes within 80 characters, else at the last word before 80) and "…".
 */
export function cardTitle(
  edition: Pick<EditionView, 'title' | 'path' | 'kind'> &
    Partial<Pick<EditionView, 'shortTitle'>>,
): string {
  if (edition.shortTitle?.trim()) {
    const { cardTitle: short } = editionTitles({
      ...edition,
      title: edition.shortTitle.trim(),
      kind: 'topic',
    });
    return short;
  }
  return editionTitles({ ...edition, kind: 'topic' }).cardTitle;
}
