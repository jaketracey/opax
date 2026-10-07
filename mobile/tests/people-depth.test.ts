import { ApiClient } from '../src/api/client';
import { CatalogCache, type CacheStore } from '../src/api/cache';
import { assertAllowedPath } from '../src/api/policy';
import { PeopleDepth } from '../src/features/people/data';
import {
  cleanPassage,
  displayedRecordTitle,
  decodeAccess,
  decodeBriefs,
  decodeFunding,
  decodeNews,
  decodePersonTopics,
  decodeRecords,
  decodeTopics,
  diaryFor,
  matchingNews,
  receiptsSeries,
} from '../src/features/people/model';
import { joinPerson } from '../src/api/person-identity';
import { manifest, people, pinned, roster, slugs } from './pinned';
import snapshot from '../scripts/fixture-snapshot.json';
import { responseBytes } from './fixture-bytes';
const fixtures = JSON.parse(
  responseBytes(snapshot, '/people-fixtures').toString(),
).responses as Record<string, unknown>;
const store: CacheStore = {
  readIndex: async () => [],
  writeIndex: async () => {},
  read: async () => undefined,
  write: jest.fn(async () => {}),
  remove: async () => {},
};
function client(transport: typeof fetch) {
  return new ApiClient({
    origin: 'https://example.test',
    version: '1',
    build: '7',
    cache: new CatalogCache(store),
    transport,
    retries: 2,
    sleep: async () => {},
  });
}
const topicPath =
  '/api/person-topics?' + new URLSearchParams({ name: 'Anthony Albanese' });
const searchPath =
  '/api/search?' +
  new URLSearchParams({
    q: 'Anthony Albanese',
    speaker: 'Anthony Albanese',
    page: '1',
    per: '8',
    sort: 'newest',
  });
const mentionsPath =
  '/api/search?' + new URLSearchParams({ q: '"Labor"', top_k: '6' });

test.each([
  topicPath,
  searchPath,
  mentionsPath,
  '/api/news',
  '/api/topics',
  Object.keys(fixtures).find((p) => p.startsWith('/api/brief'))!,
  '/access.json',
])('allows exactly reviewed request %s', (path) =>
  expect(() => assertAllowedPath(path)).not.toThrow(),
);
test.each([
  '/api/news?x=1',
  '/api/news?',
  '/api/person-topics?name=A&name=B',
  '/api/person-topics?name=',
  '/api/topics?from=2020',
  '/api/brief?rids=bad',
  '/api/brief?rids=' + Array(25).fill('a'.repeat(32)).join(','),
  '/api/search?q=Albanese&top_k=6',
  '/api/search?q=%22Labor%22&top_k=7',
  '/api/search?q=%22Labor%22&top_k=6&mode=keyword',
  searchPath + '&kind=speech',
  searchPath.replace('per=8', 'per=9'),
  searchPath.replace('sort=newest', 'sort=relevance'),
  '/api/resource/' + 'a'.repeat(32),
  '/api/ask',
  '/api/search?x=1',
])('refuses unreviewed shape %s', (path) =>
  expect(() => assertAllowedPath(path)).toThrow(),
);

test('paid requests are impossible through the mount/static reader, session reads deduplicate and never write disk', async () => {
  const transport = jest.fn(
    async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify(fixtures['/api/news'])),
  );
  const api = client(transport);
  const service = new PeopleDepth(api);
  expect(transport).not.toHaveBeenCalled();
  await expect(api.get('/api/news', decodeNews)).rejects.toThrow(
    'explicit action',
  );
  expect(transport).not.toHaveBeenCalled();
  await Promise.all([service.news(), service.news()]);
  await service.news();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(store.write).not.toHaveBeenCalled();
  expect(transport.mock.calls[0]?.[1]).toMatchObject({
    method: 'GET',
    credentials: 'omit',
    redirect: 'manual',
  });
});
test('one request for a failed action; retry is another explicit action', async () => {
  const transport = jest.fn(async () => new Response('{}', { status: 429 }));
  const api = client(transport);
  await expect(api.getForAction('/api/news', decodeNews)).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(1);
  await expect(api.getForAction('/api/news', decodeNews)).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(2);
});
test('newest speeches batch briefs once; mentions/news/topics never fetch until requested and all remain session-cached', async () => {
  const paths: string[] = [];
  const transport = jest.fn(async (url: RequestInfo | URL) => {
    const u = new URL(String(url));
    const p = u.pathname + u.search;
    paths.push(p);
    return new Response(JSON.stringify(fixtures[p]));
  });
  const service = new PeopleDepth(client(transport));
  expect(paths).toEqual([]);
  const speeches = await service.speeches('Anthony Albanese');
  await service.speeches('Anthony Albanese');
  expect(paths).toHaveLength(2);
  expect(Object.keys(speeches.briefs)).toHaveLength(2);
  await service.mentions('Labor', true);
  expect(paths).toHaveLength(3);
  const topics = await service.topics('Anthony Albanese');
  await service.topics('Anthony Albanese');
  expect(paths).toHaveLength(5);
  expect(topics.person.data.profiles.then.label).toBe('2010s');
  await service.news();
  await service.news();
  expect(paths).toHaveLength(6);
});
test('action redirects and malformed bodies fail closed', async () => {
  await expect(
    client(
      jest.fn(async () => new Response('{}', { status: 302 })),
    ).getForAction('/api/news', decodeNews),
  ).rejects.toThrow('Redirects');
  await expect(
    client(jest.fn(async () => new Response('{'))).getForAction(
      '/api/news',
      decodeNews,
    ),
  ).rejects.toThrow('could not be read');
});
test('every new decoder reads its pinned bytes and rejects broken containers', () => {
  const pairs = [
    [decodeAccess, pinned('/access.json')],
    [decodeFunding, pinned('/graph/aec-extras.json')],
    [decodePersonTopics, fixtures[topicPath]],
    [decodeTopics, fixtures['/api/topics']],
    [decodeRecords, fixtures[searchPath]],
    [decodeNews, fixtures['/api/news']],
    [decodeBriefs, Object.values(fixtures).find((v: any) => v.briefs)],
  ] as const;
  for (const [decode, value] of pairs) {
    expect(() => decode(value)).not.toThrow();
    expect(() => decode(null)).toThrow();
    expect(() => decode({})).toThrow();
  }
});
test('topic eras retain independent shares, counts and time ranges; impossible shares fail', () => {
  const era = (label: string, share: number) => ({
    label,
    from: 2010,
    to: 2019,
    labelled: 10,
    topics: [{ slug: 'housing', count: share * 10, share }],
  });
  const value = {
    name: 'Fixture Member',
    indexed: 30,
    profiles: {
      all: era('All years', 0.5),
      then: era('2010s', 0.2),
      now: era('2020–26', 0.8),
    },
  };
  expect(decodePersonTopics(value).profiles.now.topics[0]!.share).toBe(0.8);
  value.profiles.now.topics[0]!.share = 2;
  expect(() => decodePersonTopics(value)).toThrow();
});
test('diary surname and exact-name matches need guarded same-jurisdiction identity', () => {
  const access = decodeAccess(pinned('/access.json'));
  const identity = joinPerson(
    'anthony-albanese',
    slugs,
    roster,
    people,
    manifest,
  );
  expect(diaryFor(identity, access)).toBeNull();
  const minns = {
    ...identity,
    name: 'Chris Minns',
    seats: [],
    rosterRow: { name: 'Chris Minns', states: ['nsw'], speeches: 5 },
  };
  expect(diaryFor(minns, access)?.name).toBe('Chris Minns');
  expect(diaryFor({ ...minns, name: 'Minns' }, access)?.name).toBe(
    'Chris Minns',
  );
  expect(
    diaryFor(
      { ...minns, rosterRow: { ...minns.rosterRow, states: ['federal'] } },
      access,
    ),
  ).toBeNull();
  expect(
    diaryFor(
      {
        ...minns,
        name: 'Minns',
        rosterRow: { ...minns.rosterRow, states: ['qld'] },
      },
      access,
    ),
  ).toBeNull();
});
test('news matches significant word beginnings, escapes punctuation and hides unrelated headlines', () => {
  const items = decodeNews(fixtures['/api/news']).items;
  expect(matchingNews('Anthony Albanese', items)).toHaveLength(1);
  expect(matchingNews('Labor', items)).toHaveLength(1);
  expect(matchingNews('Nobody Known', items)).toHaveLength(0);
  expect(matchingNews('Australian Party Limited', items)).toHaveLength(0);
  expect(
    matchingNews('F[oo]', [
      {
        title: 'F[oo] speaks',
        url: 'https://example.test',
        source: 'Fixture',
        published: undefined,
      },
    ]),
  ).toHaveLength(1);
});
test('27 Labor receipt years, latest creditors, and component clamping match the web', () => {
  const data = decodeFunding(pinned('/graph/aec-extras.json'));
  const party = data.parties.Labor!;
  const rows = receiptsSeries(party.returns);
  expect(rows).toHaveLength(27);
  expect(rows[0]!.year).toBe('2024-25');
  expect(rows.at(-1)!.year).toBe('1998-99');
  expect(party.debts!.total).toBe(833836);
  expect(
    rows.every((r) => r.donations + r.other + r.notItemised === r.receipts),
  ).toBe(true);
  const clamped = receiptsSeries([
    { ...party.returns![0]!, receipts: 10, donations: 11, other: 1 },
  ])[0]!;
  expect(clamped).toMatchObject({
    donations: 10,
    other: 0,
    notItemised: 0,
    clamped: true,
  });
});

test('speech titles preserve subject punctuation and passages omit source furniture like the web', () => {
  const row = decodeRecords({
    results: [
      {
        slug: 'speech-fixture',
        speaker: 'Fixture Member',
        title: 'Fixture Member — Budget — the reply — 2026-10-01',
        date: '2026-10-01',
      },
    ],
  }).results[0]!;
  expect(displayedRecordTitle(row)).toBe('Budget — the reply');
  expect(cleanPassage('Heading\n\nA complete source sentence.')).toBe(
    'A complete source sentence.',
  );
});
