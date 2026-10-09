import {
  joinPerson,
  personSlug,
  type ElectorateIndex,
  type Manifest,
  type PeopleCatalog,
  type PersonProfile,
  type PersonSlug,
  type Roster,
  type RosterId,
  type SeatObservation,
  type Slugs,
} from '../../api/catalogs';
import type { PartyStatus } from '../../api/party-transforms';
import { jurisdictionName } from '../../design/parliament';
import { samePartyLabel } from '../../design/party';

const folded = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[’‘ʼ`']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The names a roster row answers to: its name and its recorded full name. */
const namesOf = (row: RosterRow) =>
  [row.name, row.full].filter((n): n is string => !!n?.trim());
type RosterRow = Roster['people'][number];

/**
 * The profile a bill's sponsor opens, or null. Native pages are for roster
 * parliamentarians only (decision 3), and a link must never point at someone
 * other than the person named on screen. So the displayed name has to name
 * exactly one full-name roster person; when the bill also carries a roster ID,
 * that ID has to identify the same person (by name or recorded full name) and
 * no other roster person may share the name. That person must then resolve to
 * exactly one directory slug. Any contradiction or ambiguity: plain text.
 */
export function sponsorSlug(
  name: string,
  roster: Roster,
  slugs: Slugs,
  id?: RosterId | null,
): PersonSlug | null {
  const wanted = folded(name);
  if (!name.trim().includes(' ')) return null;
  const full = (row: RosterRow) => row.name.trim().includes(' ');
  const named = roster.people.filter(
    (row) => full(row) && namesOf(row).some((n) => folded(n) === wanted),
  );
  // Rows without an ID cannot be told apart, so each counts as its own person.
  const people = new Set(named.map((row, i) => row.pid ?? `row-${i}`));
  let person: RosterRow | undefined;
  if (id) {
    if (named.some((row) => row.pid !== id)) return null;
    person = roster.people.find(
      (row) =>
        row.pid === id &&
        full(row) &&
        namesOf(row).some((n) => folded(n) === wanted),
    );
  } else if (people.size === 1) person = named[0];
  if (!person) return null;
  const matches = Object.entries(slugs.slugs).filter(
    ([, n]) => folded(n) === folded(person.name),
  );
  return matches.length === 1 ? personSlug(matches[0]![0]) : null;
}

export interface SponsorDirectory {
  roster: Roster;
  slugs: Slugs;
  people: PeopleCatalog;
  manifest: Manifest;
  electorates: ElectorateIndex;
}
/** One sponsor as a people row. A null slug is a plain row, never a link. */
export interface SponsorRow {
  name: string;
  slug: PersonSlug | null;
  /** Absent when neither the bill nor a joined profile records a party. */
  party?: {
    party: string | null;
    status: PartyStatus;
    formerly: string | null;
  };
  place?: string;
}
type Member = { name: string; suffix: string };

// The register writes "xx" where it has no party for the sponsor.
const billParty = (party: string | null) =>
  party?.trim() && !/^x+$/i.test(party.trim()) ? party.trim() : null;

function placeOf(seat: SeatObservation, electorates: ElectorateIndex) {
  const state =
    seat.jurisdiction === 'federal'
      ? electorates.electorates.find(
          (e) => e.electorate_id === seat.electorate_id,
        )?.state_code
      : seat.jurisdiction;
  const where = jurisdictionName(state ?? null);
  if (seat.chamber === 'senate')
    return where && where !== seat.name
      ? `senator for ${seat.name} · ${where}`
      : `senator for ${seat.name}`;
  return where
    ? `member for ${seat.name} · ${where}`
    : `member for ${seat.name}`;
}
const upper = (line: string) => line[0]!.toUpperCase() + line.slice(1);

/**
 * The seat line: a current dated seat, or, for a member the data dates as
 * former, the last ended seat on the same joined release person. The roster's
 * undated representation is never used. Undated identities get no place line.
 */
function sponsorPlace(profile: PersonProfile, directory: SponsorDirectory) {
  const current = profile.seats.find((s) => s.current);
  if (current) return upper(placeOf(current, directory.electorates));
  if (profile.partyStatus !== 'former' || !profile.canonicalPersonId)
    return undefined;
  const ended = (seat: SeatObservation) =>
    seat.periods?.reduce<string>(
      (last, period) => (period.end && period.end > last ? period.end : last),
      '',
    ) ||
    seat.as_of ||
    '';
  const last = directory.people.people
    .find((p) => p.person_id === profile.canonicalPersonId)
    ?.electorates.filter((s) => !s.current)
    .sort((a, b) => ended(b).localeCompare(ended(a)))[0];
  return last ? `Formerly ${placeOf(last, directory.electorates)}` : undefined;
}

/**
 * The bill's sponsors as people rows. Identity is the seats-first profile join
 * behind a full-name `sponsorSlug` match, never a surname. The party is the
 * one the bill records for its sponsor, as at the bill: where the profile now
 * records another party, the bill's party is shown undated, still marked
 * "Formerly" for a member the data dates as former. A one-party bill record
 * speaks for its sole sponsor only.
 */
export function sponsorRows(
  members: readonly Member[],
  sponsorParty: string | null,
  sponsorPersonId: RosterId | null | undefined,
  directory: SponsorDirectory | null,
): SponsorRow[] {
  const recorded = members.length === 1 ? billParty(sponsorParty) : null;
  return members.map((member) => {
    const label = member.suffix
      ? `${member.name} ${member.suffix}`
      : member.name;
    let profile: PersonProfile | null = null;
    const id = members.length === 1 ? sponsorPersonId : null;
    const slug = directory
      ? sponsorSlug(member.name, directory.roster, directory.slugs, id)
      : null;
    if (slug && directory) {
      try {
        profile = joinPerson(
          slug,
          directory.slugs,
          directory.roster,
          directory.people,
          directory.manifest,
        );
      } catch {
        profile = null;
      }
      // The joined profile must still be the person the bill names.
      const ids = [profile?.rosterPersonId, profile?.legacyPersonId].filter(
        Boolean,
      ) as string[];
      if (profile && id && ids.length && !ids.includes(id)) profile = null;
    }
    if (!profile)
      return {
        name: label,
        slug: null,
        party: recorded
          ? { party: recorded, status: 'unknown', formerly: null }
          : undefined,
      };
    const differs =
      !!recorded && !(profile.party && samePartyLabel(recorded, profile.party));
    const former = profile.partyStatus === 'former';
    const place = sponsorPlace(profile, directory!);
    return {
      name: place ? member.name : label,
      slug: profile.slug,
      party: differs
        ? {
            party: recorded,
            status: former ? 'former' : 'unknown',
            formerly: null,
          }
        : {
            party: recorded ?? profile.party,
            status: profile.partyStatus,
            formerly: profile.formerly,
          },
      place,
    };
  });
}
