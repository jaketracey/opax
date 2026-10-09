import type {
  BillDetail,
  Electorate,
  ElectorateDetail,
  Roster,
  Votes,
} from '../../api/catalog-decoders';
import type { PersonProfile } from '../../api/person-identity';
import { rosterChambersFor } from '../../api/person-identity';
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
import { chamberName, jurisdictionName } from '../../design/parliament';
import type { PartyFile } from './party-file';
import { stageTitle } from '../bills/divisions';

export type DirectoryKind = 'person' | 'party' | 'electorate';
export type Filters = Record<string, string>;
export interface Choice {
  value: string;
  label: string;
}
export interface Facet {
  key: string;
  label: string;
  choices?: Choice[];
}
export interface PeopleRow {
  key: string;
  name: string;
  profile: PersonProfile;
  row: Roster['people'][number] | undefined;
  parties: string[];
  states: string[];
  chambers: string[];
  divisions: number;
  portrait: boolean;
  text: string;
  sortName: string;
}
export function peopleRows(
  d: Directory,
  votes: Votes,
  portraits: ReturnType<typeof buildPortraitIndex>,
): PeopleRow[] {
  const named = new Map<string, Roster['people']>();
  for (const row of d.roster.data.people) {
    const key = nameKey(row.name);
    named.set(key, [...(named.get(key) ?? []), row]);
  }
  const release = new Map(d.people.data.people.map((p) => [p.person_id, p]));
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
    const states = [
      ...new Set([
        ...(row?.states ?? []),
        ...(row?.representation ?? []).map((r) => r.jurisdiction),
        ...(person?.electorates ?? []).map((s) => s.jurisdiction),
      ]),
    ];
    const chambers = [
      ...new Set([
        ...(row?.chambers ?? []).filter((c) => c !== 'senate_committee'),
        ...(row?.representation ?? []).map((r) => r.chamber),
        ...(person?.electorates ?? []).map((s) => s.chamber),
      ]),
    ].filter((c) => c !== 'senate_committee');
    const parties = [
      ...new Set(
        [row?.party, ...(row?.parties ?? [])].filter((p): p is string => !!p),
      ),
    ];
    out.push({
      key,
      name: profile.name,
      profile,
      row,
      parties,
      states,
      chambers,
      divisions: safe ? records.reduce((n, r) => n + r.divisions_total, 0) : 0,
      portrait: portraits.portraits.has(key),
      text: billFoldText(
        [
          profile.name,
          row?.full,
          ...parties,
          ...states.map((s) => jurisdictionName(s) ?? s),
        ].join(' '),
      ),
      sortName: `${profile.name.toLowerCase().split(' ').at(-1)} ${profile.name.toLowerCase()}`,
    });
  }
  return out;
}
/**
 * Sitting members first, then those the data cannot date, then former
 * members; the chosen sort applies within each group. The group is the
 * party chip's status, so a "Formerly" chip is always under Former.
 */
export type SittingGroup = 'sitting' | 'unrecorded' | 'former';
export const sittingGroupTitles: Record<SittingGroup, string> = {
  sitting: 'Sitting',
  unrecorded: 'Sitting status not recorded',
  former: 'Former',
};
const groupRank: Record<SittingGroup, number> = {
  sitting: 0,
  unrecorded: 1,
  former: 2,
};
export function sittingGroup(p: PeopleRow): SittingGroup {
  const status = p.profile.partyStatus;
  return status === 'current'
    ? 'sitting'
    : status === 'former'
      ? 'former'
      : 'unrecorded';
}
/** The first row of each group, with the group's size, for its heading. */
export function sittingGroupStarts(rows: PeopleRow[]) {
  const starts = new Map<string, { group: SittingGroup; count: number }>();
  let first: string | undefined;
  rows.forEach((row, index) => {
    const group = sittingGroup(row);
    if (index === 0 || group !== sittingGroup(rows[index - 1]!)) {
      first = row.key;
      starts.set(first, { group, count: 0 });
    }
    starts.get(first!)!.count += 1;
  });
  return starts;
}
export function matchingPeople(rows: PeopleRow[], f: Filters, query: string) {
  return rows
    .filter(
      (p) =>
        matches(p.text, query) &&
        (!f.party ||
          (f.party === 'none'
            ? !p.parties.length
            : p.parties.includes(f.party))) &&
        (!f.state || p.states.includes(f.state)) &&
        (!f.chamber || p.chambers.includes(f.chamber)) &&
        (!f.votes || p.divisions > 0) &&
        (!f.photo || p.portrait),
    )
    .sort((a, b) => {
      const group = groupRank[sittingGroup(a)] - groupRank[sittingGroup(b)];
      if (group) return group;
      if (f.sort === 'name') return a.sortName.localeCompare(b.sortName);
      if (f.sort === 'recent')
        return (
          (b.row?.last ?? 0) - (a.row?.last ?? 0) ||
          (b.row?.speeches ?? 0) - (a.row?.speeches ?? 0) ||
          a.sortName.localeCompare(b.sortName)
        );
      return (
        (f.sort === 'divisions'
          ? b.divisions - a.divisions
          : (b.row?.speeches ?? 0) - (a.row?.speeches ?? 0)) ||
        a.sortName.localeCompare(b.sortName)
      );
    });
}
export interface PartyRow {
  key: string;
  name: string;
  speeches: number;
  members: number;
  money: Record<string, { total: number; source: string; asAt: string }>;
  total: number;
}
export function partyRows(
  roster: Roster,
  files: Record<string, PartyFile>,
): PartyRow[] {
  const rows = new Map<string, PartyRow>();
  const get = (name: string) => {
    let p = rows.get(name);
    if (!p)
      rows.set(
        name,
        (p = { key: name, name, speeches: 0, members: 0, money: {}, total: 0 }),
      );
    return p;
  };
  for (const [jur, file] of Object.entries(files))
    for (const n of file.parties)
      get(n.label).money[jur] = {
        total: n.total,
        source:
          file.meta.sourceShort ??
          (jur === 'federal' ? 'AEC returns' : jur.toUpperCase()),
        asAt: file.meta.generated,
      };
  for (const p of roster.people)
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
      r.members++;
      r.speeches += p.speeches ?? 0;
    }
  for (const p of rows.values())
    p.total =
      p.money.federal?.total ??
      Math.max(0, ...Object.values(p.money).map((m) => m.total));
  return [...rows.values()];
}
export function matchingParties(rows: PartyRow[], f: Filters, query: string) {
  const receipts = (p: PartyRow) =>
    f.jur ? (p.money[f.jur]?.total ?? 0) : p.total;
  return rows
    .filter(
      (p) =>
        matches(billFoldText(p.name), query) &&
        (!f.jur || !!p.money[f.jur]) &&
        (!f.show ||
          (f.show === 'speeches'
            ? p.speeches > 0
            : f.show === 'members'
              ? p.members > 0
              : Object.keys(p.money).length > 0)),
    )
    .sort(
      (a, b) =>
        (f.sort === 'name'
          ? 0
          : f.sort === 'donations'
            ? receipts(b) - receipts(a)
            : f.sort === 'members'
              ? b.members - a.members
              : b.speeches - a.speeches) ||
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
}
export function matchingElectorates(
  rows: Electorate[],
  f: Filters,
  query: string,
) {
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
              chamberName(e.chamber, e.jurisdiction),
              ...e.representatives.flatMap((r) => [r.person.name, r.party]),
            ].join(' '),
          ),
          query,
        ) &&
        (!f.jur || e.jurisdiction === f.jur) &&
        (!f.chamber || e.chamber === f.chamber) &&
        (!f.state || e.state_code === f.state) &&
        (!f.status || e.status === f.status) &&
        (!f.party || e.representatives.some((r) => r.party === f.party)) &&
        (!f.results || (e.election_count ?? 0) > 0),
    )
    .sort(
      (a, b) =>
        (f.sort === 'elections'
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
  label: (s: string) => string = (s) => s,
): Choice[] =>
  [...new Set(values)].sort().map((value) => ({ value, label: label(value) }));
export function peopleFacets(rows: PeopleRow[]): Facet[] {
  return [
    {
      key: 'party',
      label: 'Party',
      choices: [
        ...choices(rows.flatMap((p) => p.parties)),
        { value: 'none', label: 'No party recorded' },
      ],
    },
    {
      key: 'state',
      label: 'Parliament',
      choices: choices(
        rows.flatMap((p) => p.states),
        (s) => jurisdictionName(s) ?? s,
      ),
    },
    {
      key: 'chamber',
      label: 'Chamber',
      choices: choices(
        rows.flatMap((p) => p.chambers),
        (s) => chamberName(s, 'federal') ?? s,
      ),
    },
    { key: 'votes', label: 'Voting record' },
    { key: 'photo', label: 'Portrait' },
  ];
}
export const partyFacets: Facet[] = [
  {
    key: 'jur',
    label: 'Disclosures',
    choices: [
      { value: 'federal', label: 'Federal (AEC)' },
      { value: 'qld', label: 'Queensland (ECQ)' },
      { value: 'vic', label: 'Victoria (VEC)' },
    ],
  },
  {
    key: 'show',
    label: 'Show',
    choices: [
      { value: 'speeches', label: 'With speeches in the record' },
      { value: 'members', label: 'With members in the directory' },
      { value: 'money', label: 'With disclosed receipts' },
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
        (s) => jurisdictionName(s) ?? s,
      ),
    },
    {
      key: 'chamber',
      label: 'Chamber',
      choices: choices(
        rows.map((e) => e.chamber),
        (s) => chamberName(s, 'federal') ?? s,
      ),
    },
    {
      key: 'state',
      label: 'State',
      choices: choices(
        rows.map((e) => e.state_code),
        (s) => jurisdictionName(s) ?? s,
      ),
    },
    {
      key: 'status',
      label: 'Status',
      choices: [
        { value: 'current', label: 'Current' },
        { value: 'historical', label: 'Historical' },
      ],
    },
    {
      key: 'party',
      label: 'Party at latest check',
      choices: choices(
        rows.flatMap((e) =>
          e.representatives.flatMap((r) => (r.party ? [r.party] : [])),
        ),
      ),
    },
    { key: 'results', label: 'With election results' },
  ];
}
export const directorySorts: Record<DirectoryKind, Choice[]> = {
  person: [
    { value: 'speeches', label: 'Most speeches' },
    { value: 'name', label: 'Name A–Z' },
    { value: 'recent', label: 'Most recent' },
    { value: 'divisions', label: 'Most divisions' },
  ],
  party: [
    { value: 'speeches', label: 'Most speeches' },
    { value: 'donations', label: 'Most disclosed receipts' },
    { value: 'members', label: 'Most members' },
    { value: 'name', label: 'Name A–Z' },
  ],
  electorate: [
    { value: 'name', label: 'Name A–Z' },
    { value: 'elections', label: 'Most elections indexed' },
  ],
};
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
