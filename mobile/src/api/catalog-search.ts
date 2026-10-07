import type {
  CatalogRecord,
  Expenses,
  InterestDetail,
  Pay,
  PeopleCatalog,
  RecentInterests,
  Roster,
} from './catalog-decoders';
import { nameKey } from './ids';
import { joinPerson, personSlugForResult } from './person-identity';
import { fullPortraitName, type SearchIdentityCatalogs } from './selectors';
import { payPersonRecord } from './transforms';
import type { CatalogKind } from './policy';
import { isPartialCatalog } from './validation';

type MemberCatalogs = Partial<SearchIdentityCatalogs>;
const memberNames = new WeakMap<
  PeopleCatalog,
  Map<string, PeopleCatalog['people']>
>();
const rosterNames = new WeakMap<Roster, Map<string, Roster['people']>>();
function indexNames<T extends { name: string; aliases?: string[] }>(
  people: T[],
) {
  const index = new Map<string, T[]>();
  for (const person of people)
    for (const name of new Set(
      [person.name, ...(person.aliases ?? [])].map(nameKey),
    )) {
      const rows = index.get(name) ?? [];
      rows.push(person);
      index.set(name, rows);
    }
  return index;
}
function membersByName(people: PeopleCatalog) {
  let index = memberNames.get(people);
  if (!index) {
    index = indexNames(people.people);
    memberNames.set(people, index);
  }
  return index;
}

/** Only full names with one dated member identity may be offered as people. */
export function memberSlugFor(row: CatalogRecord, catalogs: MemberCatalogs) {
  const { roster, slugs, people, manifest } = catalogs;
  if (
    !roster ||
    !slugs ||
    !people ||
    !manifest ||
    [roster, slugs, people, manifest].some(isPartialCatalog) ||
    people.meta.release_id !== manifest.release_id ||
    !fullPortraitName(row.title)
  )
    return undefined;
  const slug = personSlugForResult(row, slugs);
  const name = slug && slugs.slugs[slug];
  if (!name || !fullPortraitName(name)) return undefined;
  const index = membersByName(people);
  const members = index.get(nameKey(name)) ?? [];
  const titles = index.get(nameKey(row.title)) ?? [];
  // Never pick the current observation to break a conflicting full-name tie.
  if (
    members.length !== 1 ||
    titles.length !== 1 ||
    titles[0]!.person_id !== members[0]!.person_id ||
    !members[0]!.electorates.some((seat) => seat.chamber !== 'senate_committee')
  )
    return undefined;
  let names = rosterNames.get(roster);
  if (!names) rosterNames.set(roster, (names = indexNames(roster.people)));
  const namedRows = names.get(nameKey(name)) ?? [];
  if (
    (namedRows.length > 1 &&
      (!namedRows[0]!.pid ||
        namedRows.some((p) => p.pid !== namedRows[0]!.pid))) ||
    namedRows.some(
      (p) =>
        p.pid &&
        members[0]!.legacy_person_id &&
        p.pid !== members[0]!.legacy_person_id,
    ) ||
    (namedRows.length > 0 &&
      namedRows.every(
        (p) =>
          !p.pid &&
          p.chambers?.length &&
          p.chambers.every((chamber) => chamber === 'senate_committee') &&
          !p.representation?.some(
            (seat) => seat.chamber !== 'senate_committee',
          ),
      ))
  )
    return undefined;
  try {
    const profile = joinPerson(slug!, slugs, roster, people, manifest);
    return profile.canonicalPersonId === members[0]!.person_id
      ? slug
      : undefined;
  } catch {
    return undefined;
  }
}

export function memberSearchRows(
  rows: CatalogRecord[],
  catalogs: MemberCatalogs,
) {
  return rows.filter(
    (row) => row.kind !== 'person' || memberSlugFor(row, catalogs),
  );
}

/** Search.tsx consumes this roster without needing a screen-specific guard. */
export function memberSuggestionRoster(
  roster: Roster,
  catalogs: MemberCatalogs,
): Roster {
  return {
    ...roster,
    people: roster.people.filter((person) =>
      memberSlugFor(
        {
          kind: 'person',
          title: person.name,
          href: '/subject/person/' + encodeURIComponent(person.name),
          slug: '',
          snippet: '',
          resource: '',
        },
        { ...catalogs, roster },
      ),
    ),
  };
}

// Offline fixture projection from pinned files. Same texts/hrefs as
// scripts/build_search_catalog.mjs; no production ranking or ARAG fallback.
export function catalogSearchRows(
  kind: Exclude<CatalogKind, 'person'>,
  data: {
    pay: Pay;
    expenses: Expenses;
    interests: InterestDetail[];
    recent: RecentInterests;
  },
): CatalogRecord[] {
  const rows: CatalogRecord[] = [];
  const href = (name: string) => '/subject/person/' + encodeURIComponent(name);
  const cash = (amount: number) =>
    amount.toLocaleString('en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
    });
  if (kind === 'pay') {
    for (const id of Object.keys(data.pay.people)) {
      const record = payPersonRecord(data.pay, id);
      if (record)
        rows.push({
          kind,
          title: record.title,
          href: record.href,
          snippet: record.snippet,
          slug: record.extra.slug,
          resource: '',
          source: record.extra.source,
          url: record.extra.url,
        });
    }
  } else if (kind === 'expense') {
    for (const [id, p] of Object.entries(data.expenses.people))
      rows.push({
        kind,
        title: `${p.name} — parliamentary expenses`,
        href: href(p.name),
        snippet: `${cash(p.total)} reported expenditure. ${p.by_category.map(([n, v]) => `${n}: ${cash(v)}`).join('; ')}.`,
        slug: 'expense-' + id,
        resource: '',
        source: 'Independent Parliamentary Expenses Authority',
        url: data.expenses.meta.source_url,
      });
  } else {
    for (const p of data.interests)
      for (const [category, bucket] of Object.entries(p.buckets))
        bucket.items.forEach((item, i) =>
          rows.push({
            kind,
            title: `${p.name} — ${category.replaceAll('_', ' ')}`,
            href: href(p.name),
            snippet: `${item.description}. ${item.holder}. ${item.kind}.`,
            slug: `${p.name}-${category}-${i}`,
            resource: '',
            source: 'Register of interests',
            url: p.source_url,
          }),
        );
    for (const item of data.recent.items)
      rows.push({
        kind,
        title: `${item.name} — ${item.kind}`,
        href: '/declared?person=' + encodeURIComponent(item.name),
        snippet: item.description,
        slug: 'interest-' + item.id,
        resource: '',
        source: 'Register alteration',
        url: item.url,
      });
  }
  return rows;
}
