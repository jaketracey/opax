import type { Catalogs } from '../../api/catalogs';
import { nameKey } from '../../api/ids';
import { formatCount } from '../../design/format';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../../design/parliament';

export type FeedRow = Awaited<
  ReturnType<Catalogs['declarations']>
>['data'] extends (infer R)[] | null
  ? R
  : never;

/** The feed's filters: "all", or one chamber or jurisdiction ID; a name. */
export interface FeedFilters {
  chamber: string;
  jurisdiction: string;
  member: string;
}
export const noFilters: FeedFilters = {
  chamber: 'all',
  jurisdiction: 'all',
  member: '',
};

// A fixed order, whatever order the export's rows come in: the House, then
// the Senate, then state chambers by name; Federal, then states by name.
const chamberRank: Record<string, number> = { house: 0, senate: 1 };
const jurisdictionRank: Record<string, number> = { federal: 0 };
const byRank = (rank: Record<string, number>) => (a: Facet, b: Facet) =>
  (rank[a.id] ?? 9) - (rank[b.id] ?? 9) || a.label.localeCompare(b.label);

export interface Facet {
  id: string;
  label: string;
  count: number;
}
/**
 * The chambers and jurisdictions present in the export, in a fixed order,
 * with their counts. IDs never reach the reader: an unknown chamber reads
 * "Chamber not recorded".
 */
export function feedFacets(rows: readonly FeedRow[]) {
  const chambers = new Map<string, Facet>();
  const jurisdictions = new Map<string, Facet>();
  for (const row of rows) {
    const chamber = chambers.get(row.chamber) ?? {
      id: row.chamber,
      label: chamberName(row.chamber, row.jurisdiction) ?? CHAMBER_NOT_RECORDED,
      count: 0,
    };
    chamber.count += 1;
    chambers.set(row.chamber, chamber);
    const jurisdiction = jurisdictions.get(row.jurisdiction) ?? {
      id: row.jurisdiction,
      label: jurisdictionName(row.jurisdiction) ?? 'Jurisdiction not recorded',
      count: 0,
    };
    jurisdiction.count += 1;
    jurisdictions.set(row.jurisdiction, jurisdiction);
  }
  return {
    chambers: [...chambers.values()].sort(byRank(chamberRank)),
    jurisdictions: [...jurisdictions.values()].sort(byRank(jurisdictionRank)),
  };
}

/** Rows matching every filter; the member filter matches any part of a name. */
export function filterFeed(rows: readonly FeedRow[], filters: FeedFilters) {
  const member = nameKey(filters.member);
  return rows.filter(
    (row) =>
      (filters.chamber === 'all' || row.chamber === filters.chamber) &&
      (filters.jurisdiction === 'all' ||
        row.jurisdiction === filters.jurisdiction) &&
      (!member || nameKey(row.name).includes(member)),
  );
}

const declarations = (n: number) =>
  `${formatCount(n)} ${n === 1 ? 'declaration' : 'declarations'}`;
/** "300 declarations", or "176 of 300 declarations" once filtered. */
export function feedCountLine(shown: number, total: number) {
  return shown === total
    ? declarations(total)
    : `${formatCount(shown)} of ${declarations(total)}`;
}

/** A run of consecutive entries by one person, each with its place in the list. */
export interface PersonRun<T> {
  key: string;
  entries: { item: T; index: number }[];
}
/**
 * Consecutive entries by the same person as one run, so a name heads its
 * entries once (Today's Just declared and the feed). The register's ID
 * separates two people who share a printed name.
 */
export function personRuns<
  T extends { id: string | number; name: string; person_id?: string | null },
>(rows: readonly T[]): PersonRun<T>[] {
  const runs: PersonRun<T>[] = [];
  rows.forEach((item, index) => {
    const last = runs[runs.length - 1]?.entries[0]?.item;
    if (
      last &&
      nameKey(last.name) === nameKey(item.name) &&
      (last.person_id ?? null) === (item.person_id ?? null)
    )
      runs[runs.length - 1]!.entries.push({ item, index });
    else runs.push({ key: String(item.id), entries: [{ item, index }] });
  });
  return runs;
}

/** "300 changes", "1 change": the feed's count at its foot. */
export const changesCount = (n: number) =>
  `${formatCount(n)} ${n === 1 ? 'change' : 'changes'}`;

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
];
const DAY = 86_400_000;
/** Today's calendar date in Sydney, "2026-11-09". */
export function sydneyDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** The Monday that starts a date's week, as a UTC day; null when undated. */
function mondayOf(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(day)) return null;
  return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
}
export interface WeekGroup<T> {
  key: string;
  title: string;
  rows: T[];
  /** Each row's place in the whole list. */
  indices: number[];
}
/**
 * The feed's rows by the week (Monday to Sunday, Sydney dates) of their
 * register date: "This week", "Last week", "Week of 17 August", with the
 * year when it is not this year ("Week of 29 December 2025").
 */
export function weekGroups<T extends { date: string }>(
  rows: readonly T[],
  today: Date | string = new Date(),
): WeekGroup<T>[] {
  const day = typeof today === 'string' ? today : sydneyDate(today);
  const thisWeek = mondayOf(day);
  const year = Number(day.slice(0, 4));
  const title = (monday: number | null) => {
    if (monday === null) return 'Date not published';
    if (monday === thisWeek) return 'This week';
    if (thisWeek !== null && monday === thisWeek - 7 * DAY) return 'Last week';
    const start = new Date(monday);
    return `Week of ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}${
      start.getUTCFullYear() === year ? '' : ` ${start.getUTCFullYear()}`
    }`;
  };
  const groups = new Map<string, WeekGroup<T>>();
  rows.forEach((row, index) => {
    const monday = mondayOf(row.date);
    const key =
      monday === null ? 'undated' : new Date(monday).toISOString().slice(0, 10);
    let group = groups.get(key);
    if (!group) {
      group = { key, title: title(monday), rows: [], indices: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.indices.push(index);
  });
  return [...groups.values()];
}
/** Week sections, each a list of one member's consecutive entries. */
export function weekRuns<
  T extends {
    id: string | number;
    name: string;
    date: string;
    person_id?: string | null;
  },
>(rows: readonly T[], today?: Date | string) {
  return weekGroups(rows, today).map((group) => ({
    key: group.key,
    title: group.title,
    data: personRuns(group.rows).map((run) => ({
      key: run.key,
      entries: run.entries.map(({ item, index }) => ({
        item,
        index: group.indices[index]!,
      })),
    })),
  }));
}
