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
import { personPartyFor } from './party-transforms';
import { formatMoney } from '../design/format';
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
        ...roster.people.flatMap((p) => [
          p.party_now,
          p.party,
          ...(p.parties ?? []),
          ...(p.affiliations ?? []).map((a) => a.party),
        ]),
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
    const service = p.rosterRow?.affiliations?.filter((a) =>
      sameMemberParty(a.party, label),
    );
    if (service?.length && service.every((a) => !!a.end)) continue;
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

/** Party-specific service from the roster, kept separate from voting years. */
export type PartyService = NonNullable<
  Roster['people'][number]['affiliations']
>[number];
export interface PartyPastMember {
  personId: string;
  name: string;
  /** Their profile's slug, or null when OPAX holds no profile for them. */
  slug: string | null;
  jurisdiction: string;
  house: string;
  /** First and last year of their recorded votes, not party service dates. */
  years: readonly number[];
  periods?: PartyService[];
  recordedAs: string;
}
/**
 * One row per person across voting records and every roster party. An ended
 * affiliation or confirmed former status establishes past membership. Missing
 * roster records retain the voting-record fallback; undated roster labels do
 * not establish that a person left. Current membership is computed separately.
 */
export function partyPastMembers(
  label: string,
  votes: Votes,
  slugs: Slugs,
  shown: readonly { name: string; slug?: string }[] = [],
  roster?: Roster,
  people?: PeopleCatalog,
): PartyPastMember[] {
  type Person = PeopleCatalog['people'][number];
  type Row = Roster['people'][number];
  const peopleById = new Map(
    (people?.people ?? []).map((p) => [String(p.person_id), p]),
  );
  const peopleByLegacy = new Map(
    (people?.people ?? []).flatMap((p) =>
      p.legacy_person_id ? [[String(p.legacy_person_id), p] as const] : [],
    ),
  );
  const peopleByName = new Map<string, Set<Person>>();
  for (const p of people?.people ?? [])
    for (const n of [p.name, ...p.aliases]) {
      const matches = peopleByName.get(nameKey(n)) ?? new Set<Person>();
      matches.add(p);
      peopleByName.set(nameKey(n), matches);
    }
  const uniquePerson = (names: string[]) => {
    const matches = new Set(
      names.flatMap((n) => [...(peopleByName.get(nameKey(n)) ?? [])]),
    );
    return matches.size === 1 ? [...matches][0] : undefined;
  };
  const canonicalFor = (r: Row) => {
    const direct = r.pid ? peopleByLegacy.get(r.pid) : undefined;
    if (direct) return direct;
    const named = uniquePerson([r.name, ...(r.full ? [r.full] : [])]);
    return r.pid && named?.legacy_person_id && named.legacy_person_id !== r.pid
      ? undefined
      : named;
  };
  const idFor = (r: Row) =>
    canonicalFor(r)?.person_id ??
    (r.pid ? `roster:${r.pid}` : `name:${nameKey(r.full || r.name)}`);
  const groups = new Map<string, Row[]>();
  const idsByName = new Map<string, Set<string>>();
  const idsByLegacy = new Map<string, string>();
  for (const r of roster?.people ?? []) {
    const id = idFor(r);
    groups.set(id, [...(groups.get(id) ?? []), r]);
    if (r.pid) idsByLegacy.set(r.pid, id);
    for (const n of [r.name, ...(r.full ? [r.full] : [])]) {
      const ids = idsByName.get(nameKey(n)) ?? new Set<string>();
      ids.add(id);
      idsByName.set(nameKey(n), ids);
    }
  }
  const idByName = (name: string) => {
    const ids = idsByName.get(nameKey(name));
    return ids?.size === 1 ? [...ids][0] : undefined;
  };
  const hidden = new Set(
    shown.map(
      (m) =>
        idByName(m.name) ??
        uniquePerson([m.name])?.person_id ??
        `name:${nameKey(m.name)}`,
    ),
  );
  const hiddenSlugs = new Set(shown.flatMap((m) => (m.slug ? [m.slug] : [])));
  const slugByName = new Map(
    Object.entries(slugs.slugs).map(([slug, name]) => [nameKey(name), slug]),
  );
  const rows = new Map<string, PartyPastMember>();
  const add = (id: string, vote?: Votes['records'][string]) => {
    const group = groups.get(id) ?? [];
    const r = [...group].sort(
      (a, b) =>
        Number(b.current === true) - Number(a.current === true) ||
        Number(b.name.includes(' ')) - Number(a.name.includes(' ')),
    )[0];
    const person = r ? canonicalFor(r) : peopleById.get(id);
    const periods = [
      ...new Map(
        group
          .flatMap((p) => p.affiliations ?? [])
          .filter((a) => sameMemberParty(a.party, label))
          .map((a) => [
            JSON.stringify([
              a.party,
              a.start,
              a.end,
              a.jurisdiction,
              a.chamber,
              a.electorate,
            ]),
            a,
          ]),
      ).values(),
    ].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    const sits =
      person?.electorates.some(
        (s) => s.current && s.party && sameMemberParty(s.party, label),
      ) ||
      group.some(
        (p) =>
          p.current === true &&
          sameMemberParty(p.party_now || p.party || '', label),
      );
    const ended = periods.some((p) => !!p.end) && periods.every((p) => !!p.end);
    const former =
      personPartyFor(person?.electorates ?? [], r).partyStatus === 'former';
    if (sits || ((r || person) && !ended && !former)) return;
    const name = r?.full || r?.name || vote!.name;
    const slug =
      people && !person
        ? null
        : ([name, r?.name, person?.name, ...(person?.aliases ?? []), vote?.name]
            .filter((n): n is string => !!n)
            .filter((n) => {
              const ids = idsByName.get(nameKey(n));
              return !ids?.size || (ids.size === 1 && ids.has(id));
            })
            .map((n) => slugByName.get(nameKey(n)))
            .find(Boolean) ?? null);
    if (
      hidden.has(id) ||
      hidden.has(`name:${nameKey(name)}`) ||
      (slug && hiddenSlugs.has(slug))
    )
      return;
    const existing = rows.get(id);
    const years = [
      ...new Set([...(existing?.years ?? []), ...(vote?.years ?? [])]),
    ].sort((a, b) => a - b);
    const party =
      periods[0]?.party ??
      (vote?.party && sameMemberParty(vote.party, label)
        ? vote.party
        : group
            .flatMap((p) => [p.party, ...(p.parties ?? [])])
            .find((p) => p && sameMemberParty(p, label)));
    const service = periods[0];
    rows.set(id, {
      personId: id,
      name,
      slug,
      jurisdiction:
        service?.jurisdiction ??
        existing?.jurisdiction ??
        vote?.jurisdiction ??
        '',
      house: service?.chamber ?? existing?.house ?? vote?.house ?? '',
      years,
      ...(periods.length ? { periods } : {}),
      recordedAs: formerPartyName(party) ?? '',
    });
  };
  for (const [key, vote] of Object.entries(votes.records)) {
    if (!vote.party || !sameMemberParty(vote.party, label)) continue;
    const namedId = idByName(vote.name);
    // Two different numeric IDs remain two people, even at the same name.
    const compatibleName =
      namedId &&
      !(groups.get(namedId) ?? []).some(
        (r) =>
          r.pid && /^\d+$/.test(r.pid) && /^\d+$/.test(key) && r.pid !== key,
      )
        ? namedId
        : undefined;
    const namedPerson = uniquePerson([vote.name]);
    const compatiblePerson =
      namedPerson &&
      !(
        namedPerson.legacy_person_id &&
        /^\d+$/.test(key) &&
        namedPerson.legacy_person_id !== key
      )
        ? namedPerson
        : undefined;
    add(
      idsByLegacy.get(key) ??
        peopleByLegacy.get(key)?.person_id ??
        compatibleName ??
        compatiblePerson?.person_id ??
        `vote:${key}`,
      vote,
    );
  }
  for (const [id, group] of groups)
    if (
      group.some((r) =>
        [
          r.party,
          ...(r.parties ?? []),
          ...(r.affiliations ?? []).map((a) => a.party),
        ].some((p) => p && sameMemberParty(p, label)),
      )
    )
      add(id);
  return [...rows.values()].sort(
    (a, b) =>
      Number((a.periods?.[0]?.start ?? '').slice(0, 4) || a.years[0] || 0) -
        Number((b.periods?.[0]?.start ?? '').slice(0, 4) || b.years[0] || 0) ||
      a.name.localeCompare(b.name, 'en-AU'),
  );
}
type MoneyNode = Money['nodes'][number];
/**
 * Several nodes of one renamed party in one money file, as one (the web's
 * party-page.js combinedNode): totals and counts summed, the years spanned,
 * and `lodgedAs` naming each name's part ("Lodged as Liberal Democrats
 * $1,000; as Libertarian $2,000"). Returns lodged under each name are
 * separate filings, so the sum never counts a receipt twice.
 */
export function combinedPartyNode(
  nodes: readonly MoneyNode[],
): MoneyNode & { lodgedAs: string | null } {
  if (nodes.length === 1) return { ...nodes[0]!, lodgedAs: null };
  const years = nodes
    .flatMap((n) => [n.firstYear, n.lastYear])
    .filter((y): y is number => !!y)
    .sort((a, b) => a - b);
  const parts = [...nodes]
    .sort((a, b) =>
      String(a.firstYear || '').localeCompare(String(b.firstYear || '')),
    )
    .map((n) => `${n.label} ${formatMoney(n.total || 0)}`);
  const byYear: MoneyNode['byYear'] = {};
  for (const n of nodes)
    for (const [year, [amount, count]] of Object.entries(n.byYear)) {
      const was = byYear[year] ?? [0, 0];
      byYear[year] = [was[0] + amount, was[1] + count];
    }
  return {
    ...nodes[0]!,
    total: nodes.reduce((a, n) => a + (n.total || 0), 0),
    count: nodes.reduce((a, n) => a + (n.count || 0), 0),
    firstYear: years[0],
    lastYear: years.at(-1),
    byYear,
    lodgedAs: `Lodged as ${parts.join('; as ')}`,
  };
}
export function partyMoney(label: string, graph: Money) {
  const parties = graph.nodes
    .filter((n) => n.kind === 'party' && !n.via)
    .sort((a, b) => b.total - a.total);
  const matches = (n: MoneyNode) =>
    samePartyLabel(n.label, label) ||
    !!n.aliases?.some((a) => samePartyLabel(a, label));
  // A renamed party can hold a node under each name it lodged returns as:
  // all of them, as one. Any other party reads its largest matching node.
  const own = partyRename(label)
    ? parties.filter(matches)
    : parties.filter(matches).slice(0, 1);
  if (!own.length) return null;
  const node = combinedPartyNode(own);
  const ids = new Set(own.map((n) => n.id));
  const donors = new Map(
    graph.nodes.filter((n) => n.kind === 'donor').map((n) => [n.id, n]),
  );
  const flows = graph.edges.filter(
    (e) => ids.has(e.target) && donors.has(e.source),
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
          own
            .map((n) => donorAssociatedTo(donors.get(id)!, n.label))
            .find(Boolean) ?? null,
        ),
      }));
  };
  // The party's place among the file's parties, its names counted once.
  const others = parties.filter((n) => !ids.has(n.id));
  return {
    node,
    /** The register's own label, when its one node carries a former name. */
    recordedAs: own.length === 1 ? formerPartyName(node.label) : null,
    rank:
      own.length === 1
        ? parties.indexOf(own[0]!) + 1
        : others.filter((n) => n.total > node.total).length + 1,
    parties: others.length + 1,
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
