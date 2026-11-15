import type { Electorate } from '../../api/catalogs';
import { jurisdictionName } from '../../design/parliament';
import { partyText, type PartyContext } from '../../design/party';
import type { Overview } from '../vic-election/decoders';

/**
 * A state lower house dissolved for an election: no one is a member for
 * its districts until the result is declared and the roster is reloaded.
 * Everything here is read from data; no date is written in the app.
 */
export interface Dissolved {
  /** The election the house was dissolved for, from the election record. */
  electionDay: string;
  /** The row's four lines, as drawn and (in order) as VoiceOver reads them. */
  lines: readonly [string, string, string, string];
}

/** A dissolved row, none, or not yet known (the election record is out). */
export type DissolvedState = Dissolved | 'unknown' | null;

/** The record's election day as a day and month, as the row says it. */
export function electionDayWords(day: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day.slice(0, 10)}T00:00:00Z`));
}

const HOUSES: Record<string, string> = {
  la: 'Legislative Assembly',
  ha: 'House of Assembly',
};
/** "Legislative Assembly" for vic_la; the lower house's own name. */
function houseName(chamber: string): string {
  return HOUSES[/_(la|ha)$/.exec(chamber.toLowerCase())?.[1] ?? 'la']!;
}

/**
 * Whether the roster's record of this seat is from before that election:
 * `representation_as_of` in the electorates index against the election
 * day. This one comparison is the switch. Once the roster is reloaded with
 * the member declared elected, its date is the election day or later and
 * the row draws that member as any other.
 */
export function rosterPredates(
  seat: Pick<Electorate, 'representation_as_of'>,
  electionDay: string,
): boolean {
  return (seat.representation_as_of ?? '').slice(0, 10) < electionDay;
}

/**
 * The election day the seat's house is dissolved for, or null. From the
 * election record: the seat is one of its districts, its caretaker period
 * has begun (the `caretaker` key date's `passes_at`, when the Assembly was
 * dissolved), and the roster's record of the seat predates election day.
 */
export function dissolvedFor(
  seat: Pick<Electorate, 'url' | 'representation_as_of'>,
  overview: Pick<Overview, 'election_day' | 'key_dates' | 'districts'>,
  now: Date,
): string | null {
  if (!overview.districts.some((d) => d.electorate_url === seat.url))
    return null;
  const began = overview.key_dates.find((d) => d.id === 'caretaker')?.passes_at;
  if (!began || now.getTime() < Date.parse(began)) return null;
  return rosterPredates(seat, overview.election_day)
    ? overview.election_day
    : null;
}

/** The dissolved row's four lines. Nobody is called a current member. */
export function dissolvedLines(
  seat: Pick<Electorate, 'name' | 'chamber' | 'state_code'>,
  last: { name: string; party: string | null; status: PartyContext['status'] },
  electionDay: string,
): Dissolved['lines'] {
  const party = last.party
    ? partyText({ party: last.party, status: last.status }).visible
    : null;
  return [
    `${jurisdictionName(seat.state_code) ?? seat.state_code.toUpperCase()} · ${houseName(seat.chamber)}`,
    seat.name,
    `Assembly dissolved for the ${electionDayWords(electionDay)} election`,
    `Last member: ${[last.name, party].filter(Boolean).join(', ')}`,
  ];
}

/**
 * The lines that hold a dissolved row's place before the device knows the
 * real ones: the longest district and member names in the roster, so the
 * held row is never shorter than the row that lands on it. Never drawn.
 */
export const DISSOLVED_STAND_IN: Dissolved['lines'] = [
  'Victoria · Legislative Assembly',
  'Narre Warren North',
  'Assembly dissolved for the 00 September election',
  'Last member: Kathleen Matthews-Ward, Independent',
];

/**
 * The state row's form, decided without waiting where the device can:
 * - the election record, when it is at hand, answers;
 * - with none at hand, what the last launch kept answers while the roster
 *   still predates that election (offline, or the record retired);
 * - with neither and the record still on its way, not yet known: the row's
 *   place is held, and nobody is drawn as a member meanwhile.
 */
export function dissolvedState(
  seat: Pick<Electorate, 'url' | 'representation_as_of'>,
  election: { overview: Overview | null; loading: boolean },
  now: Date,
  kept: { electionDay: string } | null,
): string | 'unknown' | null {
  if (election.overview) return dissolvedFor(seat, election.overview, now);
  if (kept)
    return rosterPredates(seat, kept.electionDay) ? kept.electionDay : null;
  return election.loading ? 'unknown' : null;
}
