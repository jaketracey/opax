import type { Bill } from '../../api/catalog-decoders';
import {
  array,
  date,
  dict,
  invalid,
  nonempty,
  nullable,
  object,
  shape,
  text,
  url,
  type Decoder,
} from '../../api/validation';
import type { SydneyDate } from '../today/rules';

/**
 * On this day: a bill introduced on today's date in an earlier year, from
 * the bills register the list already holds. Pure, in Sydney dates; nothing
 * here reads the clock.
 *
 * The choice is by date alone. Every bill introduced on this day of the
 * month in an earlier year is a candidate, in the order the register
 * introduced them (date, then register key). When there are several they
 * take turns year by year, so no bill, house or sponsor is preferred.
 * 29 February matches only 29 February. No candidate, no row.
 */
export interface OnThisDayBill {
  bill: Bill;
  /** The year the bill was introduced. */
  year: number;
  /** The bill's introduction date, "2018-11-15". */
  date: string;
}

/** The rule, word for word, as the row's "How this is chosen" sheet shows it. */
export const ON_THIS_DAY_RULE =
  'A bill introduced on this date in an earlier year, from ParlInfo’s bills register. When there are several, they take turns year by year, in the order they were introduced.';

const DAY = /^\d{4}-\d{2}-\d{2}/;

export function onThisDay(
  bills: readonly Bill[] | null | undefined,
  today: SydneyDate,
): OnThisDayBill | null {
  if (!bills?.length || !DAY.test(today)) return null;
  const year = Number(today.slice(0, 4));
  const monthDay = today.slice(4, 10);
  const candidates = bills
    .filter(
      (b) =>
        !!b.introduced &&
        DAY.test(b.introduced) &&
        b.introduced.slice(4, 10) === monthDay &&
        Number(b.introduced.slice(0, 4)) < year,
    )
    .sort(
      (a, b) =>
        a.introduced!.slice(0, 10).localeCompare(b.introduced!.slice(0, 10)) ||
        a.key.localeCompare(b.key, 'en', { numeric: true }),
    );
  if (!candidates.length) return null;
  const bill = candidates[year % candidates.length]!;
  const date = bill.introduced!.slice(0, 10);
  return { bill, year: Number(date.slice(0, 4)), date };
}

/**
 * The dated index behind the division and speech rows
 * (`/parliament/on-this-day/MM-DD.json`, docs/DATA-ON-THIS-DAY.md): every
 * division and speech the bill files record on one month and day, oldest
 * first, each bill named once. It carries no party and no machine text.
 */
const indexDivision = shape({
  key: nonempty,
  date,
  house: nullable(text),
  stage: nullable(text),
  bill: nonempty,
  url: nullable(url),
});
const indexSpeech = shape({
  slug: nonempty,
  date,
  speaker: nonempty,
  bill: nonempty,
});
export type OnThisDayDivision = ReturnType<typeof indexDivision>;
export type OnThisDaySpeech = ReturnType<typeof indexSpeech>;
export interface OnThisDayIndex {
  day: string;
  bills: Record<string, string>;
  divisions: OnThisDayDivision[];
  speeches: OnThisDaySpeech[];
}

export const onThisDayPath = (today: SydneyDate) =>
  `/parliament/on-this-day/${today.slice(5, 10)}.json`;

/** Strict: a row on another date, or naming a bill the file does not, fails. */
export const decodeOnThisDayIndex: Decoder<OnThisDayIndex> = (v) => {
  const file = object(v);
  if (file.schema_version !== 1) invalid('schema_version: Not version 1');
  const day = nonempty(file.day);
  if (!/^\d{2}-\d{2}$/.test(day)) invalid('day: Not a month and day');
  const bills = dict(nonempty)(file.bills);
  const divisions = array(indexDivision)(file.divisions);
  const speeches = array(indexSpeech)(file.speeches);
  for (const row of [...divisions, ...speeches]) {
    if (row.date.slice(5, 10) !== day) invalid('rows: On another date');
    if (!Object.hasOwn(bills, row.bill)) invalid('rows: Bill not named');
  }
  return { day, bills, divisions, speeches };
};

/**
 * The same turn-taking as the bill: rows from earlier years only, in the
 * file's order (date, then record number), taking turns year by year.
 */
function turn<T extends { date: string }>(
  rows: readonly T[],
  today: SydneyDate,
): T | null {
  const year = Number(today.slice(0, 4));
  const monthDay = today.slice(4, 10);
  const earlier = rows.filter(
    (row) =>
      row.date.slice(4, 10) === monthDay && Number(row.date.slice(0, 4)) < year,
  );
  return earlier.length ? earlier[year % earlier.length]! : null;
}

export interface OnThisDayDivisionPick {
  division: OnThisDayDivision;
  billName: string;
  year: number;
}
export interface OnThisDaySpeechPick {
  speech: OnThisDaySpeech;
  billName: string;
  year: number;
}
/** Everything On this day shows for one visit; null parts draw no row. */
export interface OnThisDayPicks {
  bill: OnThisDayBill | null;
  division: OnThisDayDivisionPick | null;
  speech: OnThisDaySpeechPick | null;
}

export function onThisDayMore(
  index: OnThisDayIndex | null | undefined,
  today: SydneyDate,
): Pick<OnThisDayPicks, 'division' | 'speech'> {
  if (!index || !DAY.test(today) || index.day !== today.slice(5, 10))
    return { division: null, speech: null };
  const division = turn(index.divisions, today);
  const speech = turn(index.speeches, today);
  return {
    division: division && {
      division,
      billName: index.bills[division.bill]!,
      year: Number(division.date.slice(0, 4)),
    },
    speech: speech && {
      speech,
      billName: index.bills[speech.bill]!,
      year: Number(speech.date.slice(0, 4)),
    },
  };
}

export const ON_THIS_DAY_DIVISION_RULE =
  'A division on a bill held on this date in an earlier year, from They Vote For You. When there are several, they take turns year by year, in the order they were held.';
export const ON_THIS_DAY_SPEECH_RULE =
  'A speech on a bill given on this date in an earlier year, from Hansard. When there are several, they take turns year by year, in the order they are recorded.';

// The end of a bill's name that says which bill it is: "Bill 2018",
// "Bill (No. 2) 2018", "Bill 2018 [No. 2]", and the same for an Act.
const NAME_END =
  /\s+((?:Bill|Act)(?:\s+\(No\.\s*\d+\))?\s+\d{4}(?:\s+\[No\.\s*\d+\])?)$/;

/**
 * A bill's name for a clamped line. A name longer than `budget` characters
 * is shortened in the middle, at a whole word, so its end ("Bill 2018")
 * survives: a clamp cuts from the end, and the year is what tells two bills
 * of one name apart. A name with no such end, or one that fits, is returned
 * as it is.
 */
export function shortBillName(name: string, budget: number): string {
  const text = name.trim();
  const end = NAME_END.exec(text)?.[1];
  if (!end || text.length <= budget) return text;
  const words = text
    .slice(0, text.length - end.length)
    .trim()
    .split(/\s+/);
  const room = budget - end.length - 2;
  let head = '';
  for (const word of words) {
    const next = head ? `${head} ${word}` : word;
    if (next.length > room) break;
    head = next;
  }
  // Never less than the first word, and no comma or opening bracket left
  // hanging before the ellipsis.
  head = (head || words[0] || '').replace(/[\s,(\[]+$/, '');
  return `${head}… ${end}`;
}

/**
 * How many characters two clamped lines of the row's title hold, counted
 * generously wide (0.6 em a character) so the shortened name never reaches
 * the clamp. `width` is the window's, less the row's margins, symbol and
 * chevron.
 */
export function titleBudget(
  width: number,
  fontScale: number,
  fontSize: number,
) {
  const line =
    Math.max(0, width - 118) / (fontSize * 0.6 * Math.max(1, fontScale));
  return Math.max(24, Math.floor(line) * 2);
}
