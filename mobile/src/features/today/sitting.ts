import {
  array,
  boolean,
  count,
  date,
  invalid,
  nonempty,
  nullable,
  object,
  shape,
  url,
  type Decoder,
} from '../../api/validation';
import { formatDate } from '../../design/format';
import type { SourceDetails, SourceOriginal } from '../../design/source';
import { calendarDayWords } from './day-words';

/**
 * The line under Today's date, from the Parliament's published sitting
 * calendar (`/parliament/sitting-days.json`, docs/DATA-SITTING-DAYS.md):
 * "Parliament is sitting today", "The Senate is sitting today", "The House
 * is sitting today" or "Next sitting day: Monday 23 November". Decided by
 * rule in the calendar's own timezone. Anything the calendar does not say
 * (a missing or unreadable file, a day past `expires` or outside
 * `coverage`, no published next day) is no line, never a guess.
 */
export const sittingDaysPath = '/parliament/sitting-days.json';

/** "2026-11-23" and nothing else: a calendar day, no time. */
const calendarDay: Decoder<string> = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(nonempty(v)) ? date(v) : invalid();
const https: Decoder<string> = (v) =>
  url(v).startsWith('https://') ? url(v) : invalid();

/** The calendar day an instant falls on in `timeZone`, or null. */
export function calendarDayIn(timeZone: string, now: Date): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    const day = `${part('year')}-${part('month')}-${part('day')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  } catch {
    return null;
  }
}

/** An IANA zone ("Australia/Sydney") the device can read dates in. */
const timeZone: Decoder<string> = (v) => {
  const zone = nonempty(v);
  if (
    !/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/.test(zone) ||
    calendarDayIn(zone, new Date(0)) === null
  )
    invalid('timezone: Not a timezone');
  return zone;
};

const decodeSource = shape({
  publisher: nonempty,
  title: nonempty,
  url: https,
  /** The calendar file's own publication date; null when not known. */
  published: nullable(calendarDay),
});
export type SittingSource = ReturnType<typeof decodeSource>;

export type SittingYear =
  | { year: number; status: 'published'; source: SittingSource }
  | { year: number; status: 'not_published' };
const decodeYear: Decoder<SittingYear> = (v) => {
  const row = object(v);
  const year = count(row.year);
  if (year < 1901 || year > 9999) invalid('year: Out of range');
  if (row.status === 'published')
    return { year, status: 'published', source: decodeSource(row.source) };
  if (row.status === 'not_published') return { year, status: 'not_published' };
  return invalid('status: Not a known status');
};

const decodeDay = shape({ date: calendarDay, house: boolean, senate: boolean });
export type SittingDay = ReturnType<typeof decodeDay>;

export interface SittingDays {
  schema_version: 1;
  published: string;
  timezone: string;
  coverage: { first: string; last: string };
  expires: string;
  years: SittingYear[];
  /** Sitting days only, in date order; at least one house sits on each. */
  days: SittingDay[];
}

const yearOf = (day: string) => Number(day.slice(0, 4));

/**
 * Strict: any field out of its contract refuses the whole file, so a
 * partial calendar can never make a sitting day look like a day off.
 * Fields the contract does not name are ignored; a breaking change bumps
 * `schema_version`, which this reader then refuses.
 */
export const decodeSittingDays: Decoder<SittingDays> = (v) => {
  const file = object(v);
  if (file.schema_version !== 1) invalid('schema_version: Not version 1');
  const published = calendarDay(file.published);
  const timezone = timeZone(file.timezone);
  const span = object(file.coverage);
  const coverage = {
    first: calendarDay(span.first),
    last: calendarDay(span.last),
  };
  if (coverage.first > coverage.last)
    invalid('coverage: Ends before it starts');
  const expires = calendarDay(file.expires);
  const years = array(decodeYear)(file.years);
  if (!years.length) invalid('years: Empty');
  if (new Set(years.map((y) => y.year)).size !== years.length)
    invalid('years: A year is listed twice');
  const days = array(decodeDay)(file.days);
  let previous = '';
  for (const day of days) {
    if (!day.house && !day.senate)
      invalid('days: A listed day with no sitting');
    if (day.date <= previous) invalid('days: Out of order or repeated');
    if (day.date < coverage.first || day.date > coverage.last)
      invalid('days: Outside coverage');
    if (!publishedYear({ years }, yearOf(day.date)))
      invalid('days: In a year that is not published');
    previous = day.date;
  }
  return {
    schema_version: 1,
    published,
    timezone,
    coverage,
    expires,
    years,
    days,
  };
};

function publishedYear(
  file: Pick<SittingDays, 'years'>,
  year: number,
): Extract<SittingYear, { status: 'published' }> | null {
  const row = file.years.find((y) => y.year === year);
  return row?.status === 'published' ? row : null;
}

export type SittingKind = 'both' | 'house' | 'senate' | 'next';
export interface SittingLine {
  kind: SittingKind;
  /** What the line says, as drawn and as VoiceOver reads it. */
  text: string;
  /** Today in the calendar's timezone. */
  today: string;
  /** The day the line is about: today, or the next sitting day. */
  day: string;
  /** The published calendar years the line rests on, oldest first. */
  years: number[];
}

/**
 * The line for an instant, by rule, or null when the calendar cannot say:
 * - today is listed: which houses sit;
 * - today is inside coverage and not listed: the next listed day, if one
 *   is published before the calendar's coverage and expiry end;
 * - otherwise (before coverage, past `coverage.last` or `expires`, or no
 *   published next day): null.
 */
export function sittingLine(file: SittingDays, now: Date): SittingLine | null {
  const today = calendarDayIn(file.timezone, now);
  if (!today) return null;
  if (today > file.expires) return null;
  if (today < file.coverage.first || today > file.coverage.last) return null;
  if (!publishedYear(file, yearOf(today))) return null;
  const listed = file.days.find((d) => d.date === today);
  if (listed) {
    const kind: SittingKind =
      listed.house && listed.senate
        ? 'both'
        : listed.senate
          ? 'senate'
          : 'house';
    return {
      kind,
      text: sittingWords[kind],
      today,
      day: today,
      years: [yearOf(today)],
    };
  }
  const end =
    file.expires < file.coverage.last ? file.expires : file.coverage.last;
  const next = file.days.find((d) => d.date > today && d.date <= end);
  const words = next ? calendarDayWords(next.date) : null;
  if (!next || !words || !publishedYear(file, yearOf(next.date))) return null;
  return {
    kind: 'next',
    text: `Next sitting day: ${words}`,
    today,
    day: next.date,
    years: [...new Set([yearOf(today), yearOf(next.date)])],
  };
}

const sittingWords: Record<Exclude<SittingKind, 'next'>, string> = {
  both: 'Parliament is sitting today',
  senate: 'The Senate is sitting today',
  house: 'The House is sitting today',
};

/** The sheet's "How this is chosen", word for word. */
export function sittingRule(file: Pick<SittingDays, 'timezone'>): string {
  const place = file.timezone.split('/').pop()!.replace(/_/g, ' ');
  return `From the Parliament’s published sitting calendar, for today’s date in ${place}. A sitting day is a day the House, the Senate or both sit. After the last published day the line is left out rather than guessed.`;
}

/**
 * The line's source sheet: the publisher of each calendar year the line
 * rests on, its title and published date, opening the calendar itself.
 */
export function sittingSources(
  file: SittingDays,
  line: Pick<SittingLine, 'years'>,
  record: { stale: boolean; savedAt: number | null } = {
    stale: false,
    savedAt: null,
  },
): SourceDetails {
  const sources = line.years
    .map((year) => publishedYear(file, year)?.source)
    .filter((s): s is SittingSource => !!s);
  const newest = sources
    .map((s) => s.published)
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  const originals: SourceOriginal[] = sources.map((s) => ({
    label: s.publisher,
    url: s.url,
    record: s.title,
    asOf: s.published,
  }));
  const saved = record.stale && record.savedAt !== null;
  return {
    header: newest ? `Published ${formatDate(newest)}` : 'Date not published',
    asOf: newest ?? null,
    citation: sources.map((s) => ({
      label: s.publisher,
      title: s.title,
      asOf: s.published,
    })),
    originals,
    coverage: `Calendar to ${formatDate(file.coverage.last, 'short')}`,
    rule: sittingRule(file),
    savedAt: saved ? record.savedAt : null,
    state: saved ? 'saved' : null,
  };
}
