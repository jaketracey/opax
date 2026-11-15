import { ApiError } from './errors';
import { rosterId } from './ids';
import {
  boolean,
  date,
  dict,
  nonempty,
  object,
  optional,
  records,
  shape,
  text,
  type Decoded,
  type Decoder,
} from './validation';

/**
 * `/people/firsts.json` (portal: scripts/export_people_firsts.py): for each
 * person in the roster, the first speech and the first division the record
 * holds for them, each with its date and its source. A side file to the
 * roster: builds that do not know it never read it.
 *
 * "First" is a claim the export makes, never this code: a fact marked
 * `first` belongs to a person who entered that chamber on or after the date
 * its record starts. Every other fact is the earliest the record holds, and
 * is shown only with the year that chamber's record starts
 * (`meta.coverage`). Nothing ranks or compares.
 * Fields are only ever added; anything unknown is ignored.
 */
const claim = {
  /** The chamber the fact happened in: a key of `meta.coverage`. */
  chamber: optional(nonempty),
  /** True only when the export can say this was the person's first. */
  first: optional(boolean),
};
const speech = shape({
  date,
  ...claim,
  // The speech's own document, opened in the record reader.
  slug: (v: unknown) => {
    const s = nonempty(v);
    if (!/^speech-\d+$/.test(s)) throw new ApiError('invalid-data', 'slug');
    return s;
  },
});
const division = shape({
  date,
  ...claim,
  /** A key of `meta.sources.divisions`: who published the division. */
  source: nonempty,
  url: (v: unknown) => {
    const s = nonempty(v);
    let secure = false;
    try {
      const u = new URL(s);
      secure = u.protocol === 'https:' && !u.username && !u.password;
    } catch {
      secure = false;
    }
    if (!secure) throw new ApiError('invalid-data', 'url');
    return s;
  },
});
/** One fact that cannot be read is left out; the other still stands. */
const fact =
  <T>(decode: Decoder<T>): Decoder<T | undefined> =>
  (v) => {
    try {
      return optional(decode)(v);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'invalid-data')
        throw error;
      return undefined;
    }
  };
const entry = (v: unknown) => {
  const row = object(v);
  return {
    first_speech: fact(speech)(row.first_speech),
    first_division: fact(division)(row.first_division),
  };
};
export const decodePeopleFirsts = shape({
  meta: shape({
    generated: date,
    speeches_since: optional(date),
    /** Per chamber, the date its record of speeches and divisions starts. */
    coverage: optional(shape({ speeches: dict(date), divisions: dict(date) })),
    sources: shape({ speech: nonempty, divisions: dict(text) }),
  }),
  by_pid: records(entry, (k) => rosterId(k), 'firsts.by_pid'),
  by_name: records(entry, nonempty, 'firsts.by_name'),
});
export type PeopleFirsts = Decoded<typeof decodePeopleFirsts>;

export const PEOPLE_FIRSTS_PATH = '/people/firsts.json';

/** One fact as the page words it. */
interface Fact {
  date: string;
  source: string;
  /** The export's claim; false is "the earliest the record holds". */
  first: boolean;
  /** For an earliest fact: the year its chamber's record starts. */
  recordFrom?: number;
}
export interface MemberFirsts {
  speech?: Fact & { slug: string };
  division?: Fact & { url: string };
}

/**
 * How a fact may be worded: a first as the export marked it; any other only
 * with the year its chamber's record starts. Null when that year is not in
 * the file: an undated "earliest" is left out.
 */
function wording(
  fact: { date: string; chamber?: string; first?: boolean },
  coverage: Record<string, string> | undefined,
): Pick<Fact, 'first' | 'recordFrom'> | null {
  if (fact.first === true) return { first: true };
  const from =
    fact.chamber && coverage && Object.hasOwn(coverage, fact.chamber)
      ? coverage[fact.chamber]
      : undefined;
  // A record that starts after the fact it holds cannot be right.
  if (!from || from.slice(0, 10) > fact.date.slice(0, 10)) return null;
  return { first: false, recordFrom: Number(from.slice(0, 4)) };
}

/**
 * What the record holds for one roster row: by its roster id when it has
 * one, by its exact roster name only when it has none (the file's own rule).
 * A division whose source the file does not name is left out: every fact
 * is shown with its source or not at all.
 */
export function memberFirsts(
  firsts: PeopleFirsts | undefined,
  row: { name: string; pid?: string } | null | undefined,
): MemberFirsts | null {
  if (!firsts || !row) return null;
  const held = row.pid
    ? Object.hasOwn(firsts.by_pid, row.pid)
      ? firsts.by_pid[row.pid]
      : undefined
    : Object.hasOwn(firsts.by_name, row.name)
      ? firsts.by_name[row.name]
      : undefined;
  if (!held) return null;
  const { sources, coverage } = firsts.meta;
  const out: MemberFirsts = {};
  const spoken =
    held.first_speech && wording(held.first_speech, coverage?.speeches);
  if (held.first_speech && spoken)
    out.speech = {
      date: held.first_speech.date,
      slug: held.first_speech.slug,
      source: sources.speech,
      ...spoken,
    };
  const publisher =
    held.first_division &&
    Object.hasOwn(sources.divisions, held.first_division.source)
      ? sources.divisions[held.first_division.source]
      : undefined;
  const voted =
    held.first_division && wording(held.first_division, coverage?.divisions);
  if (held.first_division && publisher && voted)
    out.division = {
      date: held.first_division.date,
      url: held.first_division.url,
      source: publisher,
      ...voted,
    };
  return out.speech || out.division ? out : null;
}
