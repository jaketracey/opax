import * as d from '../src/api/catalogs';
import {
  pinned,
  pinnedBytes,
  files,
  manifest,
  slugs,
  replaceAt,
} from './pinned';
import { ApiError } from '../src/api/errors';
const cases: {
  name: string;
  path: string;
  decode: (v: unknown) => unknown;
  badPath: (string | number)[];
  bad: unknown;
}[] = [
  {
    name: 'roster',
    path: '/parliamentarians.json',
    decode: d.decodeRoster,
    badPath: ['people', 0, 'pid'],
    bad: 'person_123',
  },
  {
    name: 'manifest',
    path: '/electorates/manifest.json',
    decode: d.decodeManifest,
    badPath: ['people_url'],
    bad: '/api/ask',
  },
  {
    name: 'people',
    path: manifest.people_url,
    decode: d.decodePeople,
    badPath: ['people', 0, 'electorates', 0, 'current'],
    bad: 'true',
  },
  {
    name: 'seat index',
    path: manifest.index_url,
    decode: d.decodeElectorateIndex,
    badPath: ['electorates', 0, 'representatives'],
    bad: {},
  },
  {
    name: 'seat detail',
    path: '/electorates/releases/b56417062ccc33cf/el_5d600e7f6dca5b72ae04d686.json',
    decode: d.decodeElectorate,
    badPath: ['elections', 0, 'candidates', 0, 'votes', 0, 'votes'],
    bad: -1,
  },
  {
    name: 'bill index',
    path: '/bills/index.json',
    decode: d.decodeBillIndex,
    badPath: ['bills', 0, 'divisions'],
    bad: 0.5,
  },
  {
    name: 'bill detail',
    path: '/bills/au-federal-r7534.json',
    decode: d.decodeBill,
    badPath: ['summary', 'attribution'],
    bad: null,
  },
  {
    name: 'votes',
    path: '/votes.json',
    decode: d.decodeVotes,
    badPath: ['10007', 'ayes'],
    bad: '1251',
  },
  {
    name: 'interest index',
    path: '/interests/index.json',
    decode: d.decodeInterestIndex,
    badPath: ['_by_name', 'aaron violi'],
    bad: '../secrets',
  },
  {
    name: 'interest detail',
    path: '/interests/10007.json',
    decode: d.decodeInterest,
    badPath: ['buckets', 'memberships', 'items', 0, 'description'],
    bad: 0,
  },
  {
    name: 'recent declarations',
    path: '/interests/recent.json',
    decode: d.decodeRecentInterests,
    badPath: ['items', 0, 'url'],
    bad: 'javascript:alert(1)',
  },
  {
    name: 'interest ties',
    path: '/interests/ties-by-donor.json',
    decode: d.decodeInterestTies,
    badPath: ['donors', 'ASX Limited', 0, 'id'],
    bad: 'person_123',
  },
  {
    name: 'pay',
    path: '/pay.json',
    decode: d.decodePay,
    badPath: ['people', 'R36', 'spells', 0, 4],
    bad: null,
  },
  {
    name: 'expenses',
    path: '/expenses.json',
    decode: d.decodeExpenses,
    badPath: ['people', '10007', 'by_year', 0, 1],
    bad: 'amount',
  },
  {
    name: 'expense definitions',
    path: '/expense-categories.json',
    decode: d.decodeExpenseCategories,
    badPath: ['categories', 0, 'text'],
    bad: {},
  },
  {
    name: 'photo people',
    path: '/photos/people.json',
    decode: d.decodePhotoPeople,
    badPath: ['anthony albanese'],
    bad: '../../og/person',
  },
  {
    name: 'photo credits',
    path: '/photos/credits.json',
    decode: d.decodePhotoCredits,
    badPath: ['wd-Q100327610', 'page'],
    bad: 'file:///tmp',
  },
  {
    name: 'money graph',
    path: '/graph/money.json',
    decode: d.decodeMoney,
    badPath: ['nodes', 0, 'total'],
    bad: Infinity,
  },
  {
    name: 'corpus',
    path: '/corpus.json',
    decode: d.decodeCorpus,
    badPath: ['refresh', 'checked_at'],
    bad: '2026-02-30',
  },
];
describe.each(cases)('$name decoder', ({ path, decode, badPath, bad }) => {
  test('accepts the complete hash-pinned real file', () =>
    expect(() => decode(pinned(path))).not.toThrow());
  const rowPaths: Record<string, (string | number)[]> = {
    '/parliamentarians.json': ['people'],
    [manifest.people_url]: ['people'],
    [manifest.index_url]: ['electorates'],
    '/electorates/releases/b56417062ccc33cf/el_5d600e7f6dca5b72ae04d686.json': [
      'elections',
      0,
      'candidates',
    ],
    '/bills/index.json': ['bills'],
    '/votes.json': ['10007'],
    '/interests/index.json': ['_by_name', 'aaron violi'],
    '/interests/10007.json': ['buckets', 'memberships', 'items'],
    '/interests/recent.json': ['items'],
    '/interests/ties-by-donor.json': ['donors', 'ASX Limited'],
    '/pay.json': ['people', 'R36'],
    '/expenses.json': ['people', '10007'],
    '/expense-categories.json': ['categories'],
    '/photos/people.json': ['anthony albanese'],
    '/photos/credits.json': ['wd-Q100327610'],
    '/graph/money.json': ['nodes'],
  };
  test('isolates malformed records and rejects malformed structural fields', () => {
    const rowPath = rowPaths[path];
    const input = replaceAt(pinned(path), badPath, bad);
    if (!rowPath) {
      expect(() => decode(input)).toThrow(ApiError);
      return;
    }
    const output = decode(input);
    const read = (root: unknown): unknown =>
      rowPath.reduce<unknown>(
        (v, key) => (v as Record<string | number, unknown>)[key],
        root,
      );
    const before = read(decode(pinned(path)));
    const after = read(output);
    if (Array.isArray(before)) expect(after).toHaveLength(before.length - 1);
    else expect(after).toBeUndefined();
  });
  if (!path.startsWith('/photos/'))
    test('rejects a missing envelope', () =>
      expect(() => decode({})).toThrow(ApiError));
  test.each([null, [], 'data'])('rejects invalid root %j', (v) =>
    expect(() => decode(v)).toThrow(ApiError),
  );
});
test.each(Object.keys(files))('every fixture is size/hash pinned: %s', (path) =>
  expect(pinnedBytes(path).length).toBeGreaterThan(0),
);
test('slug API validates date and names, using its pinned-source projection', () => {
  expect(d.decodeSlugs(slugs)).toEqual(slugs);
  expect(() => d.decodeSlugs({ ...slugs, generated: undefined })).toThrow(
    ApiError,
  );
  expect(
    d.decodeSlugs({ ...slugs, slugs: { 'anthony-albanese': 1 } }).slugs,
  ).toEqual({});
});
test.each(
  Object.keys(files).filter(
    (p) => p.startsWith('/bills/') && p !== '/bills/index.json',
  ),
)('detail decoder supports each pinned bill family: %s', (p) =>
  expect(() => d.decodeBill(pinned(p))).not.toThrow(),
);
test.each(Object.keys(files).filter((p) => /\/el_[a-f0-9]{24}.json$/.test(p)))(
  'seat decoder accepts every pinned district/state/Council: %s',
  (p) => expect(() => d.decodeElectorate(pinned(p))).not.toThrow(),
);
test.each([
  '/interests/10678.json',
  '/interests/11042.json',
  '/interests/n-sandy-bolton.json',
])('register decoder accepts numeric and name-key files: %s', (p) =>
  expect(() => d.decodeInterest(pinned(p))).not.toThrow(),
);
test('votes metadata may be absent, but malformed metadata fails closed', () => {
  expect(d.decodeVotes(pinned('/votes.json')).meta).toBeNull();
  const raw = pinned('/votes.json') as Record<string, unknown>;
  const meta = {
    content_changed_at: '2026-09-04',
    latest_division_date: '2026-08-19',
    latest_division_date_by_jurisdiction: { federal: '2026-08-19' },
    schema: 1,
  };
  expect(d.decodeVotes({ ...raw, _meta: meta }).meta).toEqual(meta);
  expect(d.decodeVotes({ ...raw, _meta: null }).meta).toBeNull();
  for (const bad of [
    {},
    { ...meta, schema: 2 },
    { ...meta, latest_division_date: 1 },
    { ...meta, latest_division_date_by_jurisdiction: { federal: 'unknown' } },
  ])
    expect(() => d.decodeVotes({ ...raw, _meta: bad })).toThrow(ApiError);
  expect(() =>
    d.decodeVotes({ ...raw, _names: { 'anthony albanese': ['999999999'] } }),
  ).toThrow(ApiError);
});
test('search envelopes validate all shown fields and reject unapproved kinds', () => {
  const page = {
    query: 'Anthony',
    kind: 'person',
    results: [
      {
        kind: 'person',
        title: 'Anthony Albanese',
        href: '/subject/person/Anthony%20Albanese',
        snippet: '',
        slug: 'catalog-1',
        resource: '',
      },
    ],
    total: 1,
    page: 1,
    per_page: 20,
    warnings: [],
  };
  expect(d.decodeSearch(page).results).toHaveLength(1);
  expect(
    d.decodeSearch(replaceAt(page, ['results', 0, 'href'], undefined)).results,
  ).toEqual([]);
  for (const p of [
    { ...page, kind: 'bill' },
    { ...page, total: -1 },
  ])
    expect(() => d.decodeSearch(p)).toThrow(ApiError);
});

test('crossed IDs, empty pay series and unsafe licence links are malformed', () => {
  expect(() =>
    d.decodeElectorateIndex(
      replaceAt(
        pinned(manifest.index_url),
        ['meta', 'release_id'],
        '0000000000000000',
      ),
    ),
  ).toThrow(ApiError);
  expect(() =>
    d.decodePay(replaceAt(pinned('/pay.json'), ['base'], [])),
  ).toThrow(ApiError);
  expect(
    d.decodePay(
      replaceAt(pinned('/pay.json'), ['people', 'R36', 'by_year'], []),
    ).people.R36,
  ).toBeUndefined();
  expect(
    d.decodePhotoCredits(
      replaceAt(
        pinned('/photos/credits.json'),
        ['wd-Q100327610', 'licence_url'],
        'javascript:x',
      ),
    )['wd-Q100327610'],
  ).toBeUndefined();
});
