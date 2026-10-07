import {
  Catalogs,
  personId,
  rosterId,
  type CatalogRecord,
  decodeRoster,
} from '../src/api/catalogs';
import {
  memberSearchRows,
  memberSearchResults,
  memberSlugFor,
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
      { name: 'Unresolved', party: null },
      { name: 'U Unresolved', party: null },
      { name: 'Casey Witness', chambers: ['senate_committee'], party: null },
      { name: ambiguous.name, pid: ambiguous.legacy_person_id, party: null },
      { name: 'Taylor Unresolved', party: null },
    ],
  },
  people: {
    ...people,
    people: [
      member,
      {
        ...ambiguous,
        electorates: ambiguous.electorates.map((seat) => ({
          ...seat,
          current: false,
        })),
      },
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
      unresolved: 'Unresolved',
      'u-unresolved': 'U Unresolved',
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
test('a surname href is accepted only through the real legacy profile bridge', () => {
  const bridged = {
    ...fixtures,
    roster: {
      ...fixtures.roster,
      people: [
        ...fixtures.roster.people,
        {
          name: 'Albanese',
          full: member.name,
          pid: member.legacy_person_id,
          party: null,
        },
      ],
    },
    slugs: {
      ...fixtures.slugs,
      slugs: { ...fixtures.slugs.slugs, albanese: 'Albanese' },
    },
  };
  const record = { ...row(member.name), href: '/subject/person/Albanese' };
  expect(memberSlugFor(record, bridged)).toBe('anthony-albanese');
  expect(memberSearchRows([record], bridged)).toEqual([record]);
});
test('different native title and href identities are refused', () => {
  const other = people.people.find((p) => p.name === 'Penny Wong')!;
  const both = {
    ...fixtures,
    people: { ...fixtures.people, people: [member, other] },
    slugs: {
      ...fixtures.slugs,
      slugs: { ...fixtures.slugs.slugs, 'penny-wong': other.name },
    },
  };
  expect(
    memberSlugFor(
      { ...row(member.name), href: '/subject/person/penny-wong' },
      both,
    ),
  ).toBeUndefined();
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
  expect(sources.people.map((p) => p.name)).toEqual([member.name]);
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
  return { catalogs: new Catalogs(client), client, calls };
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

test('native directory members absent from compiled results remain searchable', () => {
  const results = memberSearchResults([], catalogs, 'Vanessa Bleyer');
  expect(results.map((record) => record.title)).toEqual(['Vanessa Bleyer']);
  expect(memberSlugFor(results[0]!, catalogs)).toBe('vanessa-bleyer');
});
test('person paging filters the complete relevance window before slicing', async () => {
  const records = Array.from({ length: 45 }, (_, i) => ({
    ...personRows[0]!,
    slug: `catalog-${i}`,
  }));
  records.push(
    ...Array.from({ length: 55 }, (_, i) => ({
      ...personRows[3]!,
      slug: `witness-${i}`,
    })),
  );
  const calls: string[] = [];
  const underlying = loader().client;
  const client: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (raw: unknown) => T,
    ): Promise<RecordResult<T>> {
      if (!path.startsWith('/api/search-all?'))
        return underlying.get(path, decode);
      calls.push(path);
      return {
        data: decode({
          query: 'senate',
          kind: 'person',
          results: records,
          total: records.length,
          page: 1,
          per_page: 200,
          warnings: [],
        }),
        stale: false,
        savedAt: 1,
        asOf: null,
      };
    },
  };
  const api = new Catalogs(client);
  for (const [page, count] of [
    [1, 20],
    [2, 20],
    [3, 5],
    [5, 5],
  ]) {
    const result = (await api.search('senate', 'person', page)).data;
    expect(result).toMatchObject({
      total: 45,
      page: Math.min(page!, 3),
      per_page: 20,
    });
    expect(result.results).toHaveLength(count!);
    expect(result.page * result.per_page < result.total).toBe(page! < 3);
  }
  expect(calls.every((path) => path.endsWith('page=1&per=200'))).toBe(true);
});
test('non-person paging retains the original page and totals', async () => {
  const result = (
    await loader('/parliamentarians.json').catalogs.search('fixture', 'pay')
  ).data;
  expect(result).toMatchObject({ total: 7, page: 1, per_page: 20 });
});

test('native aliases stay suggestible while navigation uses the canonical member name', () => {
  const source = memberSuggestionRoster(roster, catalogs);
  const matched = suggestionsFor('Libby Coker', source, index, bills).people;
  expect(matched.some((p) => p.aliases?.includes('Libby Coker'))).toBe(true);
  for (const person of matched)
    expect(memberSlugFor(row(person.name), catalogs)).toBeDefined();
});

test('Walsh keeps its explicit verified surname suggestion and native Jess Walsh profile', () => {
  const sources = memberSuggestionRoster(roster, catalogs);
  const matched = suggestionsFor('Walsh', sources, index, bills).people;
  const surname = matched.find((person) => person.name === 'Walsh')!;
  expect(surname).toMatchObject({
    pid: rosterId('10956'),
    full: 'Jess Walsh',
    chambers: ['senate'],
  });
  expect(matched).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Jess Walsh', pid: rosterId('10956') }),
    ]),
  );
  expect(memberSlugFor(row(surname.name), catalogs)).toBe('jess-walsh');
});

test.each([
  { full: 'Casey Witness' },
  { pid: rosterId('99991') },
  { full: undefined },
  { pid: undefined },
  { name: 'Casey' },
])('a surname cannot survive with an unverified bridge: %o', (change) => {
  const changed = {
    ...roster,
    people: roster.people.map((person) =>
      person.name === 'Walsh' ? { ...person, ...change } : person,
    ),
  };
  const sources = memberSuggestionRoster(changed, {
    ...catalogs,
    roster: changed,
  });
  expect(
    sources.people.some((person) => person.name === (change.name ?? 'Walsh')),
  ).toBe(false);
  expect(sources.people.some((person) => person.name === 'Jess Walsh')).toBe(
    true,
  );
});

test.each(['Vanessa Bleyer', 'Maree Edwards'])(
  'the API finds %s even when the compiled catalog returns no rows',
  async (name) => {
    const client: Pick<ApiClient, 'get'> = {
      async get<T>(
        path: string,
        decode: (raw: unknown) => T,
      ): Promise<RecordResult<T>> {
        const raw = path.startsWith('/api/search-all?')
          ? {
              query: name,
              kind: 'person',
              results: [],
              total: 0,
              page: 1,
              per_page: 200,
              warnings: [],
            }
          : path === '/api/person-slugs'
            ? slugs
            : path === '/parliamentarians.json'
              ? roster
              : path === '/electorates/manifest.json'
                ? manifest
                : path === manifest.people_url
                  ? people
                  : null;
        return { data: decode(raw), stale: false, savedAt: 1, asOf: null };
      },
    };
    const result = (await new Catalogs(client).search(name)).data;
    expect(result.total).toBe(1);
    expect(result.results[0]).toMatchObject({ title: name, profileName: name });
    expect(result.results[0]!.personSlug).toBeDefined();
    const missing: Pick<ApiClient, 'get'> = {
      async get<T>(
        path: string,
        decode: (raw: unknown) => T,
      ): Promise<RecordResult<T>> {
        if (path === '/parliamentarians.json')
          throw new ApiError('offline', 'Offline fixture.');
        return client.get(path, decode);
      },
    };
    expect((await new Catalogs(missing).search(name)).data.results).toEqual([]);
  },
);

test('the API keeps verified surname display routes without attaching their full-name face', async () => {
  const directory = {
    ...slugs,
    slugs: { ...slugs.slugs, 'casey-witness': 'Casey Witness' },
  };
  const records = [
    row('Walsh'),
    row('Jess Walsh'),
    {
      ...row('Walsh'),
      href: '/subject/person/casey-witness',
      slug: 'mismatched-href',
    },
  ];
  const client: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (raw: unknown) => T,
    ): Promise<RecordResult<T>> {
      const raw = path.startsWith('/api/search-all?')
        ? {
            query: 'Walsh',
            kind: 'person',
            results: records,
            total: records.length,
            page: 1,
            per_page: 200,
            warnings: [],
          }
        : path === '/api/person-slugs'
          ? directory
          : path === '/parliamentarians.json'
            ? roster
            : path === '/electorates/manifest.json'
              ? manifest
              : path === manifest.people_url
                ? people
                : null;
      return { data: decode(raw), stale: false, savedAt: 1, asOf: null };
    },
  };
  const result = (await new Catalogs(client).search('Walsh')).data.results;
  expect(
    result.find(
      (record) => record.title === 'Walsh' && record.slug !== 'mismatched-href',
    ),
  ).toMatchObject({ personSlug: 'walsh', profileName: 'Jess Walsh' });
  expect(result.find((record) => record.title === 'Jess Walsh')).toMatchObject({
    personSlug: 'jess-walsh',
    profileName: 'Jess Walsh',
  });
  expect(
    result.find((record) => record.slug === 'mismatched-href'),
  ).toMatchObject({ personSlug: 'jess-walsh' });
  expect(result.some((record) => record.personSlug === 'casey-witness')).toBe(
    false,
  );
});
