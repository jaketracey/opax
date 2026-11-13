import type {
  BillDetail,
  Electorate,
  ElectorateDetail,
  Roster,
  Votes,
} from '../../api/catalog-decoders';
import type { PersonProfile } from '../../api/person-identity';
import { rosterChambersFor } from '../../api/person-identity';
import {
  partyName,
  sameMemberParty,
  sittingPartyMembers,
} from '../../api/party-page';
import { nameKey, nameValues } from '../../api/ids';
import {
  billFoldText,
  billName,
  billDedupeDivisions,
  billQuestionParts,
  billStage,
} from '../../api/bill-transforms';
import { hasParliamentaryMembership, type Directory } from '../your-mp/model';
import {
  samePortraitPerson,
  type buildPortraitIndex,
} from '../../api/portrait-index';
import { formatCount } from '../../design/format';
import { chamberName, jurisdictionName } from '../../design/parliament';
import { currentPartyName, isPartyLabel } from '../../design/party';
import type { PartyFile } from './party-file';
import { stageTitle } from '../bills/divisions';
export { partyName } from '../../api/party-page';

export type DirectoryKind = 'person' | 'party' | 'electorate';
export const directoryKind = (value: unknown): DirectoryKind =>
  value === 'party' || value === 'electorate' ? value : 'person';
/** The filter store's values: a facet's choice, or '1' for a switch that is on. */
export type Filters = Record<
  string,
  string | number | boolean | null | undefined
>;
const filterValue = (f: Filters, key: string) => {
  const v = f[key];
  return v === undefined || v === null || v === false ? '' : String(v);
};
export interface Choice {
  value: string;
  label: string;
}
export interface Facet {
  key: string;
  label: string;
  choices?: Choice[];
}

/** One seat a person held, from the dated release or the roster. */
export interface PlaceSeat {
  name: string;
  chamber: string;
  jurisdiction: string;
  /** The state or territory's lower-case code ("nsw"), when known. */
  state: string | null;
  /** The dated release says they hold it now. */
  current: boolean;
  /** The latest recorded end of service in the seat. */
  end: string | null;
}
export interface PeopleRow {
  key: string;
  name: string;
  profile: PersonProfile;
  row: Roster['people'][number] | undefined;
  parties: string[];
  /** Confirmed current affiliations, from the shared party membership list. */
  sittingParties: string[];
  /** Parliaments sat in: "federal", "nsw". */
  parliaments: string[];
  /** States and territories represented: "nsw", "vic". */
  states: string[];
  chambers: string[];
  divisions: number;
  portrait: boolean;
  text: string;
  sortName: string;
  seats: PlaceSeat[];
  /** A sitting member's current federal House seat ("Set as my electorate"). */
  seat?: Electorate;
}
// Some roster rows carry an office where the seat belongs.
const officeTitle =
  /\b(?:minister|secretary|premier|treasurer|attorney|leader|speaker|president|whip|chair|deputy|shadow|government|opposition)\b/i;
const federalSeatState = (url: string) =>
  /^\/subject\/electorate\/federal-(?:representatives|senate)-([a-z]+)-/.exec(
    url,
  )?.[1] ?? null;
const stateCode = (code: string | null | undefined) => {
  const id = code?.trim().toLowerCase();
  return id && id !== 'federal' && jurisdictionName(id) ? id : null;
};
export function peopleRows(
  d: Directory,
  votes: Votes,
  portraits: ReturnType<typeof buildPortraitIndex>,
): PeopleRow[] {
  const sitting = new Map(
    sittingPartyMembers(
      d.roster.data,
      d.people.data,
      d.slugs.data,
      d.manifest.data,
    ).map(({ profile, seats }) => [
      profile.canonicalPersonId ?? profile.rosterPersonId ?? profile.name,
      [...new Set(seats.map((s) => s.party))],
    ]),
  );
  const named = new Map<string, Roster['people']>();
  for (const row of d.roster.data.people) {
    const key = nameKey(row.name);
    named.set(key, [...(named.get(key) ?? []), row]);
  }
  const release = new Map(d.people.data.people.map((p) => [p.person_id, p]));
  const electorates = new Map(
    d.electorates.data.electorates.map((e) => [e.electorate_id, e]),
  );
  const out: PeopleRow[] = [];
  // The resolver deliberately retains surname aliases, but directory rows
  // follow Search/party membership: a full-name native identity, once per
  // canonical person (or the roster identity when no dated ID exists).
  const identities = new Map<string, [string, PersonProfile][]>();
  for (const entry of portraits.identities) {
    const [key, profile] = entry;
    if (!profile.name.trim().includes(' ')) continue;
    if (!hasParliamentaryMembership(profile, d)) continue;
    const id =
      profile.canonicalPersonId ??
      profile.rosterPersonId ??
      nameKey(profile.name);
    const group = identities.get(id) ?? [];
    // A reused roster/vote ID alone must not collapse unrelated full names.
    // Reuse the portrait index's established identity compatibility guard.
    const duplicate = group.findIndex(([, p]) =>
      samePortraitPerson(p, profile),
    );
    const canonicalName = profile.canonicalPersonId
      ? release.get(profile.canonicalPersonId)?.name
      : undefined;
    if (duplicate === -1) group.push([key, profile]);
    else if (
      profile.name === canonicalName &&
      group[duplicate]![1].name !== canonicalName
    )
      group[duplicate] = [key, profile];
    identities.set(id, group);
  }
  for (const [key, profile] of [...identities.values()].flat()) {
    const candidates = named.get(nameKey(profile.name)) ?? [];
    const row =
      profile.rosterRow ??
      (candidates.length === 1 ? candidates[0] : undefined);
    const person = profile.canonicalPersonId
      ? release.get(profile.canonicalPersonId)
      : undefined;
    const names = [
      profile.name,
      row?.full ?? '',
      person?.name ?? '',
      ...(person?.aliases ?? []),
    ].filter((n) => n.trim().includes(' '));
    const keys = [
      ...new Set(
        [
          profile.legacyPersonId,
          ...nameValues(votes.names, names).flat(),
        ].filter((k): k is string => !!k),
      ),
    ];
    const records = keys.flatMap((k) =>
      votes.records[k] ? [votes.records[k]!] : [],
    );
    const safe = records.every((r) =>
      names.some((n) => nameKey(n) === nameKey(r.name)),
    );
    const seats: PlaceSeat[] = [
      ...(person?.electorates ?? []).map((s) => ({
        name: s.name,
        chamber: s.chamber,
        jurisdiction: s.jurisdiction,
        state:
          stateCode(electorates.get(s.electorate_id)?.state_code) ??
          stateCode(federalSeatState(s.url)) ??
          stateCode(s.jurisdiction),
        current: s.current,
        end:
          (s.periods ?? [])
            .map((p) => p.end)
            .filter((e): e is string => !!e)
            .sort()
            .at(-1) ?? null,
      })),
      ...(row?.representation ?? [])
        .filter(
          (r) =>
            r.chamber !== 'senate_committee' &&
            !!r.electorate.trim() &&
            !officeTitle.test(r.electorate),
        )
        .map((r) => ({
          name: r.electorate.trim(),
          chamber: r.chamber,
          jurisdiction: r.jurisdiction,
          state: stateCode(r.state) ?? stateCode(r.jurisdiction),
          current: false,
          end: null,
        })),
    ];
    const parliaments = [
      ...new Set([
        ...(row?.states ?? []),
        ...(row?.representation ?? []).map((r) => r.jurisdiction),
        ...(person?.electorates ?? []).map((s) => s.jurisdiction),
      ]),
    ];
    const states = [
      ...new Set(
        [...seats.map((s) => s.state), ...parliaments.map(stateCode)].filter(
          (s): s is string => !!s,
        ),
      ),
    ];
    const chambers = [
      ...new Set([
        ...(row?.chambers ?? []).filter((c) => c !== 'senate_committee'),
        ...(row?.representation ?? []).map((r) => r.chamber),
        ...(person?.electorates ?? []).map((s) => s.chamber),
      ]),
    ].filter((c) => c !== 'senate_committee');
    const sittingParties =
      sitting.get(
        profile.canonicalPersonId ?? profile.rosterPersonId ?? profile.name,
      ) ?? [];
    const parties = [
      ...new Set(
        [
          ...sittingParties,
          row?.party,
          ...(row?.parties ?? []),
          ...(person?.electorates ?? []).map((s) => s.party),
        ].filter((p): p is string => !!p),
      ),
    ];
    const house = (person?.electorates ?? []).find(
      (s) =>
        s.current &&
        s.jurisdiction === 'federal' &&
        s.chamber === 'representatives',
    );
    const seat =
      house && profile.partyStatus === 'current'
        ? electorates.get(house.electorate_id)
        : undefined;
    out.push({
      key,
      name: profile.name,
      profile,
      row,
      parties,
      sittingParties,
      parliaments,
      states,
      chambers,
      divisions: safe ? records.reduce((n, r) => n + r.divisions_total, 0) : 0,
      portrait: portraits.portraits.has(key),
      text: billFoldText(
        [
          profile.name,
          row?.full,
          ...parties,
          ...parties.map(partyName),
          ...seats.map((s) => s.name),
          ...states.map((s) => jurisdictionName(s) ?? s),
          ...parliaments.map((s) => jurisdictionName(s) ?? s),
        ].join(' '),
      ),
      sortName: `${profile.name.toLowerCase().split(' ').at(-1)} ${profile.name.toLowerCase()}`,
      seats,
      ...(seat ? { seat } : {}),
    });
  }
  return out;
}

/**
 * Where the person sits or sat, under their party: "Member for Grayndler,
 * New South Wales", "Senator for Victoria", "Member for Essendon, Victorian
 * Legislative Assembly", "Former member for Lalor, Victoria". A person whose
 * status is not confirmed gets the place without a claim ("Lalor,
 * Victoria"). Null when no seat is known.
 */
export function placeLine(
  person: Pick<PeopleRow, 'seats' | 'profile'>,
): string | null {
  const group = sittingGroup(person);
  const seats = person.seats.filter(
    (s) => s.chamber !== 'senate_committee' && chamberName(s.chamber),
  );
  const latest = [...seats]
    .filter((s) => !s.current)
    .sort((a, b) => (b.end ?? '').localeCompare(a.end ?? ''))[0];
  const seat =
    group === 'former'
      ? (latest ?? seats[0])
      : (seats.find((s) => s.current) ?? seats[0]);
  if (!seat) return null;
  const state = jurisdictionName(seat.state);
  const said = (claim: string, former: string, plain: string) =>
    group === 'sitting' ? claim : group === 'former' ? former : plain;
  if (seat.jurisdiction === 'federal' && seat.chamber === 'senate') {
    const where = state ?? seat.name;
    return said(
      `Senator for ${where}`,
      `Former senator for ${where}`,
      `Senate, ${where}`,
    );
  }
  const house = chamberName(seat.chamber, seat.jurisdiction)!;
  // An upper house elected state-wide: "Legislative Council district of
  // New South Wales" is the whole state, not a seat.
  if (
    seat.jurisdiction !== 'federal' &&
    (nameKey(seat.name) ===
      nameKey(jurisdictionName(seat.jurisdiction) ?? '') ||
      /\b(?:legislative|house of assembly)\b/i.test(seat.name))
  )
    return said(
      `Member of the ${house}`,
      `Former member of the ${house}`,
      house,
    );
  const where =
    seat.jurisdiction === 'federal'
      ? [seat.name, state].filter(Boolean).join(', ')
      : `${seat.name}, ${house}`;
  return said(`Member for ${where}`, `Former member for ${where}`, where);
}

/**
 * Sitting members first, then those the data cannot date, then former
 * members; the chosen sort applies within each group. The group is the
 * profile's party status, the one that draws a "Former member" line.
 */
export type SittingGroup = 'sitting' | 'unrecorded' | 'former';
export const sittingGroupTitles: Record<SittingGroup, string> = {
  sitting: 'Sitting members',
  unrecorded: 'Status not confirmed',
  former: 'Former members',
};
const groupRank: Record<SittingGroup, number> = {
  sitting: 0,
  unrecorded: 1,
  former: 2,
};
export function sittingGroup(p: Pick<PeopleRow, 'profile'>): SittingGroup {
  const status = p.profile.partyStatus;
  return status === 'current'
    ? 'sitting'
    : status === 'former'
      ? 'former'
      : 'unrecorded';
}
/** One sticky-headed section of a directory list. */
export interface DirectorySection<T> {
  key: string;
  title: string | null;
  data: T[];
}
/** Sorted people as their Sitting, not confirmed and Former sections. */
export function peopleSections(
  rows: PeopleRow[],
): DirectorySection<PeopleRow>[] {
  const sections: DirectorySection<PeopleRow>[] = [];
  for (const row of rows) {
    const group = sittingGroup(row);
    const last = sections.at(-1);
    if (last?.key === group) last.data.push(row);
    else
      sections.push({
        key: group,
        title: sittingGroupTitles[group],
        data: [row],
      });
  }
  return sections;
}
/** Electorates under the Name sort by first letter; otherwise one list. */
export function electorateSections(
  rows: Electorate[],
  sort: string | undefined,
): DirectorySection<Electorate>[] {
  if (sort && sort !== 'name')
    return rows.length ? [{ key: 'all', title: null, data: rows }] : [];
  const sections: DirectorySection<Electorate>[] = [];
  for (const row of rows) {
    const first = billFoldText(row.name).charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : '#';
    const last = sections.at(-1);
    if (last?.key === letter) last.data.push(row);
    else sections.push({ key: letter, title: letter, data: [row] });
  }
  return sections;
}

export function matchingPeople(rows: PeopleRow[], f: Filters, query: string) {
  const party = filterValue(f, 'party');
  const parliament = filterValue(f, 'parliament');
  const chamber = filterValue(f, 'chamber');
  const state = filterValue(f, 'state');
  const sort = filterValue(f, 'sort') || 'name';
  const sitting = filterValue(f, 'sitting');
  return rows
    .filter(
      (p) =>
        matches(p.text, query) &&
        (!party ||
          (sitting ? p.sittingParties : p.parties).some((x) =>
            sameMemberParty(x, party),
          )) &&
        (!parliament || p.parliaments.includes(parliament)) &&
        (!chamber || p.chambers.includes(chamber)) &&
        (!state || p.states.includes(state)) &&
        (!filterValue(f, 'votes') || p.divisions > 0) &&
        // The dated status only: an undated party is not called sitting.
        (!sitting || sittingGroup(p) === 'sitting'),
    )
    .sort(
      (a, b) =>
        groupRank[sittingGroup(a)] - groupRank[sittingGroup(b)] ||
        (sort === 'recent'
          ? (b.row?.last ?? 0) - (a.row?.last ?? 0) ||
            (b.row?.speeches ?? 0) - (a.row?.speeches ?? 0)
          : sort === 'speeches'
            ? (b.row?.speeches ?? 0) - (a.row?.speeches ?? 0)
            : sort === 'divisions'
              ? b.divisions - a.divisions
              : 0) ||
        a.sortName.localeCompare(b.sortName),
    );
}
export interface PartyRow {
  key: string;
  name: string;
  speeches: number;
  /** Unique sitting members across federal, state and territory parliaments. */
  members: number;
  money: Record<string, { total: number; source: string; asAt: string }>;
  total: number;
}
/** Parties only: "Independent" and presiding roles are not listed. */
export function partyRows(
  directory: Pick<Directory, 'roster' | 'people' | 'slugs' | 'manifest'>,
  files: Record<string, PartyFile>,
): PartyRow[] {
  const { roster, people, slugs, manifest } = directory;
  const sitting = sittingPartyMembers(
    roster.data,
    people.data,
    slugs.data,
    manifest.data,
  );
  const rows = new Map<string, PartyRow>();
  // A renamed party is one row, at its current name, whatever name a file
  // records it under.
  const get = (label: string) => {
    const name = currentPartyName(label);
    let p = rows.get(name);
    if (!p)
      rows.set(
        name,
        (p = { key: name, name, speeches: 0, members: 0, money: {}, total: 0 }),
      );
    return p;
  };
  for (const [jur, file] of Object.entries(files))
    for (const n of file.parties) {
      const row = get(n.label);
      // Two names in one file: the larger node, as the party page's
      // receipts read it (partyMoney). Totals are never added together.
      if ((row.money[jur]?.total ?? -1) >= n.total) continue;
      row.money[jur] = {
        total: n.total,
        source:
          file.meta.sourceShort ??
          (jur === 'federal' ? 'AEC returns' : jur.toUpperCase()),
        asAt: file.meta.generated,
      };
    }
  for (const { seats } of sitting) for (const seat of seats) get(seat.party);
  for (const p of roster.data.people)
    if (
      p.party &&
      (rosterChambersFor(p).some((c) => !!chamberName(c, 'federal')) ||
        p.representation?.some(
          (r) =>
            r.electorate.trim() &&
            r.chamber !== 'senate_committee' &&
            chamberName(r.chamber, r.jurisdiction),
        ))
    ) {
      const r = get(p.party);
      r.speeches += p.speeches ?? 0;
    }
  for (const p of rows.values()) {
    p.members = sitting.filter((m) =>
      m.seats.some((s) => sameMemberParty(s.party, p.name)),
    ).length;
    p.total =
      p.money.federal?.total ??
      Math.max(0, ...Object.values(p.money).map((m) => m.total));
  }
  return [...rows.values()].filter((p) => isPartyLabel(p.name));
}
export function matchingParties(rows: PartyRow[], f: Filters, query: string) {
  const jur = filterValue(f, 'jur');
  const sort = filterValue(f, 'sort') || 'name';
  const receipts = (p: PartyRow) =>
    jur ? (p.money[jur]?.total ?? 0) : p.total;
  return rows
    .filter(
      (p) =>
        matches(billFoldText(`${p.name} ${partyName(p.name)}`), query) &&
        (!jur || !!p.money[jur]) &&
        (!filterValue(f, 'has_speeches') || p.speeches > 0) &&
        (!filterValue(f, 'has_members') || p.members > 0) &&
        (!filterValue(f, 'has_donations') || Object.keys(p.money).length > 0),
    )
    .sort(
      (a, b) =>
        (sort === 'donations'
          ? receipts(b) - receipts(a)
          : sort === 'members'
            ? b.members - a.members
            : sort === 'speeches'
              ? b.speeches - a.speeches
              : 0) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
}
export function matchingElectorates(
  rows: Electorate[],
  f: Filters,
  query: string,
) {
  const [jur, chamber, state, status, party] = [
    'jur',
    'chamber',
    'state',
    'status',
    'party',
  ].map((key) => filterValue(f, key));
  return rows
    .filter(
      (e) =>
        matches(
          billFoldText(
            [
              e.name,
              ...(e.aliases ?? []),
              e.jurisdiction,
              e.state_code,
              jurisdictionName(e.state_code),
              jurisdictionName(e.jurisdiction),
              chamberName(e.chamber, e.jurisdiction),
              ...e.representatives.flatMap((r) => [r.person.name, r.party]),
            ].join(' '),
          ),
          query,
        ) &&
        (!jur || e.jurisdiction === jur) &&
        (!chamber || e.chamber === chamber) &&
        (!state || e.state_code === state) &&
        (!status || e.status === status) &&
        (!party ||
          e.representatives.some(
            (r) =>
              !!r.party &&
              nameKey(partyName(r.party)) === nameKey(partyName(party)),
          )) &&
        (!filterValue(f, 'results') || (e.election_count ?? 0) > 0),
    )
    .sort(
      (a, b) =>
        (filterValue(f, 'sort') === 'elections'
          ? (b.election_count ?? 0) - (a.election_count ?? 0)
          : 0) || a.name.localeCompare(b.name),
    );
}
function matches(text: string, query: string) {
  return billFoldText(query)
    .split(' ')
    .filter(Boolean)
    .every((t) => text.includes(t));
}
const choices = (
  values: string[],
  label: (s: string) => string | null = (s) => s,
): Choice[] =>
  [...new Set(values)]
    .map((value) => ({ value, label: label(value) ?? value }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en-AU'));
/** Parties by full name, once each; "Independent" stays a choice. */
function partyChoices(values: string[]): Choice[] {
  return choices([...new Set(values.map(partyName))]);
}
export function peopleFacets(rows: PeopleRow[]): Facet[] {
  return [
    {
      key: 'party',
      label: 'Party',
      choices: partyChoices(rows.flatMap((p) => p.parties)),
    },
    {
      key: 'parliament',
      label: 'Parliament',
      choices: choices(
        rows.flatMap((p) => p.parliaments),
        jurisdictionName,
      ),
    },
    {
      key: 'chamber',
      label: 'Chamber',
      choices: choices(
        rows.flatMap((p) => p.chambers),
        (s) => chamberName(s),
      ),
    },
    {
      key: 'state',
      label: 'State',
      choices: choices(
        rows.flatMap((p) => p.states),
        jurisdictionName,
      ),
    },
  ];
}
export const partyFacets: Facet[] = [
  {
    key: 'jur',
    label: 'Disclosed to',
    choices: [
      { value: 'federal', label: 'Federal (AEC)' },
      { value: 'qld', label: 'Queensland (ECQ)' },
      { value: 'vic', label: 'Victoria (VEC)' },
    ],
  },
];
export function electorateFacets(rows: Electorate[]): Facet[] {
  return [
    {
      key: 'jur',
      label: 'Parliament',
      choices: choices(
        rows.map((e) => e.jurisdiction),
        jurisdictionName,
      ),
    },
    {
      key: 'chamber',
      label: 'Chamber',
      choices: choices(
        rows.map((e) => e.chamber),
        (s) => chamberName(s),
      ),
    },
    {
      key: 'state',
      label: 'State',
      choices: choices(
        rows.map((e) => e.state_code),
        jurisdictionName,
      ),
    },
    {
      key: 'party',
      label: 'Member’s party',
      choices: partyChoices(
        rows.flatMap((e) =>
          e.representatives.flatMap((r) => (r.party ? [r.party] : [])),
        ),
      ),
    },
  ];
}
/** What the Sort row calls the order: "Name", "Most recent". */
export function sortSummary(kind: DirectoryKind, sort: string | undefined) {
  const sorts = directorySorts[kind];
  return (sorts.find((s) => s.value === sort) ?? sorts[0]!).label;
}
// Name first for every kind: a ranked default leans (people.md 2.4).
export const directorySorts: Record<DirectoryKind, Choice[]> = {
  person: [
    { value: 'name', label: 'Name' },
    { value: 'recent', label: 'Most recent' },
    { value: 'speeches', label: 'Most speeches' },
    { value: 'divisions', label: 'Most divisions' },
  ],
  party: [
    { value: 'name', label: 'Name' },
    { value: 'members', label: 'Most members' },
    { value: 'speeches', label: 'Most speeches' },
    { value: 'donations', label: 'Most disclosed receipts' },
  ],
  electorate: [
    { value: 'name', label: 'Name' },
    { value: 'elections', label: 'Most elections' },
  ],
};
const nouns: Record<DirectoryKind, [string, string]> = {
  person: ['parliamentarian', 'parliamentarians'],
  party: ['party', 'parties'],
  electorate: ['electorate', 'electorates'],
};
/** "1,090 parliamentarians", "1 party". */
export function directoryCount(kind: DirectoryKind, n: number) {
  return `${formatCount(n)} ${nouns[kind][n === 1 ? 0 : 1]}`;
}
export function validDate(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function representationAt(
  detail: Pick<ElectorateDetail, 'rosters' | 'terms' | 'capacity' | 'people'>,
  on: string,
) {
  if (!validDate(on)) return { status: 'unknown', members: [], asOf: on };
  const roster = detail.rosters
    .filter((r) => r.as_of === on)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  if (roster)
    return {
      status: roster.complete ? 'verified' : 'partial',
      members: roster.members,
      asOf: on,
    };
  const terms = detail.terms.filter(
    (t) =>
      t.start_precision === 'day' &&
      t.start &&
      t.start <= on &&
      ((t.end_precision === 'day' && t.end && on < t.end) ||
        (t.end_precision === 'open' && on <= t.observed_through)),
  );
  return {
    status: terms.length
      ? terms.length > detail.capacity
        ? 'conflicting'
        : 'historical'
      : 'unknown',
    members: terms.map((t) => ({
      person_id: t.person_id,
      party:
        t.party_periods.find(
          (p) => p.start && p.start <= on && (!p.end || on < p.end),
        )?.party ?? null,
    })),
    asOf: on,
  };
}
export interface DivisionRow {
  key: string;
  billKey: string;
  title: string;
  /** The division's own title: its recorded stage (D5), or null. */
  stage: string | null;
  date: string;
  house: string;
  question: string;
  ayes: number;
  noes: number;
  outcome: string;
}
export function divisionRows(bills: BillDetail[]): DivisionRow[] {
  const rows = bills.flatMap((b) =>
    billDedupeDivisions(b.divisions, b).divisions.map((d) => ({
      key: `${b.key}:${d.key}`,
      billKey: b.key,
      title: billName(b),
      stage: d.title?.trim() || stageTitle(d.stage),
      date: d.date,
      house: d.house,
      question: billQuestionParts(d, b).head || billStage(d.stage),
      ayes: d.ayes,
      noes: d.noes,
      outcome: d.outcome,
    })),
  );
  return rows.sort(
    (a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key),
  );
}
