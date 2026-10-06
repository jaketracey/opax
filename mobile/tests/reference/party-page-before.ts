// Frozen pre-index implementation at a5dffa06 (polish-b5): differential identity oracle.
import type {
  BillDetail,
  BillIndex,
  Manifest,
  Money,
  PeopleCatalog,
  Roster,
  Slugs,
} from '../../src/api/catalog-decoders';
import { joinPerson, rosterChambersFor } from './person-identity-before';
import {
  billDedupeDivisions,
  billName,
  billQuestionParts,
} from '../../src/api/bill-transforms';
import { isPartyLabel, samePartyLabel } from '../../src/design/party';
import { nameKey } from '../../src/api/ids';
export { resolveParty } from '../../src/design/party';

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
  const current: PartyMember[] = [],
    recorded: PartyMember[] = [];
  const seen = new Set<string>();
  const sources = new Map<string, Manifest['sources'][number]>();
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
  // Full-name profiles precede surname stubs for the same canonical ID.
  const orderedSlugs = Object.keys(slugs.slugs).sort(
    (a, b) =>
      Number(slugs.slugs[b]!.includes(' ')) -
      Number(slugs.slugs[a]!.includes(' ')),
  );
  for (const slug of orderedSlugs) {
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
    if (p.partyStatus === 'former') continue;
    const seats = p.seats.filter(
      (s) => s.party && samePartyLabel(s.party, label),
    );
    const before = current.length + recorded.length;
    if (p.partyStatus === 'current') {
      // A current seat establishes only its own affiliation. The APH current
      // flag establishes a federal affiliation only when party_now names it.
      if (seats.length)
        for (const s of seats)
          current.push({
            name: p.name,
            slug,
            jurisdiction: s.jurisdiction,
            chamber: s.chamber,
            place: s.name,
            asAt: s.as_of,
          });
      else if (
        !p.seats.length &&
        p.rosterRow?.current === true &&
        p.rosterRow.party_now &&
        samePartyLabel(p.rosterRow.party_now, label)
      ) {
        const chambers = rosterChambersFor(p.rosterRow).filter((c) =>
          ['representatives', 'senate'].includes(c),
        );
        for (const chamber of chambers)
          current.push({
            name: p.name,
            slug,
            jurisdiction: 'federal',
            chamber,
            place:
              p.rosterRow.representation?.find(
                (r) => r.jurisdiction === 'federal' && r.chamber === chamber,
              )?.electorate ?? '',
            asAt: roster.meta.generated,
          });
      }
    } else if (p.party && samePartyLabel(p.party, label)) {
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
        slug,
        // Undated roster places can mix state and federal records. Show the
        // recorded name without assigning unverified representation.
        jurisdiction: '',
        chamber: '',
        place: '',
        asAt: roster.meta.generated,
      });
    }
    if (current.length + recorded.length > before)
      for (const source of p.sources) sources.set(source.source_id, source);
  }
  const order = (a: PartyMember, b: PartyMember) =>
    `${a.jurisdiction}|${a.chamber}|${a.name}`.localeCompare(
      `${b.jurisdiction}|${b.chamber}|${b.name}`,
      'en-AU',
    );
  return {
    current: current.sort(order),
    recorded: recorded.sort(order),
    currentCount: new Set(current.map((p) => p.slug)).size,
    sources: [...sources.values()],
  };
}
export interface PartyMember {
  name: string;
  slug: string;
  jurisdiction: string;
  chamber: string;
  place: string;
  asAt: string | null;
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
    return [...sums]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, amount]) => ({ id, name: donors.get(id)!.label, amount }));
  };
  return {
    node,
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
          const split = Object.entries(division.party_splits).find(([party]) =>
            samePartyLabel(party, label),
          )?.[1];
          return split && (split.ayes || split.noes)
            ? [
                {
                  billKey: bill.key,
                  title: billName(bill),
                  division,
                  question: billQuestionParts(division, bill).head,
                  ...split,
                },
              ]
            : [];
        },
      ),
    )
    .sort((a, b) => b.division.date.localeCompare(a.division.date));
}
export const partyPageCopy = {
  caption: 'Received (disclosed)',
  aec: 'AEC disclosure data: donations under the disclosure threshold are not reported and cannot appear here, so totals are a floor, not a ceiling.',
};
