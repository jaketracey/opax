import { associatedLine, donorAssociatedTo } from './associated';
import type {
  BillDetail,
  BillIndex,
  Manifest,
  Money,
  PeopleCatalog,
  Roster,
  Slugs,
  Votes,
} from './catalog-decoders';
import {
  joinPerson,
  rosterChambersFor,
  type PersonProfile,
} from './person-identity';
import { memberSlugFor } from './catalog-search';
import {
  billDedupeDivisions,
  billName,
  billQuestionParts,
} from './bill-transforms';
import {
  formerPartyName,
  isPartyLabel,
  partyRename,
  samePartyLabel,
} from '../design/party';
import { nameKey } from './ids';
export { resolveParty } from '../design/party';

// Codes in the parliamentary roster, expanded for membership comparisons.
const partyNames: Record<string, string> = {
  lnp: 'Liberal National Party of Queensland',
  jln: 'Jacqui Lambie Network',
  dlp: 'Democratic Labour Party',
  kap: 'Katter’s Australian Party',
  uap: 'United Australia Party',
  clp: 'Country Liberal Party',
  alp: 'Australian Labor Party',
  ind: 'Independent',
};
/** A party's full name where the register writes a code ("LNP"). */
export function partyName(label: string): string {
  const name = label.trim();
  return partyNames[name.toLowerCase()] ?? name;
}
export const sameMemberParty = (a: string, b: string) =>
  samePartyLabel(partyName(a), partyName(b)) ||
  nameKey(partyName(a)) === nameKey(partyName(b));

export function partyLabels(
  roster: Roster,
  people: PeopleCatalog,
  money?: Money,
) {
  return [
    ...new Set(
      [
        ...(money?.nodes
          .filter((n) => n.kind === 'party')
          .flatMap((n) => [n.label, ...(n.aliases ?? [])]) ?? []),
        ...people.people.flatMap((p) => p.electorates.map((s) => s.party)),
        ...roster.people.flatMap((p) => [p.party_now, p.party]),
      ].filter((p): p is string => isPartyLabel(p)),
    ),
  ];
}
export function partyMembers(
  label: string,
  roster: Roster,
  people: PeopleCatalog,
  slugs: Slugs,
  manifest: Manifest,
) {
  const sitting = sittingPartyMembers(roster, people, slugs, manifest, label);
  const current: PartyMember[] = sitting.flatMap((p) =>
    p.seats.map((s) => ({
      name: s.name,
      slug: s.slug,
      jurisdiction: s.jurisdiction,
      chamber: s.chamber,
      place: s.place,
      asAt: s.asAt,
      ...recordedAs(s.party),
    })),
  );
  const recorded: PartyMember[] = [];
  const sources = new Map<string, Manifest['sources'][number]>();
  for (const { profile } of sitting)
    for (const source of profile.sources) sources.set(source.source_id, source);
  const currentNames = new Set(
    people.people
      .filter((p) => p.electorates.some((s) => s.current))
      .flatMap((p) => [p.name, ...p.aliases])
      .map(nameKey),
  );
  const seatKey = (jurisdiction: string, chamber: string, place: string) =>
    `${jurisdiction}|${chamber}|${nameKey(place)}`;
  const currentSeats = new Set(
    people.people.flatMap((p) =>
      p.electorates
        .filter((s) => s.current && s.name)
        .map((s) => seatKey(s.jurisdiction, s.chamber, s.name)),
    ),
  );
  for (const row of roster.people.filter(
    (r) => r.current === true && r.party_now,
  )) {
    currentNames.add(nameKey(row.name));
    for (const seat of row.representation ?? [])
      if (
        seat.jurisdiction === 'federal' &&
        ['representatives', 'senate'].includes(seat.chamber) &&
        seat.electorate
      )
        currentSeats.add(
          seatKey(seat.jurisdiction, seat.chamber, seat.electorate),
        );
  }
  for (const p of partyMemberProfiles(roster, people, slugs, manifest)) {
    if (p.partyStatus !== 'unknown') continue;
    if (p.party && samePartyLabel(p.party, label)) {
      // A recorded seat now held by someone else rules out only its own
      // parliament and chamber: a former federal MP can sit in a state house
      // whose seats carry no dated data (Janelle Saffin: Page, then Lismore).
      const houses = new Map<string, boolean>();
      for (const r of p.rosterRow?.representation ?? []) {
        const house = `${r.jurisdiction}|${r.chamber}`;
        houses.set(
          house,
          (houses.get(house) ?? false) ||
            (!!r.electorate &&
              currentSeats.has(
                seatKey(r.jurisdiction, r.chamber, r.electorate),
              )),
        );
      }
      if (
        !p.name.trim().includes(' ') ||
        currentNames.has(nameKey(p.name)) ||
        (houses.size > 0 && [...houses.values()].every(Boolean))
      )
        continue;
      recorded.push({
        name: p.name,
        slug: p.slug,
        // Undated roster places can mix state and federal records. Show the
        // recorded name without assigning unverified representation.
        jurisdiction: '',
        chamber: '',
        place: '',
        asAt: roster.meta.generated,
        ...recordedAs(p.party),
      });
      for (const source of p.sources) sources.set(source.source_id, source);
    }
  }
  const order = (a: PartyMember, b: PartyMember) =>
    `${a.jurisdiction}|${a.chamber}|${a.name}`.localeCompare(
      `${b.jurisdiction}|${b.chamber}|${b.name}`,
      'en-AU',
    );
  return {
    current: current.sort(order),
    recorded: recorded.sort(order),
    currentCount: sitting.length,
    sources: [...sources.values()],
  };
}

function* partyMemberProfiles(
  roster: Roster,
  people: PeopleCatalog,
  slugs: Slugs,
  manifest: Manifest,
): Generator<PersonProfile> {
  const seen = new Set<string>();
  // Full-name profiles precede surname stubs for the same canonical ID.
  const orderedSlugs = Object.keys(slugs.slugs).sort(
    (a, b) =>
      Number(slugs.slugs[b]!.includes(' ')) -
      Number(slugs.slugs[a]!.includes(' ')),
  );
  for (const slug of orderedSlugs) {
    if (
      !memberSlugFor(
        {
          kind: 'person',
          title: slugs.slugs[slug]!,
          href: `/subject/person/${slug}`,
          slug,
          snippet: '',
          resource: '',
        },
        { roster, people, slugs, manifest },
      )
    )
      continue;
    let p;
    try {
      p = joinPerson(slug, slugs, roster, people, manifest);
    } catch {
      continue;
    }
    const id = p.canonicalPersonId ?? p.rosterPersonId ?? p.name;
    if (seen.has(id)) continue;
    seen.add(id);
    if (
      !p.canonicalPersonId &&
      !rosterChambersFor(p.rosterRow).length &&
      !p.rosterRow?.representation?.length
    )
      continue;
    yield p;
  }
}

/** Unique sitting people and their current federal, state and territory affiliations. */
export function sittingPartyMembers(
  roster: Roster,
  people: PeopleCatalog,
  slugs: Slugs,
  manifest: Manifest,
  label?: string,
) {
  const members: {
    profile: PersonProfile;
    seats: (PartyMember & { party: string })[];
  }[] = [];
  for (const p of partyMemberProfiles(roster, people, slugs, manifest)) {
    if (p.partyStatus !== 'current') continue;
    const seats: (PartyMember & { party: string })[] = [];
    // A current seat establishes only its own affiliation. The APH current
    // flag establishes a federal affiliation only when party_now names it.
    if (p.seats.length) {
      for (const s of p.seats)
        if (s.party && (!label || sameMemberParty(s.party, label)))
          seats.push({
            name: p.name,
            slug: p.slug,
            party: s.party,
            jurisdiction: s.jurisdiction,
            chamber: s.chamber,
            place: s.name,
            asAt: s.as_of,
          });
    } else if (
      p.rosterRow?.current === true &&
      p.rosterRow.party_now &&
      (!label || sameMemberParty(p.rosterRow.party_now, label))
    ) {
      const chambers = rosterChambersFor(p.rosterRow).filter((c) =>
        ['representatives', 'senate'].includes(c),
      );
      for (const chamber of chambers)
        seats.push({
          name: p.name,
          slug: p.slug,
          party: p.rosterRow.party_now,
          jurisdiction: 'federal',
          chamber,
          place:
            p.rosterRow.representation?.find(
              (r) => r.jurisdiction === 'federal' && r.chamber === chamber,
            )?.electorate ?? '',
          asAt: roster.meta.generated,
        });
    }
    if (seats.length) members.push({ profile: p, seats });
  }
  return members;
}
export interface PartyMember {
  name: string;
  slug: string;
  jurisdiction: string;
  chamber: string;
  place: string;
  asAt: string | null;
  /** The label the record carries, when it is a former name of the party. */
  recordedAs?: string;
}
/** The record's former party name, as recorded, for a "Recorded as" line. */
const recordedAs = (party: string | null | undefined) => {
  const former = formerPartyName(party);
  return former ? { recordedAs: former } : {};
};

/** A past member from the voting record, under a former name of the party. */
export interface PartyPastMember {
  name: string;
  /** Their profile's slug, or null when OPAX holds no profile for them. */
  slug: string | null;
  jurisdiction: string;
  house: string;
  /** First and last year of their recorded votes. */
  years: readonly number[];
  recordedAs: string;
}
/**
 * Past members of a renamed party, from the voting record: everyone whose
 * record carries one of its former names ("Liberal Democratic Party"). Only
 * renamed parties list them: past members keep the label they sat under,
 * and the party page otherwise excludes former members. People the members
 * list already shows are left out.
 */
export function partyPastMembers(
  label: string,
  votes: Votes,
  slugs: Slugs,
  shown: readonly { name: string }[] = [],
): PartyPastMember[] {
  const rename = partyRename(label);
  if (!rename) return [];
  const seen = new Set(shown.map((m) => nameKey(m.name)));
  const slugByName = new Map(
    Object.entries(slugs.slugs).map(([slug, name]) => [nameKey(name), slug]),
  );
  const rows: PartyPastMember[] = [];
  for (const record of Object.values(votes.records)) {
    const former = formerPartyName(record.party);
    if (!former || partyRename(former) !== rename) continue;
    const key = nameKey(record.name);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      name: record.name,
      slug: slugByName.get(key) ?? null,
      jurisdiction: record.jurisdiction,
      house: record.house,
      years: record.years,
      recordedAs: former,
    });
  }
  return rows.sort(
    (a, b) =>
      (a.years[0] ?? 0) - (b.years[0] ?? 0) ||
      a.name.localeCompare(b.name, 'en-AU'),
  );
}
export function partyMoney(label: string, graph: Money) {
  const parties = graph.nodes
    .filter((n) => n.kind === 'party' && !n.via)
    .sort((a, b) => b.total - a.total);
  const node = parties.find(
    (n) =>
      samePartyLabel(n.label, label) ||
      n.aliases?.some((a) => samePartyLabel(a, label)),
  );
  if (!node) return null;
  const donors = new Map(
    graph.nodes.filter((n) => n.kind === 'donor').map((n) => [n.id, n]),
  );
  const flows = graph.edges.filter(
    (e) => e.target === node.id && donors.has(e.source),
  );
  const donorRows = (year?: string) => {
    const sums = new Map<string, number>();
    for (const e of flows)
      sums.set(
        e.source,
        (sums.get(e.source) ?? 0) +
          (year ? (e.byYear[year]?.[0] ?? 0) : e.total),
      );
    // Every donor by the name its graph gives it, as the web's party page.
    return [...sums]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, amount]) => ({
        id,
        name: donors.get(id)!.label,
        amount,
        associated: associatedLine(
          donorAssociatedTo(donors.get(id)!, node.label),
        ),
      }));
  };
  return {
    node,
    /** The register's own label, when it is a former name of the party. */
    recordedAs: formerPartyName(node.label),
    rank: parties.findIndex((n) => n.id === node.id) + 1,
    parties: parties.length,
    donors: donorRows(),
    byYear: Object.keys(node.byYear)
      .sort((a, b) => b.localeCompare(a))
      .map((year) => ({ year, donors: donorRows(year) })),
  };
}
export const recentPartyBills = (index: BillIndex) =>
  index.bills
    .filter((b) => b.divisions > 0)
    .sort((a, b) =>
      (b.status_as_of ?? b.introduced ?? '').localeCompare(
        a.status_as_of ?? a.introduced ?? '',
      ),
    )
    .slice(0, 96);
export function partyDivisions(label: string, bills: BillDetail[]) {
  return bills
    .flatMap((bill) =>
      billDedupeDivisions(bill.divisions, bill).divisions.flatMap(
        (division) => {
          const [party, split] =
            Object.entries(division.party_splits).find(([party]) =>
              samePartyLabel(party, label),
            ) ?? [];
          return split && (split.ayes || split.noes)
            ? [
                {
                  billKey: bill.key,
                  title: billName(bill),
                  division,
                  question: billQuestionParts(division, bill).head,
                  ...split,
                  // The division's own label, when it is a former name.
                  recordedAs: formerPartyName(party),
                },
              ]
            : [];
        },
      ),
    )
    .sort((a, b) => b.division.date.localeCompare(a.division.date));
}
export const partyPageCopy = {
  aec: 'AEC disclosure data: donations under the disclosure threshold are not reported and cannot appear here, so totals are a floor, not a ceiling.',
};
