import {
  Catalogs,
  personId,
  rosterId,
  type CatalogRecord,
  decodeRoster,
} from '../src/api/catalogs';
import {
  memberSearchRows,
  memberSuggestionRoster,
} from '../src/api/catalog-search';
import { suggestionsFor } from '../src/api/selectors';
import { partyMembers } from '../src/api/party-page';
import type { ApiClient, RecordResult } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import {
  bills,
  catalogs,
  index,
  manifest,
  people,
  roster,
  slugs,
} from './pinned';

const member = people.people.find((p) => p.name === 'Anthony Albanese')!;
const ambiguous = {
  ...member,
  name: 'Robin Example',
  aliases: [],
  legacy_person_id: rosterId('99991'),
  person_id: personId('person_000000000000000000000001'),
};
const fixtures = {
  ...catalogs,
  roster: {
    ...roster,
    people: [
      roster.people.find((p) => p.name === member.name)!,
      { name: 'Albanese', pid: member.legacy_person_id, party: null },
      { name: 'A Albanese', pid: member.legacy_person_id, party: null },
      { name: 'Casey Witness', chambers: ['senate_committee'], party: null },
      { name: ambiguous.name, pid: ambiguous.legacy_person_id, party: null },
      { name: 'Taylor Unresolved', party: null },
    ],
  },
  people: {
    ...people,
    people: [
      { ...member, aliases: ['Albanese', 'A Albanese'] },
      ambiguous,
      {
        ...ambiguous,
        person_id: personId('person_000000000000000000000002'),
        electorates: ambiguous.electorates.map((seat) => ({
          ...seat,
          current: false,
        })),
      },
    ],
  },
  slugs: {
    ...slugs,
    slugs: {
      'anthony-albanese': member.name,
      albanese: 'Albanese',
      'a-albanese': 'A Albanese',
      'casey-witness': 'Casey Witness',
      'robin-example': ambiguous.name,
      'taylor-unresolved': 'Taylor Unresolved',
    },
  },
};
const row = (name: string, kind = 'person'): CatalogRecord => ({
  kind,
  title: name,
  href: '/subject/person/' + encodeURIComponent(name),
  slug: 'catalog-' + name,
  snippet: '',
  resource: '',
});
const personRows = fixtures.roster.people.map((p) => row(p.name));

test('person search keeps a uniquely verified native member', () => {
  expect(memberSearchRows(personRows, fixtures)).toEqual([personRows[0]]);
  expect(
    memberSearchRows(
      [{ ...personRows[0]!, href: '/subject/person/anthony-albanese' }],
      fixtures,
    ),
  ).toHaveLength(1);
});
test.each(personRows.slice(1))('person search drops $title', (record) => {
  expect(memberSearchRows([record], fixtures)).toEqual([]);
});
test('a witness title cannot borrow a member href', () => {
  expect(
    memberSearchRows(
      [{ ...personRows[3]!, href: personRows[0]!.href }],
      fixtures,
    ),
  ).toEqual([]);
});
test.each(['bill', 'interest', 'pay', 'expense', 'electorate'])(
  'non-person %s records pass through unchanged without membership data',
  (kind) => {
    const record = row('Casey Witness', kind);
    expect(memberSearchRows([record], {})).toEqual([record]);
    expect(memberSearchRows([record], fixtures)[0]).toBe(record);
  },
);
test.each(['roster', 'people', 'slugs', 'manifest'] as const)(
  'missing %s fails closed for people',
  (key) => {
    expect(
      memberSearchRows(personRows, { ...fixtures, [key]: undefined }),
    ).toEqual([]);
  },
);
test('a different people release fails closed', () => {
  expect(
    memberSearchRows(personRows, {
      ...fixtures,
      manifest: { ...manifest, release_id: 'other' },
    }),
  ).toEqual([]);
});
test('a roster full-name conflict cannot be hidden by a unique people row', () => {
  expect(
    memberSearchRows([personRows[0]!], {
      ...fixtures,
      roster: {
        ...fixtures.roster,
        people: [
          fixtures.roster.people[0]!,
          { ...fixtures.roster.people[0]!, pid: rosterId('99992') },
        ],
      },
    }),
  ).toEqual([]);
});
test('a conflicting roster ID cannot borrow a member with the same name', () => {
  expect(
    memberSearchRows([personRows[0]!], {
      ...fixtures,
      roster: {
        ...fixtures.roster,
        people: [{ ...fixtures.roster.people[0]!, pid: rosterId('99992') }],
      },
    }),
  ).toEqual([]);
});
test('a committee-only witness cannot borrow a member with the same name', () => {
  expect(
    memberSearchRows([personRows[0]!], {
      ...fixtures,
      roster: {
        ...fixtures.roster,
        people: [
          { name: member.name, party: null, chambers: ['senate_committee'] },
        ],
      },
    }),
  ).toEqual([]);
});
test('an incomplete roster cannot establish a unique member identity', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const partial = decodeRoster({
      ...fixtures.roster,
      people: [fixtures.roster.people[0], {}],
    });
    expect(
      memberSearchRows([personRows[0]!], { ...fixtures, roster: partial }),
    ).toEqual([]);
    expect(
      memberSuggestionRoster(partial, { ...fixtures, roster: partial }).people,
    ).toEqual([]);
  } finally {
    warn.mockRestore();
  }
});
test('the Search suggestion roster drops stubs, initials, witnesses and ambiguous or unresolved names', () => {
  const sources = memberSuggestionRoster(fixtures.roster, fixtures);
  expect(sources.people).toEqual([fixtures.roster.people[0]]);
  expect(suggestionsFor('Albanese', sources, index, bills).people).toEqual(
    sources.people,
  );
  expect(suggestionsFor('Witness', sources, index, bills).people).toEqual([]);
  expect(memberSuggestionRoster(fixtures.roster, {}).people).toEqual([]);
});
test('party people sections offer only the same verified native members', () => {
  const members = partyMembers(
    'Labor',
    fixtures.roster,
    fixtures.people,
    fixtures.slugs,
    fixtures.manifest,
  );
  expect([...members.current, ...members.recorded].map((p) => p.name)).toEqual([
    member.name,
  ]);
  const missing = partyMembers(
    'Labor',
    fixtures.roster,
    { ...fixtures.people, people: [] },
    fixtures.slugs,
    fixtures.manifest,
  );
  expect([...missing.current, ...missing.recorded]).toEqual([]);
});

function loader(failedPath?: string) {
  const calls: string[] = [];
  const client: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (raw: unknown) => T,
    ): Promise<RecordResult<T>> {
      calls.push(path);
      if (path === failedPath)
        throw new ApiError('offline', 'Offline fixture.');
      const raw = path.startsWith('/api/search-all?')
        ? {
            query: 'fixture',
            kind: 'person',
            results: [...personRows, row('Casey Witness', 'pay')],
            total: 7,
            page: 1,
            per_page: 20,
            warnings: [],
          }
        : path === '/api/person-slugs'
          ? fixtures.slugs
          : path === '/parliamentarians.json'
            ? fixtures.roster
            : path === '/electorates/manifest.json'
              ? manifest
              : path === manifest.people_url
                ? fixtures.people
                : null;
      return { data: decode(raw), stale: false, savedAt: 1, asOf: null };
    },
  };
  return { catalogs: new Catalogs(client), calls };
}
test('the search API filters before returning rows to the screen', async () => {
  const { catalogs } = loader();
  const result = await catalogs.search('fixture');
  expect(result.data.results.map((r) => r.title)).toEqual([
    member.name,
    'Casey Witness',
  ]);
  expect(result.data.results[0]?.personSlug).toBe('anthony-albanese');
  expect(result.data.results[1]?.personSlug).toBeUndefined();
  expect(result.data.results[1]?.profileName).toBeUndefined();
});
test.each([
  '/parliamentarians.json',
  '/electorates/manifest.json',
  manifest.people_url,
])(
  'the search API keeps non-person rows when %s is unavailable',
  async (path) => {
    const result = await loader(path).catalogs.search('fixture');
    expect(result.data.results.map((r) => r.kind)).toEqual(['pay']);
  },
);
