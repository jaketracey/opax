import type {
  CatalogRecord,
  Expenses,
  InterestDetail,
  Pay,
  RecentInterests,
  Roster,
} from './catalog-decoders';
import { nameKey, type PersonId } from './ids';
import {
  joinPerson,
  personSlugForId,
  personSlugForResult,
} from './person-identity';
import {
  profileFor,
  type SearchIdentityCatalogs,
  type SuggestionRoster,
} from './selectors';
import { payPersonRecord } from './transforms';
import type { CatalogKind } from './policy';
import { isPartialCatalog } from './validation';

type MemberCatalogs = Partial<SearchIdentityCatalogs>;
type CompleteCatalogs = Required<SearchIdentityCatalogs>;
type Member = {
  id: PersonId;
  slug: string;
  name: string;
  aliases: string[];
  row: SuggestionRoster['people'][number];
};
// Cache only immutable catalog snapshots, just as joinPerson does.
const directories = new WeakMap<
  CompleteCatalogs['slugs'],
  WeakMap<
    Roster,
    WeakMap<
      CompleteCatalogs['people'],
      WeakMap<CompleteCatalogs['manifest'], Map<string, Member>>
    >
  >
>();
function memberDirectory(catalogs: MemberCatalogs) {
  const { roster, slugs, people, manifest } = catalogs;
  if (
    !roster ||
    !slugs ||
    !people ||
    !manifest ||
    [roster, slugs, people, manifest].some(isPartialCatalog) ||
    people.meta.release_id !== manifest.release_id
  )
    return new Map<string, Member>();
  let rosters = directories.get(slugs);
  if (!rosters) directories.set(slugs, (rosters = new WeakMap()));
  let releases = rosters.get(roster);
  if (!releases) rosters.set(roster, (releases = new WeakMap()));
  let manifests = releases.get(people);
  if (!manifests) releases.set(people, (manifests = new WeakMap()));
  let members = manifests.get(manifest);
  if (members) return members;
  members = new Map();
  const identities = new Map<PersonId, Member | null>();
  for (const slug of Object.keys(slugs.slugs)) {
    try {
      const profile = joinPerson(slug, slugs, roster, people, manifest);
      const id = profile.canonicalPersonId;
      if (!id) continue;
      if (!identities.has(id)) {
        identities.set(id, null);
        // Follow the same slug -> canonical ID -> native profile path as Person.
        const canonical = personSlugForId(id, slugs, roster, people, manifest);
        const native = profileFor(id, { roster, slugs, people, manifest })
          .blocks.identity.data!;
        const person = people.people.find((p) => p.person_id === id)!;
        identities.set(id, {
          id,
          slug: canonical,
          name: slugs.slugs[canonical]!,
          aliases: [person.name, ...person.aliases],
          row: {
            ...native.rosterRow,
            name: slugs.slugs[canonical]!,
            pid: native.rosterPersonId,
            party: native.rosterParty,
            aliases: [person.name, ...person.aliases],
          },
        });
      }
      const member = identities.get(id);
      if (member) members.set(slug, member);
    } catch {
      // Unresolved and ambiguous profile paths never become person entities.
    }
  }
  manifests.set(manifest, members);
  return members;
}
const personRow = (name: string): CatalogRecord => ({
  kind: 'person',
  title: name,
  href: '/subject/person/' + encodeURIComponent(name),
  slug: '',
  snippet: '',
  resource: '',
});
// Identity folding preserves hyphens: Stephen-Smith is not Stephen Smith.
const identityName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’‘ʼ`']/g, '');
/** Keep exactly one native identity established by the profile resolver. */
export function memberSlugFor(row: CatalogRecord, catalogs: MemberCatalogs) {
  if (!catalogs.slugs) return undefined;
  const members = memberDirectory(catalogs);
  const href = personSlugForResult(row, catalogs.slugs);
  const title = personSlugForResult(personRow(row.title), catalogs.slugs);
  const fromHref = href && members.get(href);
  const fromTitle = title && members.get(title);
  if (fromHref && fromTitle && fromHref.id !== fromTitle.id) return undefined;
  const member = fromTitle || fromHref;
  if (!member) return undefined;
  // A witness cannot borrow a member href. A formal name may use its explicit
  // catalog alias or the dated roster's full-name bridge; never infer a surname.
  if (
    !fromTitle &&
    !member.aliases.some(
      (name) => identityName(name) === identityName(row.title),
    )
  )
    return undefined;
  return member.slug;
}
export function memberSearchRows(
  rows: CatalogRecord[],
  catalogs: MemberCatalogs,
) {
  return rows.filter(
    (row) => row.kind !== 'person' || memberSlugFor(row, catalogs),
  );
}
/** Include native directory members missing from the compiled Hansard catalog. */
export function memberSearchResults(
  rows: CatalogRecord[],
  catalogs: MemberCatalogs,
  query: string,
) {
  const kept = memberSearchRows(rows, catalogs);
  const members = memberDirectory(catalogs);
  const seen = new Set(
    kept
      .filter((row) => row.kind === 'person')
      .map((row) => members.get(memberSlugFor(row, catalogs)!)?.id),
  );
  const words = nameKey(query).split(' ').filter(Boolean);
  if (!words.length) return kept;
  for (const member of new Set(members.values())) {
    if (
      seen.has(member.id) ||
      ![member.name, ...member.aliases].some((name) =>
        words.every((word) => nameKey(name).includes(word)),
      )
    )
      continue;
    const record = {
      ...personRow(member.name),
      href: `/subject/person/${member.slug}`,
      slug: member.id,
    };
    if (!memberSlugFor(record, catalogs)) continue;
    seen.add(member.id);
    kept.push(record);
  }
  return kept;
}
/** Search.tsx consumes this verified directory without a screen-specific guard. */
export function memberSuggestionRoster(
  roster: Roster,
  catalogs: MemberCatalogs,
): SuggestionRoster {
  return {
    ...roster,
    people: [...new Set(memberDirectory(catalogs).values())]
      .filter((member) =>
        memberSlugFor(
          { ...personRow(member.name), href: `/subject/person/${member.slug}` },
          catalogs,
        ),
      )
      .map((member) => member.row),
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
