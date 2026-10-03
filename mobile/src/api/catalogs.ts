import type { ApiClient, RecordResult } from './client';
import { ApiError } from './errors';
import type { CatalogKind } from './policy';
export interface RosterPerson {
  name: string;
  pid?: string;
  party?: string | null;
  party_now?: string;
  current?: boolean;
  representation?: {
    jurisdiction: string;
    chamber: string;
    electorate: string;
    state?: string;
    basis?: string;
  }[];
}
export interface Roster {
  meta: { generated: string };
  people: RosterPerson[];
}
export interface Slugs {
  generated: string;
  slugs: Record<string, string>;
}
export interface Source {
  source_id: string;
  label: string;
  url: string;
  fetched_at?: string;
  licence?: string;
}
export interface Manifest {
  release_id: string;
  generated: string;
  index_url: string;
  people_url: string;
  sources: Source[];
}
export interface SeatObservation {
  electorate_id: string;
  name: string;
  current: boolean;
  as_of: string | null;
  party: string | null;
  jurisdiction: string;
  chamber: string;
  url: string;
}
export interface ElectoratePerson {
  person_id: string;
  legacy_person_id?: string;
  name: string;
  aliases: string[];
  electorates: SeatObservation[];
  sources: string[];
  source_url?: string | null;
}
export interface PeopleCatalog {
  meta: { generated: string; release_id: string };
  people: ElectoratePerson[];
}
export interface Electorate {
  electorate_id: string;
  name: string;
  slug: string;
  detail_url: string;
  representation_as_of: string | null;
  representation_status: string;
  representatives: { party: string | null; person: ElectoratePerson }[];
}
export interface ElectorateIndex {
  meta: { generated: string; release_id: string };
  electorates: Electorate[];
}
export interface CatalogRecord {
  kind: string;
  title: string;
  href: string;
  snippet: string;
  slug: string;
  resource: string;
  source?: string;
  url?: string;
  personSlug?: string;
}
export interface SearchPage {
  query: string;
  kind: string;
  results: CatalogRecord[];
  total: number;
  page: number;
  per_page: number;
  warnings: string[];
  coverage?: string;
}
export interface Bill {
  key: string;
  title: string;
  jurisdiction: string;
  introduced: string | null;
  status: string;
  has_summary: boolean;
}
export interface BillIndex {
  generated_at: string;
  bills: Bill[];
}
export interface BillDetail {
  key: string;
  title: string;
  [key: string]: unknown;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(
      'invalid-data',
      'The catalog response could not be read.',
    );
  return value as Record<string, unknown>;
}
function list<T>(
  value: unknown,
  key: string,
  valid: (row: Record<string, unknown>) => boolean,
): T {
  const data = object(value);
  if (
    !Array.isArray(data[key]) ||
    !(data[key] as unknown[]).every((row) => valid(object(row)))
  )
    throw new ApiError(
      'invalid-data',
      'The catalog response could not be read.',
    );
  return data as T;
}
export const decodeRoster = (value: unknown) => {
  const data = list<Roster>(
    value,
    'people',
    (row) =>
      typeof row.name === 'string' &&
      (row.party === undefined ||
        row.party === null ||
        typeof row.party === 'string'),
  );
  if (typeof object(data.meta).generated !== 'string')
    throw new ApiError('invalid-data', 'The roster date is missing.');
  return data;
};
export const decodePeople = (value: unknown) => {
  const data = list<PeopleCatalog>(
    value,
    'people',
    (row) =>
      typeof row.person_id === 'string' &&
      typeof row.name === 'string' &&
      Array.isArray(row.electorates) &&
      Array.isArray(row.sources) &&
      Array.isArray(row.aliases) &&
      row.aliases.every((alias) => typeof alias === 'string') &&
      row.sources.every((source) => typeof source === 'string') &&
      row.electorates.every((item) => {
        const seat = object(item);
        return (
          typeof seat.electorate_id === 'string' &&
          typeof seat.name === 'string' &&
          typeof seat.current === 'boolean' &&
          (seat.as_of === null || typeof seat.as_of === 'string') &&
          (seat.party === null || typeof seat.party === 'string') &&
          typeof seat.jurisdiction === 'string' &&
          typeof seat.chamber === 'string'
        );
      }),
  );
  if (
    typeof object(data.meta).generated !== 'string' ||
    !/^[a-f0-9]{16}$/.test(String(data.meta.release_id))
  )
    throw new ApiError(
      'invalid-data',
      'The person release metadata is missing.',
    );
  return data;
};
export function decodeManifest(value: unknown): Manifest {
  const data = object(value);
  if (
    typeof data.release_id !== 'string' ||
    !/^[a-f0-9]{16}$/.test(data.release_id) ||
    data.index_url !== `/electorates/releases/${data.release_id}/index.json` ||
    data.people_url !==
      `/electorates/releases/${data.release_id}/people.json` ||
    !Array.isArray(data.sources) ||
    !data.sources.every((item) => {
      const source = object(item);
      return (
        typeof source.source_id === 'string' &&
        typeof source.label === 'string' &&
        typeof source.url === 'string' &&
        source.url.startsWith('https://')
      );
    }) ||
    typeof data.generated !== 'string'
  )
    throw new ApiError(
      'invalid-data',
      'The electorate release could not be read.',
    );
  return data as unknown as Manifest;
}
export function decodeSlugs(value: unknown): Slugs {
  const data = object(value);
  const slugs = object(data.slugs);
  if (!Object.values(slugs).every((name) => typeof name === 'string'))
    throw new ApiError(
      'invalid-data',
      'The person directory could not be read.',
    );
  return data as unknown as Slugs;
}
export const decodeSearch = (value: unknown) =>
  list<SearchPage>(
    value,
    'results',
    (row) =>
      typeof row.title === 'string' &&
      typeof row.slug === 'string' &&
      typeof row.kind === 'string',
  );
export class Catalogs {
  constructor(private client: ApiClient) {}
  roster() {
    return this.client.get('/parliamentarians.json', decodeRoster);
  }
  slugs() {
    return this.client.get('/api/person-slugs', decodeSlugs);
  }
  manifest() {
    return this.client.get('/electorates/manifest.json', decodeManifest);
  }
  people(manifest: Manifest) {
    return this.client.get(manifest.people_url, decodePeople);
  }
  electorates(manifest: Manifest) {
    return this.client.get(manifest.index_url, (value) =>
      list<ElectorateIndex>(
        value,
        'electorates',
        (row) =>
          typeof row.electorate_id === 'string' && typeof row.name === 'string',
      ),
    );
  }
  electorate(path: string) {
    return this.client.get(path, object);
  }
  bills() {
    return this.client.get('/bills/index.json', (value) =>
      list<BillIndex>(
        value,
        'bills',
        (row) => typeof row.key === 'string' && typeof row.title === 'string',
      ),
    );
  }
  bill(key: string) {
    return this.client.get(
      `/bills/${key}.json`,
      (value) => object(value) as BillDetail,
    );
  }
  async search(query: string, kind: CatalogKind = 'person', page = 1) {
    const params = new URLSearchParams({
      q: query,
      kind,
      page: String(page),
      per: '20',
    });
    const pending = this.client.get(`/api/search-all?${params}`, decodeSearch);
    if (kind !== 'person') return pending;
    const [result, slugs] = await Promise.all([pending, this.slugs()]);
    return {
      ...result,
      stale: result.stale || slugs.stale,
      savedAt: Math.min(result.savedAt, slugs.savedAt),
      data: {
        ...result.data,
        results: result.data.results.map((row) => ({
          ...row,
          personSlug: personSlugForResult(row, slugs.data),
        })),
      },
    };
  }
  async person(slug: string): Promise<RecordResult<PersonProfile>> {
    const [slugs, roster, manifest] = await Promise.all([
      this.slugs(),
      this.roster(),
      this.manifest(),
    ]);
    const people = await this.people(manifest.data);
    if (people.data.meta.release_id !== manifest.data.release_id)
      throw new ApiError(
        'invalid-data',
        'The electorate release is incomplete. Try again.',
      );
    return {
      data: joinPerson(
        slug,
        slugs.data,
        roster.data,
        people.data,
        manifest.data,
      ),
      stale: [slugs, roster, manifest, people].some((record) => record.stale),
      savedAt: Math.min(
        slugs.savedAt,
        roster.savedAt,
        manifest.savedAt,
        people.savedAt,
      ),
      asOf: people.asOf ?? manifest.asOf,
    };
  }
}
export interface PersonProfile {
  slug: string;
  name: string;
  canonicalPersonId?: string;
  legacyPersonId?: string;
  party: string | null;
  seats: SeatObservation[];
  sources: Source[];
  asOf: string;
}
const folded = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[’']/g, '');
// Catalog `slug` is an opaque catalog-N record ID, not a person slug. The href
// carries a canonical slug or legacy encoded name; join it through person-slugs.
export function personSlugForResult(
  row: CatalogRecord,
  slugs: Slugs,
): string | undefined {
  if (row.kind !== 'person') return undefined;
  const match = /^\/subject\/person\/([^/?#]+)$/.exec(row.href);
  if (!match?.[1]) return undefined;
  let segment: string;
  try {
    segment = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
  if (slugs.slugs[segment]) return segment;
  const matches = Object.entries(slugs.slugs).filter(
    ([, name]) => folded(name) === folded(segment),
  );
  return matches.length === 1 ? matches[0]![0] : undefined;
}
export function joinPerson(
  slug: string,
  slugs: Slugs,
  roster: Roster,
  people: PeopleCatalog,
  manifest: Manifest,
): PersonProfile {
  const name = slugs.slugs[slug];
  if (!name)
    throw new ApiError(
      'not-found',
      'This person is not in the public directory.',
    );
  const row = roster.people.find((p) => folded(p.name) === folded(name));
  const matches = people.people.filter(
    (p) =>
      (row?.pid && p.legacy_person_id === row.pid) ||
      [p.name, ...p.aliases].some((alias) => folded(alias) === folded(name)),
  );
  if (matches.length > 1)
    throw new ApiError(
      'invalid-data',
      'The person identity needs review before this record can be shown.',
    );
  const person = matches[0];
  const seats = person?.electorates.filter((seat) => seat.current) ?? [];
  // The roster's recorded affiliations are historical, not a current-seat fallback.
  const sources = manifest.sources.filter((source) =>
    person?.sources.includes(source.source_id),
  );
  return {
    slug,
    name,
    canonicalPersonId: person?.person_id,
    legacyPersonId: person?.legacy_person_id ?? row?.pid,
    party: seats[0]?.party ?? row?.party_now ?? row?.party ?? null,
    seats,
    sources,
    asOf: seats[0]?.as_of ?? roster.meta.generated,
  };
}
