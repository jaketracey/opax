import type { Electorate, ElectorateDetail } from '../../api/catalogs';
import { nameKey } from '../../api/catalogs';
import { jurisdictionName } from '../../design/parliament';
import { thisDevice } from '../../design/device';
import type { Suggestion } from '../electorate-map/suggestion';
import type { StateSuggestion } from '../electorate-map/state-suggestion';

/**
 * The seat chooser's rules, as plain functions (specs/your-mp.md 4,
 * journeys/my-mp.md 3.3 and 8.2, journeys/first-launch.md 4.2 to 4.3).
 * Nothing here ranks by interest: results are a stated order (seat name
 * prefix, then any other match, each A to Z), browse lists are A to Z and
 * the states come in the AEC's population order.
 */
export const STATE_ORDER = [
  'nsw',
  'vic',
  'qld',
  'wa',
  'sa',
  'tas',
  'act',
  'nt',
] as const;
export type StateCode = (typeof STATE_ORDER)[number];
export const isStateCode = (code: string): code is StateCode =>
  (STATE_ORDER as readonly string[]).includes(code.toLowerCase());

/** The words the chooser draws, in one place. */
export const seatCopy = {
  title: 'Your electorate',
  placeholder: 'Electorate or member’s name',
  useLocation: 'Use my location',
  footnote: () =>
    `Your location is used once to find your electorate. Your choice is saved on this ${thisDevice()} only.`,
  browse: 'Browse by state',
  aec: 'Check your address with the AEC',
  noMatch: 'No matching electorate or member.',
  /** A typed postcode: say so plainly, never "no match" for a real place. */
  noPostcode: 'OPAX can’t look up postcodes yet.',
  /** Under a miss by name: suburbs and postcodes are not in the search. */
  noPlaces: 'Suburbs and postcodes can’t be looked up yet.',
  /** The ways on from a miss: the rows drawn straight after it. */
  noMatchNext:
    'Use your location, or check your address with the AEC to find your electorate’s name.',
  noMatchAec: 'Check your address with the AEC to find your electorate’s name.',
  /**
   * Why the welcome asks, saying first what an electorate is (newcomer
   * build, README 4.3), then the way on for a reader who doesn't know theirs.
   */
  why: 'Your electorate is the area you vote in. Find yours and OPAX will show you your MP: who they are, and how they vote.',
  whyHelp: 'Not sure of its name? Use your location and OPAX will find it.',
  /** Today's invitation: what an MP is, in one sentence (README 4.4). */
  invitation:
    'Your MP is the one person elected to speak for your area in Parliament. Find your electorate to meet them.',
  /** The welcome’s way on without a seat, in the list itself. */
  later: 'Choose later',
  laterNote: 'You can add your electorate any time from Today or Your MP.',
  finding: 'Finding your electorate…',
  stillFinding: 'Still finding your electorate…',
  fromLocation: 'From your location',
  nearLocation: 'Near your location',
  outside:
    'Your location isn’t inside a federal electorate. Search by name instead.',
  unavailable: 'Your location couldn’t be found. Search by name instead.',
  denied: 'Location access is off for OPAX.',
  approximate: 'Precise Location is off for OPAX.',
  openSettings: 'Open Settings',
  saved: 'Saved',
  remove: 'Remove electorate',
  noMember: 'No member recorded yet',
  loadFailed: 'Electorates couldn’t be loaded.',
  saveFailed: () =>
    `Your electorate couldn’t be saved on this ${thisDevice()}.`,
  partial: 'Some electorates couldn’t be read.',
  chooseHint: 'Chooses this electorate.',
} as const;

/** Digits only, as a postcode is typed: no electorate or member has any. */
export function looksLikePostcode(query: string): boolean {
  return /^\d{1,4}$/.test(query.trim());
}
/**
 * What a miss says (first-run drop-off, 12 Nov): a postcode gets its own
 * plain line, a name gets "No matching electorate or member." and the note
 * that places are not searched. Both end with the ways on, which are drawn
 * as rows straight after: the location row (the chooser only; Browse by
 * state has none) and the AEC's finder.
 */
export function noMatchCopy(
  query: string,
  { location = true }: { location?: boolean } = {},
): { title: string; help: string } {
  const next = location ? seatCopy.noMatchNext : seatCopy.noMatchAec;
  return looksLikePostcode(query)
    ? { title: seatCopy.noPostcode, help: next }
    : { title: seatCopy.noMatch, help: `${seatCopy.noPlaces} ${next}` };
}

/** "Based on the 2025 boundaries. Check it’s right." from the outlines' vintage. */
export function boundariesLine(vintage: string): string {
  const year = /\b(\d{4})\b/.exec(vintage)?.[1];
  return `Based on the ${year ?? vintage} boundaries. Check it’s right.`;
}
/** A saved seat that a redistribution removed (my-mp 8.2). */
export function abolishedLine(seat: string): string {
  return `${seat} is no longer an electorate.`;
}

const byName = (a: Electorate, b: Electorate) =>
  a.name.localeCompare(b.name, 'en-AU');

/** A current federal House seat: the only kind the chooser saves. */
export function isHouseSeat(seat: Electorate): boolean {
  return (
    seat.jurisdiction === 'federal' &&
    seat.chamber === 'representatives' &&
    seat.status !== 'historical'
  );
}
export function houseSeats(electorates: readonly Electorate[]): Electorate[] {
  return electorates.filter(isHouseSeat).sort(byName);
}
export function stateName(code: string): string {
  return jurisdictionName(code) ?? code.toUpperCase();
}
export interface BrowseState {
  code: StateCode;
  name: string;
  /** Counted from the directory at run time, never written by hand. */
  count: number;
}
export function browseStates(
  electorates: readonly Electorate[],
): BrowseState[] {
  const seats = houseSeats(electorates);
  return STATE_ORDER.map((code) => ({
    code,
    name: stateName(code),
    count: seats.filter((s) => s.state_code.toLowerCase() === code).length,
  })).filter((state) => state.count > 0);
}
export function seatsInState(
  electorates: readonly Electorate[],
  code: string,
): Electorate[] {
  return houseSeats(electorates).filter(
    (s) => s.state_code.toLowerCase() === code.toLowerCase(),
  );
}

const memberNames = (seat: Electorate) =>
  seat.representatives.map((r) => r.person.name);
/**
 * House seats matching a query on the seat's name or its member's name:
 * seats whose name starts with the query, then the other matches, each A
 * to Z. No cap: a seat and its member are one row.
 */
export function matchSeats(
  seats: readonly Electorate[],
  query: string,
): Electorate[] {
  return matchIn(seats.filter(isHouseSeat), query);
}
/** The same order over any list (the Victorian scope's two groups). */
export function matchIn(
  seats: readonly Electorate[],
  query: string,
): Electorate[] {
  const q = nameKey(query.trim());
  if (!q) return [];
  const prefix: Electorate[] = [];
  const other: Electorate[] = [];
  for (const seat of seats) {
    const name = nameKey(seat.name);
    if (name.startsWith(q)) prefix.push(seat);
    else if (
      name.includes(q) ||
      [...memberNames(seat), ...(seat.aliases ?? [])].some((n) =>
        nameKey(n).includes(q),
      )
    )
      other.push(seat);
  }
  return [...prefix.sort(byName), ...other.sort(byName)];
}

/**
 * The Victorian scope (`/seat?scope=vic`, specs/your-mp.md 4.5, my-mp 3.3
 * item 5): Assembly districts and Council regions, each A to Z. Choosing a
 * district also sets its region, from the district's `within_upper_house`
 * relation, so one choice gives both.
 */
export const vicCopy = {
  title: 'Victorian electorate',
  placeholder: 'District, region or member’s name',
  districts: 'Legislative Assembly districts',
  regions: 'Legislative Council regions',
  outside:
    'Your location isn’t inside a Victorian district. Search by name instead.',
} as const;
const victorian = (chamber: string) => (electorates: readonly Electorate[]) =>
  electorates
    .filter(
      (s) =>
        s.jurisdiction === 'vic' &&
        s.chamber === chamber &&
        s.status !== 'historical',
    )
    .sort(byName);
export const vicDistricts = victorian('vic_la');
export const vicRegions = victorian('vic_lc');
/** The Council region a district sits within, if the release records one. */
export function regionOf(
  detail: Pick<ElectorateDetail, 'relations'>,
  electorates: readonly Electorate[],
): Electorate | null {
  const id = detail.relations.find(
    (r) => r.kind === 'within_upper_house',
  )?.related_id;
  return (
    (id && vicRegions(electorates).find((s) => s.electorate_id === id)) || null
  );
}

/**
 * A senator or a Victorian member matched by name. These are not House
 * members, so the row cannot be chosen: it leads to Browse by state for
 * their state instead of failing (my-mp 3.3 item 2, 8.2).
 */
export interface PersonLead {
  key: string;
  slug: string;
  name: string;
  party: string | null;
  detail: string;
  line: string;
  state: StateCode;
}
const slugOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’‘ʼ`.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
export function matchLeads(
  electorates: readonly Electorate[],
  query: string,
  limit = 8,
): PersonLead[] {
  const q = nameKey(query.trim());
  if (!q) return [];
  const house = new Set(
    electorates
      .filter(isHouseSeat)
      .flatMap((s) => s.representatives.map((r) => r.person_id)),
  );
  const leads = new Map<string, PersonLead>();
  for (const seat of electorates) {
    if (seat.status === 'historical') continue;
    const code = seat.state_code.toLowerCase();
    if (!isStateCode(code)) continue;
    const senate = seat.jurisdiction === 'federal' && seat.chamber === 'senate';
    const victorian = seat.jurisdiction === 'vic';
    if (!senate && !victorian) continue;
    for (const r of seat.representatives) {
      if (house.has(r.person_id) || leads.has(r.person_id)) continue;
      if (
        ![r.person.name, ...r.person.aliases].some((n) =>
          nameKey(n).includes(q),
        )
      )
        continue;
      const state = stateName(code);
      leads.set(r.person_id, {
        key: r.person_id,
        slug: slugOf(r.person.name),
        name: r.person.name,
        party: r.party,
        detail: senate
          ? `Senator for ${state}`
          : `Member for ${seat.name}, Victorian Parliament`,
        line: `Choose your electorate in ${state}`,
        state: code,
      });
    }
  }
  return [...leads.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'en-AU'))
    .slice(0, limit);
}

/** The seat's member for its row, or null for a seat with none recorded. */
export function seatMember(
  seat: Electorate,
): { name: string; party: string | null } | null {
  const r = seat.representatives[0];
  return r ? { name: r.person.name, party: r.party } : null;
}
/** VoiceOver: "Grayndler. Anthony Albanese, Labor." */
export function seatLabel(seat: Electorate, extra?: string): string {
  const member = seatMember(seat);
  return [
    `${seat.name}.`,
    member
      ? `${[member.name, member.party].filter(Boolean).join(', ')}.`
      : `${seatCopy.noMember}.`,
    extra ? `${extra}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** What the location row shows after a locate (first-launch 4.3). */
export type LocationAnswer =
  | { kind: 'idle' }
  | { kind: 'finding'; slow: boolean }
  | { kind: 'found'; seats: Electorate[]; near: boolean; vintage: string }
  | { kind: 'approximate'; seats: Electorate[]; vintage: string }
  | { kind: 'message'; text: string; settings: boolean };
/**
 * One locate's outcome as the row draws it. A locate the reader stopped
 * (typing, Browse, a second tap) returns to Idle silently, never "couldn’t
 * be found".
 */
export function locationAnswer(
  result: Suggestion | StateSuggestion,
  cancelled: boolean,
  scope: 'federal' | 'vic' = 'federal',
): LocationAnswer {
  if (cancelled) return { kind: 'idle' };
  switch (result.kind) {
    case 'suggested':
      return {
        kind: 'found',
        seats: [result.seat],
        near: false,
        vintage: result.vintage,
      };
    case 'border':
      return result.seats.length
        ? {
            kind: 'found',
            seats: result.seats,
            near: true,
            vintage: result.vintage,
          }
        : { kind: 'message', text: seatCopy.unavailable, settings: false };
    case 'approximate':
      return {
        kind: 'approximate',
        seats: result.seats,
        vintage: result.vintage,
      };
    case 'denied':
      return { kind: 'message', text: seatCopy.denied, settings: true };
    case 'no-match':
      return {
        kind: 'message',
        // The Victorian chooser looks for a district, not a federal seat.
        text: scope === 'vic' ? vicCopy.outside : seatCopy.outside,
        settings: false,
      };
    default:
      return { kind: 'message', text: seatCopy.unavailable, settings: false };
  }
}
