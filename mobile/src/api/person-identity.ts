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
function firstNamesSharePrefix(a: string, b: string) {
  const left = folded(a.trim().split(/\s+/)[0] ?? '');
  const right = folded(b.trim().split(/\s+/)[0] ?? '');
  return (
    !!left && !!right && (left.startsWith(right) || right.startsWith(left))
  );
}
export function namedRosterRow(names: string[], roster: Roster) {
  for (const name of names) {
    const row = roster.people.find((r) => folded(r.name) === folded(name));
    if (row) return row;
  }
  return undefined;
}
export function rosterRowFor(names: string[], roster: Roster, id?: RosterId) {
  const rows = id ? roster.people.filter((r) => r.pid === id) : [];
  // A unique legacy ID is authoritative even when the register uses a formal
  // name. Multi-row IDs commonly include a surname stub: prefer the matching
  // full-name row, then a sole full-name row; never select a stub by file order.
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) {
    const full = rows.filter((r) => r.name.trim().includes(' '));
    const named = namedRosterRow(names, { ...roster, people: full });
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
    const direct = Object.entries(slugs.slugs).filter(
      ([, n]) => folded(n) === folded(name),
    );
    const directSlug =
      direct.length === 1 ? personSlug(direct[0]![0]) : undefined;
    if (row.kind !== 'interest' || !interests || !people) return directSlug;
    // Prefer the register's ID bridge even if a historical spelling has its
    // own directory slug (Patrick Conaghan and current Pat Conaghan).
    const keys = [
      ...new Set([
        ...nameValues(interests._by_name, [name]),
        ...Object.entries(interests.people)
          .filter(([, r]) => nameKey(r.name) === nameKey(name))
          .map(([id]) => id),
      ]),
    ];
    if (!keys.length) return directSlug;
    const numeric = keys.filter((id) => /^\d+$/.test(id));
    const ids = numeric.length ? numeric : keys;
    if (ids.length !== 1) return undefined;
    const indexNames = Object.entries(interests._by_name)
      .filter(([, id]) => id === ids[0])
      .map(([name]) => name);
    let persons = people.people.filter((p) =>
      numeric.length
        ? p.legacy_person_id === ids[0]
        : [p.name, ...p.aliases].some((n) =>
            indexNames.some((a) => folded(a) === folded(n)),
          ),
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
      const resolved = Object.entries(slugs.slugs).filter(
        ([, n]) => folded(name) === folded(n),
      );
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
export function joinPerson(
  slug: string,
  slugs: Slugs,
  roster: Roster,
  people: PeopleCatalog,
  manifest: Manifest,
): PersonProfile {
  const name = slugs.slugs[slug];
  if (!Object.hasOwn(slugs.slugs, slug) || typeof name !== 'string')
    throw new ApiError(
      'not-found',
      'This person is not in the public directory.',
    );
  const named = namedRosterRow([name], roster);
  const byName = people.people.filter((p) =>
    [p.name, ...p.aliases].some((alias) => folded(alias) === folded(name)),
  );
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
  const byId = id ? people.people.filter((p) => p.legacy_person_id === id) : [];
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
      !firstNamesSharePrefix(named.name, release.name))
  ) {
    const seats = release.electorates;
    const incompatibleSeat = named.representation?.some(
      (r) =>
        !seats.some(
          (s) =>
            s.jurisdiction === r.jurisdiction &&
            s.chamber === r.chamber &&
            folded(s.name) === folded(r.electorate),
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
    : people.people.filter(
        (p) =>
          (row?.pid && p.legacy_person_id === row.pid) ||
          [p.name, ...p.aliases].some(
            (alias) => folded(alias) === folded(name),
          ),
      );
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
