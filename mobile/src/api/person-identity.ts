import {
  personSlug,
  legacyPersonId,
  nameKey,
  nameValues,
  type PersonSlug,
  type PersonId,
  type LegacyPersonId,
  type RosterId,
} from './ids';
import { ApiError, PersonIdentityError } from './errors';
import { personPartyFor, type PartyStatus } from './party-transforms';
import type {
  Roster,
  Slugs,
  PeopleCatalog,
  Manifest,
  Source,
  SeatObservation,
  CatalogRecord,
  InterestIndex,
} from './catalog-decoders';
export interface PersonProfile {
  slug: PersonSlug;
  name: string;
  canonicalPersonId?: PersonId;
  legacyPersonId?: LegacyPersonId;
  rosterPersonId?: RosterId;
  party: string | null;
  /**
   * "current" for a current seat or an explicitly current roster observation;
   * "former" only when dated data or the roster says so; otherwise "unknown".
   */
  partyStatus: PartyStatus;
  rosterParty: string | null;
  formerly: string | null;
  seats: SeatObservation[];
  /** Resolved alongside the dated identity; callers must not repeat an ID join. */
  rosterRow?: Roster['people'][number];
  sources: Source[];
  asOf: string;
}
const folded = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[’‘ʼ`']/g, '');
// Object identity is the immutable decoded catalog version (see ApiClient).
// New bytes get new indexes; weak keys let evicted snapshots and joins go away.
function memoFold() {
  const names = new Map<string, string>();
  return (name: string) => {
    let key = names.get(name);
    if (key === undefined) names.set(name, (key = folded(name)));
    return key;
  };
}
function append<T>(map: Map<string, T[]>, key: string, value: T) {
  const rows = map.get(key);
  if (rows) rows.push(value);
  else map.set(key, [value]);
}
type RosterRow = Roster['people'][number];
type Person = PeopleCatalog['people'][number];
function indexRoster(roster: Roster) {
  const fold = memoFold();
  const names = new Map<string, RosterRow[]>();
  const ids = new Map<string, RosterRow[]>();
  const fullNamesById = new Map<string, Map<string, RosterRow[]>>();
  for (const row of roster.people) {
    append(names, fold(row.name), row);
    if (row.pid) {
      append(ids, row.pid, row);
      if (row.name.trim().includes(' ')) {
        let full = fullNamesById.get(row.pid);
        if (!full) fullNamesById.set(row.pid, (full = new Map()));
        append(full, fold(row.name), row);
      }
    }
  }
  return { fold, names, ids, fullNamesById };
}
function indexPeople(people: PeopleCatalog) {
  const fold = memoFold();
  const names = new Map<string, Person[]>();
  const ids = new Map<string, Person[]>();
  const order = new Map<Person, number>();
  people.people.forEach((person, i) => {
    order.set(person, i);
    // filter/some returned each row once, even with duplicate aliases.
    for (const name of new Set([person.name, ...person.aliases].map(fold)))
      append(names, name, person);
    if (person.legacy_person_id) append(ids, person.legacy_person_id, person);
  });
  return { fold, names, ids, order };
}
function indexSlugs(slugs: Slugs) {
  const fold = memoFold();
  const names = new Map<string, [string, string][]>();
  for (const entry of Object.entries(slugs.slugs))
    append(names, fold(entry[1]), entry);
  return { fold, names };
}
function snapshotIndex<K extends object, V>(build: (key: K) => V) {
  const versions = new WeakMap<K, V>();
  return (key: K) => {
    let value = versions.get(key);
    if (!value) versions.set(key, (value = build(key)));
    return value;
  };
}
const rosterIndex = snapshotIndex(indexRoster);
const peopleIndex = snapshotIndex(indexPeople);
const slugIndex = snapshotIndex(indexSlugs);
const interestIdentityIndex = snapshotIndex((interests: InterestIndex) => {
  const peopleNames = new Map<string, string[]>();
  const namesById = new Map<string, string[]>();
  for (const [id, person] of Object.entries(interests.people))
    append(peopleNames, nameKey(person.name), id);
  for (const [name, id] of Object.entries(interests._by_name))
    append(namesById, id, name);
  return { peopleNames, namesById };
});
const joinedSnapshots = new WeakMap<
  Slugs,
  WeakMap<
    Roster,
    WeakMap<
      PeopleCatalog,
      WeakMap<Manifest, Map<string, PersonProfile | PersonIdentityError>>
    >
  >
>();
function joinedProfiles(
  slugs: Slugs,
  roster: Roster,
  people: PeopleCatalog,
  manifest: Manifest,
) {
  let rosters = joinedSnapshots.get(slugs);
  if (!rosters) joinedSnapshots.set(slugs, (rosters = new WeakMap()));
  let releases = rosters.get(roster);
  if (!releases) rosters.set(roster, (releases = new WeakMap()));
  let manifests = releases.get(people);
  if (!manifests) releases.set(people, (manifests = new WeakMap()));
  let profiles = manifests.get(manifest);
  if (!profiles) manifests.set(manifest, (profiles = new Map()));
  return profiles;
}
function firstNamesSharePrefix(
  a: string,
  b: string,
  fold: (name: string) => string,
) {
  const left = fold(a.trim().split(/\s+/)[0] ?? '');
  const right = fold(b.trim().split(/\s+/)[0] ?? '');
  return (
    !!left && !!right && (left.startsWith(right) || right.startsWith(left))
  );
}
export function namedRosterRow(names: string[], roster: Roster) {
  const index = rosterIndex(roster);
  for (const name of names) {
    const row = index.names.get(index.fold(name))?.[0];
    if (row) return row;
  }
  return undefined;
}
export function rosterRowFor(names: string[], roster: Roster, id?: RosterId) {
  const index = rosterIndex(roster);
  const rows = id ? (index.ids.get(id) ?? []) : [];
  // A unique legacy ID is authoritative even when the register uses a formal
  // name. Multi-row IDs commonly include a surname stub: prefer the matching
  // full-name row, then a sole full-name row; never select a stub by file order.
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) {
    const full = rows.filter((r) => r.name.trim().includes(' '));
    const fullNames = index.fullNamesById.get(id!);
    const named = names
      .map((name) => fullNames?.get(index.fold(name))?.[0])
      .find(Boolean);
    if (named) return named;
    if (full.length === 1) return full[0];
    throw new PersonIdentityError('The roster identity needs review.');
  }
  return namedRosterRow(names, roster);
}
export function numericPersonId(id?: RosterId, row?: Roster['people'][number]) {
  const numeric = [id, row?.pid].find((v) => v && /^\d+$/.test(v));
  return numeric ? legacyPersonId(numeric) : undefined;
}
// Catalog `slug` is an opaque catalog-N record ID, not a person slug. The href
// carries a canonical slug or legacy encoded name; join it through person-slugs.
export function personSlugForResult(
  row: CatalogRecord,
  slugs: Slugs,
  interests?: InterestIndex,
  people?: PeopleCatalog,
): PersonSlug | undefined {
  if (!['person', 'pay', 'expense', 'interest'].includes(row.kind))
    return undefined;
  const resolveName = (name: string): PersonSlug | undefined => {
    const index = slugIndex(slugs);
    const direct = index.names.get(index.fold(name)) ?? [];
    const directSlug =
      direct.length === 1 ? personSlug(direct[0]![0]) : undefined;
    if (row.kind !== 'interest' || !interests || !people) return directSlug;
    // Prefer the register's ID bridge even if a historical spelling has its
    // own directory slug (Patrick Conaghan and current Pat Conaghan).
    const interestIndex = interestIdentityIndex(interests);
    const keys = [
      ...new Set([
        ...nameValues(interests._by_name, [name]),
        ...(interestIndex.peopleNames.get(nameKey(name)) ?? []),
      ]),
    ];
    if (!keys.length) return directSlug;
    const numeric = keys.filter((id) => /^\d+$/.test(id));
    const ids = numeric.length ? numeric : keys;
    if (ids.length !== 1) return undefined;
    const indexNames = interestIndex.namesById.get(ids[0]!) ?? [];
    const personsIndex = peopleIndex(people);
    let persons = numeric.length
      ? (personsIndex.ids.get(ids[0]!) ?? [])
      : [
          ...new Set(
            indexNames.flatMap(
              (name) => personsIndex.names.get(personsIndex.fold(name)) ?? [],
            ),
          ),
        ].sort(
          (a, b) => personsIndex.order.get(a)! - personsIndex.order.get(b)!,
        );
    if (persons.length > 1) {
      const current = persons.filter((p) =>
        p.electorates.some((s) => s.current),
      );
      if (current.length === 1) persons = current;
    }
    if (!persons.length) return directSlug;
    if (persons.length !== 1) return undefined;
    for (const name of [persons[0]!.name, ...persons[0]!.aliases]) {
      const resolved = index.names.get(index.fold(name)) ?? [];
      if (resolved.length === 1) return personSlug(resolved[0]![0]);
    }
    return undefined;
  };
  if (row.href.startsWith('/declared?')) {
    const params = new URLSearchParams(
      row.href.slice('/declared?'.length).split('#')[0],
    );
    if (params.getAll('person').length !== 1) return undefined;
    const name = params.get('person');
    return name ? resolveName(name) : undefined;
  }
  const match =
    /^\/subject\/person\/([^/?#]+)(?:#person-(?:pay|expenses|interests))?$/.exec(
      row.href,
    );
  if (!match?.[1]) return undefined;
  let segment: string;
  try {
    segment = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
  if (Object.hasOwn(slugs.slugs, segment)) return personSlug(segment);
  return resolveName(segment);
}
/** The canonical-ID handoff used by Person and profile navigation. */
export function personSlugForId(
  id: PersonId,
  slugs: Slugs,
  roster: Roster,
  people: PeopleCatalog,
  manifest: Manifest,
) {
  const person = people.people.find((p) => p.person_id === id);
  const names = new Set(
    [person?.name, ...(person?.aliases ?? [])]
      .filter((name): name is string => !!name)
      .map(nameKey),
  );
  const resolved = Object.keys(slugs.slugs).filter((key) => {
    if (!names.has(nameKey(slugs.slugs[key]!))) return false;
    try {
      return (
        joinPerson(key, slugs, roster, people, manifest).canonicalPersonId ===
        id
      );
    } catch {
      return false;
    }
  });
  if (!resolved.length)
    throw new ApiError(
      'not-found',
      'This person is not in the public directory.',
    );
  return (
    resolved.find((key) => slugs.slugs[key] === person?.name) ?? resolved[0]!
  );
}
export function joinPerson(
  slug: string,
  slugs: Slugs,
  roster: Roster,
  people: PeopleCatalog,
  manifest: Manifest,
): PersonProfile {
  const profiles = joinedProfiles(slugs, roster, people, manifest);
  const cached = profiles.get(slug);
  if (cached instanceof PersonIdentityError) throw cached;
  if (cached) return cached;
  try {
    const profile = computePerson(slug, slugs, roster, people, manifest);
    Object.freeze(profile.seats);
    Object.freeze(profile.sources);
    Object.freeze(profile);
    profiles.set(slug, profile);
    return profile;
  } catch (error) {
    if (error instanceof PersonIdentityError) profiles.set(slug, error);
    throw error;
  }
}
function computePerson(
  slug: string,
  slugs: Slugs,
  roster: Roster,
  people: PeopleCatalog,
  manifest: Manifest,
): PersonProfile {
  const index = peopleIndex(people);
  const fold = index.fold;
  const name = slugs.slugs[slug];
  if (!Object.hasOwn(slugs.slugs, slug) || typeof name !== 'string')
    throw new ApiError(
      'not-found',
      'This person is not in the public directory.',
    );
  const named = namedRosterRow([name], roster);
  const byName = index.names.get(fold(name)) ?? [];
  const currentByName = byName.filter((p) =>
    p.electorates.some((s) => s.current),
  );
  let release =
    currentByName.length === 1
      ? currentByName[0]
      : byName.length === 1
        ? byName[0]
        : undefined;
  const id = release?.legacy_person_id ?? named?.pid;
  const byId = id ? (index.ids.get(id) ?? []) : [];
  const currentById = byId.filter((p) => p.electorates.some((s) => s.current));
  // Surname directory entries inherit their identity from the release's ID,
  // including a sole historical holder. Current observations take priority.
  if (!release) {
    if (currentById.length === 1) release = currentById[0];
    else if (byId.length === 1) release = byId[0];
  } else if (
    !currentByName.length &&
    currentById.some((p) => p.person_id !== release!.person_id)
  ) {
    throw new PersonIdentityError(
      'The person identity has conflicting roster observations.',
    );
  }
  // Surname stubs and unrelated first names need compatible representations.
  // Prefix-compatible full names can cover a person's earlier House term
  // even when the release records only their current Senate seat.
  if (
    release &&
    named &&
    (!named.name.trim().includes(' ') ||
      !firstNamesSharePrefix(named.name, release.name, fold))
  ) {
    const seats = release.electorates;
    const incompatibleSeat = named.representation?.some(
      (r) =>
        !seats.some(
          (s) =>
            s.jurisdiction === r.jurisdiction &&
            s.chamber === r.chamber &&
            fold(s.name) === fold(r.electorate),
        ),
    );
    // Committee appearances do not establish membership. A recorded federal
    // chamber does, even where this roster row has no seat observations.
    const incompatibleChamber = named.chambers?.some(
      (chamber) =>
        ['representatives', 'senate'].includes(chamber) &&
        !seats.some((s) => s.chamber === chamber),
    );
    if (incompatibleSeat || incompatibleChamber)
      throw new PersonIdentityError(
        'The person identity has conflicting roster observations.',
      );
  }
  const row = rosterRowFor(
    [
      release?.name ?? name,
      name,
      ...(release?.aliases ?? []),
      ...(named?.full ? [named.full] : []),
    ],
    roster,
    release?.legacy_person_id ?? named?.pid,
  );
  let matches = release
    ? [release]
    : [
        ...new Set([
          ...(row?.pid ? (index.ids.get(row.pid) ?? []) : []),
          ...byName,
        ]),
      ].sort((a, b) => index.order.get(a)! - index.order.get(b)!);
  if (matches.length > 1) {
    const current = matches.filter((p) => p.electorates.some((s) => s.current));
    if (current.length === 1) matches = current;
  }
  if (matches.length > 1)
    throw new PersonIdentityError(
      'The person identity needs review before this record can be shown.',
    );
  const person = matches[0];
  const observations = person?.electorates ?? [];
  const seats = observations.filter((seat) => seat.current);
  // The roster's recorded affiliations are historical, not a current-seat fallback.
  const sources = manifest.sources.filter((source) =>
    person?.sources.includes(source.source_id),
  );
  return {
    slug: personSlug(slug),
    name,
    canonicalPersonId: person?.person_id,
    legacyPersonId: numericPersonId(person?.legacy_person_id, row),
    rosterPersonId: person?.legacy_person_id ?? row?.pid,
    ...personPartyFor(
      observations,
      row,
      namedRosterRow(
        [person?.name ?? name, name, ...(person?.aliases ?? [])],
        roster,
      ),
    ),
    seats,
    rosterRow: row,
    sources,
    asOf: seats[0]?.as_of ?? roster.meta.generated,
  };
}

/** The same chamber-only identity guard used by Your MP and Search. */
export function rosterChambersFor(row: Roster['people'][number] | undefined) {
  if (
    !row?.name.trim().includes(' ') ||
    (!row.pid && row.chambers?.includes('senate_committee'))
  )
    return [];
  return (row.chambers ?? []).filter(
    (chamber) => chamber !== 'senate_committee',
  );
}
