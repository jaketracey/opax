// samePartyLabel and PARTY_MAP labels ported from portal/public/app.js.
import { resolveParty } from '../design/party';
import type {
  Manifest,
  PeopleCatalog,
  Roster,
  SeatObservation,
} from './catalog-decoders';
const partyLabels: Record<string, string> = {
  labor: 'ALP',
  liberal: 'LIB',
  nationals: 'NAT',
  lnp: 'LNP',
  'country liberal party': 'CLP',
  greens: 'GRN',
  'one nation': 'ONP',
  independent: 'IND',
  'centre alliance': 'CA',
  "katter's australian party": 'KAP',
  'united australia party': 'UAP',
  'australian democrats': 'AD',
  'family first': 'FF',
  dlp: 'DLP',
  jln: 'JLN',
};
export function samePartyLabel(a: string, b: string) {
  const label = (party: string) =>
    Object.hasOwn(partyLabels, String(party).toLowerCase())
      ? partyLabels[String(party).toLowerCase()]
      : String(party);
  return label(a) === label(b);
}
/**
 * Whether a person's party is their affiliation today, a former one, or one
 * the data does not date. Unknown is common: the roster's `current` flag comes
 * only from the federal APH list, and the dated seat release covers federal
 * House history plus current senators and Victorian members. Only "former"
 * may be drawn as "Formerly X"; unknown is drawn plainly, as the web does.
 */
export type PartyStatus = 'current' | 'former' | 'unknown';
/** Dated evidence for status only; never an identity, portrait or record join. */
export function partyStatusSeatsFor(
  seats: SeatObservation[],
  row?: Roster['people'][number],
  people?: PeopleCatalog,
): SeatObservation[] {
  if (seats.length || row?.pid !== '10001' || row.name !== 'Tony Abbott')
    return seats;
  // The pinned release names this Warringah term Anthony John Abbott, with
  // neither aliases nor a legacy ID. Require both exact OPAX names/IDs and
  // the recorded seat/term; a surname or missing current flag proves nothing.
  const candidates = people?.people.filter(
    (p) =>
      p.person_id === 'person_b0f61b3cfccd5557bef4aada' &&
      p.name === 'Anthony John Abbott' &&
      (!p.legacy_person_id || p.legacy_person_id === row.pid),
  );
  const dated = candidates?.length === 1 ? candidates[0] : undefined;
  const representation = row.representation ?? [];
  const warringah = dated?.electorates.find(
    (seat) =>
      seat.jurisdiction === 'federal' &&
      seat.chamber === 'representatives' &&
      seat.name === 'Warringah' &&
      !seat.current &&
      seat.periods?.some(
        (period) =>
          period.start === '1994-03-26' && period.end === '2019-05-18',
      ) &&
      representation.some(
        (r) =>
          r.jurisdiction === seat.jurisdiction &&
          r.chamber === seat.chamber &&
          r.electorate === seat.name,
      ),
  );
  return warringah ? dated!.electorates : seats;
}
/**
 * Surnames that sit today, per parliament whose complete current membership
 * the dated release holds: its current seats number exactly the members its
 * roster coverage records (federal 226 and Victoria 128 in the pinned
 * release). The release says nothing about who sits anywhere else.
 */
export type SittingSurnames = ReadonlyMap<string, ReadonlySet<string>>;
const sittingCache = new WeakMap<
  PeopleCatalog,
  WeakMap<Manifest['coverage'], SittingSurnames>
>();
function surnameKeys(name: string) {
  const last =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[’‘ʼ`]/g, "'")
      .trim()
      .split(/\s+/)
      .at(-1) ?? '';
  // "Allman-Payne" shares a surname with any Payne and any Allman.
  return [last, ...last.split('-')].filter(Boolean);
}
export function sittingSurnamesFor(
  people: PeopleCatalog,
  coverage: Manifest['coverage'],
): SittingSurnames {
  let byCoverage = sittingCache.get(people);
  if (!byCoverage) sittingCache.set(people, (byCoverage = new WeakMap()));
  const cached = byCoverage.get(coverage);
  if (cached) return cached;
  const seats = new Map<string, number>();
  const names = new Map<string, Set<string>>();
  for (const person of people.people)
    for (const seat of person.electorates.filter((s) => s.current)) {
      seats.set(seat.jurisdiction, (seats.get(seat.jurisdiction) ?? 0) + 1);
      const set = names.get(seat.jurisdiction) ?? new Set<string>();
      for (const name of [person.name, ...person.aliases])
        for (const key of surnameKeys(name)) set.add(key);
      names.set(seat.jurisdiction, set);
    }
  const sitting = new Map<string, ReadonlySet<string>>();
  for (const [jurisdiction, count] of seats) {
    const members = coverage.jurisdictions[jurisdiction]?.roster_members ?? 0;
    if (members > 0 && count === members)
      sitting.set(jurisdiction, names.get(jurisdiction)!);
  }
  byCoverage.set(coverage, sitting);
  return sitting;
}
// `seats` are all of the person's dated observations, current and ended.
export function partyStatusFor(
  seats: SeatObservation[],
  row?: Roster['people'][number],
  sitting?: SittingSurnames,
): PartyStatus {
  if (
    seats.some((s) => s.current) ||
    (row?.current === true && !!row.party_now)
  )
    return 'current';
  // A roster that says the person sits is never overruled by an ended seat,
  // even without party_now to name the current party.
  if (row?.current === true) return 'unknown';
  if (row?.current === false) return 'former';
  // An ended seat proves a former member only where the dated release speaks
  // for every jurisdiction the roster records: an ended federal seat says
  // nothing about a state seat (Janelle Saffin's Page seat ended in 2013; the
  // roster also records her for Lismore, which no dated release covers).
  const dated = new Set(seats.map((s) => s.jurisdiction));
  const recorded = [
    ...(row?.states ?? []),
    ...(row?.representation ?? []).map((r) => r.jurisdiction),
  ];
  if (seats.length && recorded.every((j) => dated.has(j))) return 'former';
  // No dated seat links this roster row: the release names Joe Hockey
  // "Joseph Benedict Hockey", with no alias or legacy ID. Where the release
  // holds the complete current membership of every parliament the roster
  // records, someone whose surname no sitting member there shares does not
  // sit. A shared surname proves nothing (Marise Payne, Alicia Payne).
  const surnames = [row?.name ?? '', row?.full ?? ''].flatMap(surnameKeys);
  return sitting &&
    surnames.length &&
    recorded.length &&
    recorded.every((j) => {
      const sits = sitting.get(j);
      return !!sits && !surnames.some((s) => sits.has(s));
    })
    ? 'former'
    : 'unknown';
}
// Both the directory and full profile use dated seats first. Historical roster
// affiliations remain visible, but are never labelled as a current party.
export function personPartyFor(
  seats: SeatObservation[],
  row?: Roster['people'][number],
  affiliationRow?: Roster['people'][number],
  people?: PeopleCatalog,
  coverage?: Manifest['coverage'],
) {
  const current = seats.filter((s) => s.current);
  return {
    party: current[0]?.party ?? row?.party_now ?? row?.party ?? null,
    partyStatus: partyStatusFor(
      partyStatusSeatsFor(seats, row, people),
      row,
      people && coverage ? sittingSurnamesFor(people, coverage) : undefined,
    ),
    rosterParty: row?.party ?? null,
    // Former affiliations need a distinct, named roster party_now observation;
    // a different seat label alone does not establish a party change.
    formerly:
      affiliationRow?.party_now &&
      affiliationRow.party &&
      !samePartyLabel(affiliationRow.party_now, affiliationRow.party)
        ? affiliationRow.party
        : null,
  };
}
// Link-only projection of graph/money.json at the fixture sourceCommit.
// No figures: profiles need only the register's party labels/aliases. Tests
// compare this tiny projection with the complete pinned source on every run.
export const receiptParties = {
  generated: '2026-09-21',
  parties: [
    {
      label: 'Labor',
      aliases: [],
    },
    {
      label: 'Liberal',
      aliases: [],
    },
    {
      label: 'LNP',
      aliases: [],
    },
    {
      label: 'United Australia Party',
      aliases: [],
    },
    {
      label: 'Greens',
      aliases: [],
    },
    {
      label: 'Nationals',
      aliases: [],
    },
    {
      label: 'Family First',
      aliases: [],
    },
    {
      label: 'One Nation',
      aliases: [],
    },
    {
      label: "Katter's Australian Party",
      aliases: [],
    },
    {
      label: 'Country Liberal Party',
      aliases: [],
    },
    {
      label: 'Centre Alliance',
      aliases: [],
    },
  ],
} as const;
// The same strict matching as the party chips (resolveParty): an exact label,
// a slug or one party identity, never a prefix ("Liberal Democrats" is not
// Liberal; "Liberal National Party of Queensland" is the LNP).
export function partyReceiptsFor(party: string | null) {
  const nodes = receiptParties.parties;
  const resolved = party
    ? resolveParty(
        party,
        nodes.flatMap((n) => [n.label, ...n.aliases]),
      )
    : null;
  const node = resolved
    ? nodes.find(
        (n) =>
          n.label === resolved || n.aliases.some((a: string) => a === resolved),
      )
    : undefined;
  return {
    url:
      node && party ? `/subject/party/${encodeURIComponent(party)}` : '/money',
    caption: 'Party disclosures, not this person’s finances.',
    party: node?.label ?? null,
  };
}
