import { formatCount, formatMoney, formatPercent } from '../../design/format';
import { partyFromCode } from '../bills/party-codes';
import type { ElectorateView } from './model';

/** One election as the electorate file holds it. */
export type ElectionRecord = NonNullable<
  ElectorateView['elections'][number]['data']
>;
type Candidate = ElectionRecord['candidates'][number];
type CensusRecord = NonNullable<ElectorateView['census'][number]['data']>;

const year = (date: string) => date.slice(0, 4);

/**
 * "2025 federal election", "2024 by-election", "2022 state election". The
 * file's raw kind ("general", "by_election") never prints.
 */
export function electionTitle(
  election: Pick<ElectionRecord['election'], 'kind' | 'poll_date'>,
  jurisdiction: string,
): string {
  const when = year(election.poll_date);
  if (/by[\s_-]?election|^by$/i.test(election.kind))
    return `${when} by-election`;
  return jurisdiction === 'federal'
    ? `${when} federal election`
    : `${when} state election`;
}

export interface ElectionWinner {
  name: string;
  /** The party's name; null when the result file records none. */
  party: string | null;
  personId: string | null;
}
export interface ElectionSummary {
  key: string;
  title: string;
  /** The poll date, YYYY-MM-DD. */
  date: string;
  /** Null when the file names no elected candidate, or several. */
  winner: ElectionWinner | null;
}

export function electionSummary(
  record: ElectionRecord,
  jurisdiction: string,
): ElectionSummary {
  const elected = record.candidates.filter((c) => c.elected);
  const one = elected.length === 1 ? elected[0]! : null;
  return {
    key: record.election_id,
    title: electionTitle(record.election, jurisdiction),
    date: record.election.poll_date,
    winner: one
      ? {
          name: one.name,
          // Result files carry codes ("ALP"): the party's name, never a code.
          party: partyFromCode(one.party),
          personId: one.person_id,
        }
      : null,
  };
}

/** Newest first; the order the electorate page and the card both use. */
export function electionsNewestFirst(
  records: readonly ElectionRecord[],
): ElectionRecord[] {
  return [...records].sort(
    (a, b) =>
      b.election.poll_date.localeCompare(a.election.poll_date) ||
      a.election_id.localeCompare(b.election_id),
  );
}

/** The newest election in the file, summarised; null when it holds none. */
export function latestElection(
  view: Pick<ElectorateView, 'elections'>,
  jurisdiction: string,
): ElectionSummary | null {
  const records = view.elections
    .map((b) => b.data)
    .filter((e): e is ElectionRecord => !!e);
  const newest = electionsNewestFirst(records)[0];
  return newest ? electionSummary(newest, jurisdiction) : null;
}

/** A share of formal votes, one decimal, computed here and never stored. */
export function voteShare(votes: number, formal: number | null): number | null {
  if (!formal || formal <= 0 || !Number.isFinite(votes)) return null;
  return Math.round((votes / formal) * 1000) / 10;
}

const FIRST = /^(primary|first|fp|first_preference)s?$/i;
const AFTER = /^(tcp|two_candidate|two_candidate_preferred|after)$/i;

function count(candidate: Candidate, kind: RegExp) {
  return candidate.votes.find((v) => kind.test(v.kind)) ?? null;
}
function formalFor(candidates: readonly Candidate[], kind: RegExp) {
  return candidates.reduce((sum, c) => sum + (count(c, kind)?.votes ?? 0), 0);
}

export interface CandidateRow {
  name: string;
  party: string | null;
  personId: string | null;
  elected: boolean;
  /** "41,234 (45.1%)", or the count alone when no formal total is known. */
  first: string | null;
  firstVotes: number;
  /** "67.8%", for the two finalists only. */
  after: string | null;
}

/**
 * Candidates ordered by first preferences, highest first (the stated rule).
 * Ties keep the ballot order, then the name.
 */
export function candidateRows(record: ElectionRecord): CandidateRow[] {
  const firstFormal = formalFor(record.candidates, FIRST);
  const afterFormal = formalFor(record.candidates, AFTER);
  const finalists = record.candidates.filter((c) => count(c, AFTER));
  return record.candidates
    .map((c, i) => {
      const first = count(c, FIRST);
      const after = count(c, AFTER);
      const firstShare = first
        ? voteShare(first.votes, first.denominator ?? firstFormal)
        : null;
      const afterShare =
        after && finalists.length === 2
          ? voteShare(after.votes, after.denominator ?? afterFormal)
          : null;
      return {
        row: {
          name: c.name,
          party: c.party,
          personId: c.person_id,
          elected: c.elected,
          first: first
            ? firstShare === null
              ? formatCount(first.votes)
              : `${formatCount(first.votes)} (${firstShare.toFixed(1)}%)`
            : null,
          firstVotes: first?.votes ?? -1,
          after: afterShare === null ? null : `${afterShare.toFixed(1)}%`,
        },
        ballot: c.ballot_position ?? Number.MAX_SAFE_INTEGER,
        i,
      };
    })
    .sort(
      (a, b) =>
        b.row.firstVotes - a.row.firstVotes ||
        a.ballot - b.ballot ||
        a.row.name.localeCompare(b.row.name) ||
        a.i - b.i,
    )
    .map((x) => x.row);
}

/**
 * The winner's two-candidate share as a row's result line ("66.9% after
 * preferences"), only when the record carries both finalists' counts and
 * names one winner; null otherwise, so a row never shows a guessed result.
 */
export function winnerResult(record: ElectionRecord): string | null {
  const elected = record.candidates.filter((c) => c.elected);
  if (elected.length !== 1) return null;
  const after = candidateRows(record).find(
    (row) => row.elected && row.after,
  )?.after;
  return after ? `${after} after preferences` : null;
}

/** Census indicators in the electorate page's label order. */
export const censusIndicators: Record<
  string,
  [string, 'count' | 'money' | 'percent']
> = {
  population: ['Population', 'count'],
  median_age: ['Median age', 'count'],
  average_household_size: ['Average household size', 'count'],
  born_overseas_pct: ['Born overseas', 'percent'],
  homeownership_pct: ['Home ownership', 'percent'],
  indigenous_pct: ['Aboriginal and Torres Strait Islander people', 'percent'],
  labour_force_participation: ['Labour force participation', 'percent'],
  median_household_income_weekly: ['Median weekly household income', 'money'],
  median_income: ['Median weekly personal income', 'money'],
  median_mortgage_monthly: ['Median monthly mortgage repayment', 'money'],
  median_rent_weekly: ['Median weekly rent', 'money'],
  rental_pct: ['Renting', 'percent'],
  unemployment_rate: ['Unemployment rate', 'percent'],
  university_pct: ['University qualification', 'percent'],
};
export const HEADLINE_INDICATORS = [
  'population',
  'median_age',
  'median_household_income_weekly',
] as const;

export function censusValue(key: string, value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const kind = censusIndicators[key]?.[1] ?? 'count';
  return kind === 'money'
    ? formatMoney(value)
    : kind === 'percent'
      ? formatPercent(value)
      : formatCount(value);
}

export interface CensusRow {
  key: string;
  label: string;
  value: string;
}
export interface CensusHeadline {
  /** "Census 2021"; the card leaves its rows out without a year. */
  label: string;
  year: number;
  rows: CensusRow[];
}

/** The newest Census block in the file, or null. */
export function newestCensus(
  view: Pick<ElectorateView, 'census'>,
): CensusRecord | null {
  return (
    view.census
      .map((b) => b.data)
      .filter((d): d is CensusRecord => !!d)
      .sort((a, b) => b.year - a.year)[0] ?? null
  );
}

/**
 * The three values the Your MP card and the electorate strip show, with the
 * Census year as their label. No year, or none of the three, gives null.
 */
export function censusHeadline(
  census: Pick<CensusRecord, 'year' | 'indicators'> | null,
): CensusHeadline | null {
  if (!census || !Number.isInteger(census.year) || census.year < 1900)
    return null;
  const rows = HEADLINE_INDICATORS.flatMap((key) => {
    const value = censusValue(key, census.indicators[key] ?? null);
    return value ? [{ key, label: censusIndicators[key]![0], value }] : [];
  });
  return rows.length
    ? { label: `Census ${census.year}`, year: census.year, rows }
    : null;
}

/** Every other indicator, in the stated label order, values present only. */
export function censusOtherRows(
  census: Pick<CensusRecord, 'indicators'>,
): CensusRow[] {
  const headline = new Set<string>(HEADLINE_INDICATORS);
  const known = Object.keys(censusIndicators);
  const keys = [
    ...known.filter((k) => k in census.indicators),
    ...Object.keys(census.indicators)
      .filter((k) => !known.includes(k))
      .sort(),
  ];
  return keys
    .filter((k) => !headline.has(k))
    .flatMap((key) => {
      const value = censusValue(key, census.indicators[key] ?? null);
      return value
        ? [
            {
              key,
              label:
                censusIndicators[key]?.[0] ??
                `${key.charAt(0).toUpperCase()}${key.slice(1).replaceAll('_', ' ')}`,
              value,
            },
          ]
        : [];
    });
}
