import type { Electorate } from '../../api/catalogs';
import { formatDate } from '../../design/format';
import { jurisdictionName } from '../../design/parliament';
import { partyText, type PartyContext } from '../../design/party';
import type { Overview } from '../vic-election/decoders';

/**
 * The state row's form in "Your representatives". A state lower house
 * dissolved for an election has no members until the result is declared
 * and loaded, so the row says a person is the member only when the data at
 * hand decides it. Everything here is read from data; no date is written
 * in the app.
 *
 * - `member`: the roster's member, drawn as any member. `until` is the
 *   instant the decision stops holding (the election record's caretaker
 *   date), or null when nothing ends it.
 * - `dissolved`: the house is dissolved for the election on `electionDay`.
 * - `neutral`: it cannot be decided on this device; the row states only
 *   what the roster recorded and when, and calls nobody the member.
 * - `held`: the election record is on its way; the row's place is held.
 */
export type StateForm =
  | { kind: 'member'; until: string | null }
  | { kind: 'dissolved'; electionDay: string }
  | { kind: 'neutral' }
  | { kind: 'held'; lines: readonly string[] | null };

/** A member with nothing to end it. */
const MEMBER: StateForm = { kind: 'member', until: null };

/** What the device keeps of the decision and the drawn lines (shape-store). */
export type KeptStateRow =
  | { kind: 'member'; until: string | null }
  | { kind: 'dissolved'; electionDay: string; lines: readonly string[] }
  | { kind: 'neutral'; lines: readonly string[] };

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
 * "Victoria · Legislative Assembly": the row's first line. The dot is bound
 * on both sides with no-break spaces, so it never ends a line or starts one
 * (at AX3 the line broke after "Victoria ·", then before "· Legislative").
 * The house's own words still break at their spaces: the line is whole, or
 * "Victoria · Legislative" over "Assembly".
 */
export function houseLine(
  seat: Pick<Electorate, 'chamber' | 'state_code'>,
): string {
  return `${jurisdictionName(seat.state_code) ?? seat.state_code.toUpperCase()}\u00a0·\u00a0${houseName(seat.chamber)}`;
}

type Person = {
  name: string;
  party: string | null;
  status: PartyContext['status'];
};
/** "Nina Taylor, Labor": the person and their party as the roster has it. */
function personWords(person: Person): string {
  const party = person.party
    ? partyText({ party: person.party, status: person.status }).visible
    : null;
  return [person.name, party].filter(Boolean).join(', ');
}

/**
 * Whether the electorates index holds the seat's result from that election:
 * the seat's `latest_election` is the election day or later. This is the
 * switch from the dissolved row to the new member's row. It is the date of
 * a result, not of a roster fetch, so reloading the old roster after
 * election day never draws a last member as sitting.
 */
export function resultLoaded(
  seat: Pick<Electorate, 'latest_election'>,
  electionDay: string,
): boolean {
  return (seat.latest_election ?? '').slice(0, 10) >= electionDay;
}

type RecordSeat = Pick<Electorate, 'url' | 'latest_election' | 'dissolved_for'>;

/**
 * What the electorates index itself says, when it carries the field: the
 * election day while the seat's house is dissolved, null once the
 * post-result roster is loaded. Undefined from an index that predates the
 * field, which says nothing either way.
 */
export function formFromIndex(
  seat: Pick<Electorate, 'dissolved_for'>,
): StateForm | undefined {
  if (seat.dissolved_for === undefined) return undefined;
  return seat.dissolved_for === null
    ? MEMBER
    : { kind: 'dissolved', electionDay: seat.dissolved_for.slice(0, 10) };
}

/** What the election record, at hand, decides for a seat. */
export function formFromRecord(
  seat: RecordSeat,
  overview: Pick<Overview, 'election_day' | 'key_dates' | 'districts'>,
  now: Date,
): StateForm {
  // Not one of the record's districts: the record says nothing against it.
  if (!overview.districts.some((d) => d.electorate_url === seat.url))
    return { kind: 'member', until: null };
  if (resultLoaded(seat, overview.election_day))
    return { kind: 'member', until: null };
  // The caretaker period begins when the Assembly is dissolved.
  const began = overview.key_dates.find((d) => d.id === 'caretaker')?.passes_at;
  if (!began) return { kind: 'neutral' };
  return now.getTime() >= Date.parse(began)
    ? { kind: 'dissolved', electionDay: overview.election_day }
    : { kind: 'member', until: began };
}

/**
 * The state row's form, decided without waiting where the device can:
 * - the electorates index answers when it carries `dissolved_for`, with no
 *   election record and no request at all;
 * - otherwise the election record, when it is at hand, answers;
 * - with none at hand, what the last launch kept answers while it still
 *   holds: a dissolved row until the seat's result is loaded, a member's
 *   row until its `until` instant;
 * - otherwise it cannot be decided: the row's place is held while the
 *   record is on its way, and the neutral row is drawn when it is not.
 */
export function stateForm(
  seat: RecordSeat,
  election: { overview: Overview | null; reading: boolean },
  now: Date,
  kept: KeptStateRow | null,
): StateForm {
  const indexed = formFromIndex(seat);
  if (indexed) return indexed;
  if (election.overview) return formFromRecord(seat, election.overview, now);
  if (kept?.kind === 'dissolved')
    return resultLoaded(seat, kept.electionDay)
      ? { kind: 'member', until: null }
      : { kind: 'dissolved', electionDay: kept.electionDay };
  if (
    kept?.kind === 'member' &&
    (kept.until === null || now.getTime() < Date.parse(kept.until))
  )
    return kept;
  return election.reading
    ? {
        kind: 'held',
        lines: kept && kept.kind !== 'member' ? kept.lines : null,
      }
    : { kind: 'neutral' };
}

/** The dissolved row's four lines. Nobody is called a current member. */
export function dissolvedLines(
  seat: Pick<Electorate, 'name' | 'chamber' | 'state_code'>,
  last: Person,
  electionDay: string,
): readonly string[] {
  return [
    houseLine(seat),
    seat.name,
    `Assembly dissolved for the ${electionDayWords(electionDay)} election`,
    `Last member: ${personWords(last)}`,
  ];
}

/**
 * The neutral row's three lines: the house, the district, and what the
 * roster recorded with its date. A dated record, never a claim that the
 * person is the member now.
 */
export function neutralLines(
  seat: Pick<
    Electorate,
    'name' | 'chamber' | 'state_code' | 'representation_as_of'
  >,
  recorded: Person,
): readonly string[] {
  const date = seat.representation_as_of
    ? formatDate(seat.representation_as_of, 'short')
    : null;
  return [
    houseLine(seat),
    seat.name,
    `${date ? `On the roster at ${date}` : 'On the roster'}: ${personWords(recorded)}`,
  ];
}

/**
 * The lines that hold a row's place before the device knows the real ones:
 * the longest district and member names in the roster, so the held row is
 * never shorter than the row that lands on it. Never drawn or spoken.
 */
export const DISSOLVED_STAND_IN: readonly string[] = [
  'Victoria\u00a0·\u00a0Legislative Assembly',
  'Narre Warren North',
  'Assembly dissolved for the 00 September election',
  'Last member: Kathleen Matthews-Ward, Independent',
];
export const NEUTRAL_STAND_IN: readonly string[] = [
  'Victoria\u00a0·\u00a0Legislative Assembly',
  'Narre Warren North',
  'On the roster at 00 Sep 0000: Kathleen Matthews-Ward, Independent',
];
