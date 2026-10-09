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
import { nameKey } from '../../api/ids';
import type { PartyStatus } from '../../api/party-transforms';
import { jurisdictionName } from '../../design/parliament';
import { samePartyLabel } from '../../design/party';

// Honorifics before a name, post-nominals and generations after it: the
// register prints "Sen Mehreen", "KATTER, Bob, Jnr, MP", "the Hon. Tony".
const LEADING = new Set(
  'the hon senator sen dr mr mrs ms miss prof professor sir dame'.split(' '),
);
const TRAILING = new Set(
  'mp mhr mlc mla am ao ac oam qc sc kc jnr jr snr sr'.split(' '),
);
const GENERATION = new Set(['jnr', 'snr']);

/**
 * A name as a matching key: "SURNAME, Given, Jnr, MP" read as "Given
 * Surname", titles and post-nominals dropped, then `nameKey` folding
 * (diacritics, case, curly and straight apostrophes, full stops, hyphens and
 * runs of space). The key only finds candidates; it never names anyone.
 */
export function sponsorKey(name: string) {
  const parts = name.split(',').map((part) => part.trim());
  const titled = (part: string) =>
    nameKey(part)
      .split(' ')
      .every((w) => LEADING.has(w) || TRAILING.has(w));
  const ordered =
    parts.length > 1 && parts[0] && parts[1]
      ? [...parts.slice(1).filter((part) => !titled(part)), parts[0]].join(' ')
      : name;
  const words = nameKey(ordered).split(' ').filter(Boolean);
  while (words.length > 1 && LEADING.has(words[0]!)) words.shift();
  while (words.length > 1 && TRAILING.has(words[words.length - 1]!))
    words.pop();
  return words.filter((w, i) => i === 0 || !GENERATION.has(w)).join(' ');
}

/**
 * The same person's name on two records: one surname, and a first name that
 * is the other's or a prefix of it either way (Chris, Christopher), or
 * initials that agree. scripts/roster_identity.py agrees() is the original.
 * Only ever used on a row the bill's person ID already names.
 */
export function namesAgree(a: string, b: string) {
  const n = sponsorKey(a).split(' ').filter(Boolean);
  const o = sponsorKey(b).split(' ').filter(Boolean);
  if (!n.length || !o.length || n[n.length - 1] !== o[o.length - 1])
    return false;
  let tail = 1;
  while (
    tail < n.length &&
    tail < o.length &&
    n[n.length - 1 - tail] === o[o.length - 1 - tail]
  )
    tail++;
  const given = n.slice(0, -tail);
  const owner = o.slice(0, -tail);
  // The same words: agreed. A printed name with no first name left: not.
  if (!given.length) return !owner.length;
  if (!owner.length) return false;
  if (given.every((t) => t.length === 1)) {
    const x = given.join('');
    const y = owner.map((t) => t[0]).join('');
    return x.startsWith(y) || y.startsWith(x);
  }
  const first = given[0]!;
  return owner.some(
    (t) =>
      t === first ||
      (Math.min(t.length, first.length) >= 3 &&
        (t.startsWith(first) || first.startsWith(t))),
  );
}

/** The names a roster row answers to: its name and its recorded full name. */
const namesOf = (row: RosterRow) =>
  [row.name, row.full].filter((n): n is string => !!n?.trim());
type RosterRow = Roster['people'][number];
const fullName = (row: RosterRow) => row.name.trim().includes(' ');

/**
 * The profile a bill's sponsor opens, or null. Native pages are for roster
 * parliamentarians only (decision 3), and a link must never point at someone
 * other than the person named on screen.
 *
 * With the bill's roster ID, the ID decides who it is: a full-name roster row
 * holding that ID whose name agrees with the printed one (same surname, first
 * name or its short form). Where only a surname row holds the ID, its recorded
 * full name must be the printed name, and the link goes to the full-name row
 * of that name, never to the surname row. A full-name row of the printed name
 * holding another ID contradicts the bill: plain text.
 *
 * Without an ID the printed name has to name exactly one full-name roster
 * person. Surname-only rows never link on a name.
 *
 * The person must then resolve to exactly one directory slug. Any
 * contradiction or ambiguity: plain text.
 */
export function sponsorSlug(
  name: string,
  roster: Roster,
  slugs: Slugs,
  id?: RosterId | null,
): PersonSlug | null {
  const wanted = sponsorKey(name);
  if (!wanted.includes(' ')) return null;
  const named = roster.people.filter(
    (row) =>
      fullName(row) && namesOf(row).some((n) => sponsorKey(n) === wanted),
  );
  let people: RosterRow[];
  if (id) {
    if (named.some((row) => row.pid && row.pid !== id)) return null;
    const holders = roster.people.filter(
      (row) =>
        row.pid === id &&
        fullName(row) &&
        namesOf(row).some((n) => namesAgree(name, n)),
    );
    const exact = holders.filter((row) => named.includes(row));
    // A surname row (a committee print, "Faruqi") that holds the ID vouches
    // for the full-name row of its recorded full name; it is never linked.
    const vouched = roster.people.some(
      (row) =>
        row.pid === id && !!row.full && sponsorKey(row.full) === wanted,
    );
    people = exact.length
      ? exact
      : holders.length
        ? holders
        : vouched
          ? named
          : [];
  } else {
    // Rows without an ID cannot be told apart, so each counts as its own person.
    const ids = new Set(named.map((row, i) => row.pid ?? `row-${i}`));
    people = ids.size === 1 ? named : [];
  }
  const pages = (row: RosterRow) =>
    Object.keys(slugs.slugs).filter(
      (slug) => nameKey(slugs.slugs[slug]!) === nameKey(row.name),
    );
  const found = new Set(people.flatMap(pages));
  if (found.size === 1) return personSlug([...found][0]!);
  // Spellings of the ID's own person with pages of their own: the
  // most-recorded spelling's page.
  if (!id || found.size < 2) return null;
  const top = [...people].sort(
    (a, b) => (b.speeches ?? 0) - (a.speeches ?? 0),
  )[0]!;
  const page = pages(top);
  return page.length === 1 ? personSlug(page[0]!) : null;
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
      // The joined profile must still be the person the bill names: with the
      // bill's ID, the profile has to carry it.
      const ids = [profile?.rosterPersonId, profile?.legacyPersonId].filter(
        Boolean,
      ) as string[];
      if (profile && id && !ids.includes(id)) profile = null;
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
    // A register print the parser could not read ("KATTER, Bob, Jnr, MP")
    // reads as the profile's name once the row is that person's.
    const printed = member.name.includes(',') ? profile.name : member.name;
    return {
      name: place ? printed : label,
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
