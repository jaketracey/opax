import * as d from '../src/api/catalog-decoders';
import { ApiError } from '../src/api/errors';
import { rows, records, setCatalogDiagnostics } from '../src/api/validation';
import { pinned, manifest, slugs, replaceAt } from './pinned';

const optionalCases: [string, (v: unknown) => unknown, (string | number)[]][] =
  [
    ['/parliamentarians.json', d.decodeRoster, ['people', 0, 'speeches']],
    ['/parliamentarians.json', d.decodeRoster, ['people', 0, 'current']],
    ['/parliamentarians.json', d.decodeRoster, ['people', 0, 'states']],
    ['/parliamentarians.json', d.decodeRoster, ['people', 0, 'representation']],
    ['/electorates/manifest.json', d.decodeManifest, ['sources', 0, 'licence']],
    [manifest.people_url, d.decodePeople, ['people', 0, 'legacy_person_id']],
    [manifest.people_url, d.decodePeople, ['people', 0, 'source_url']],
    [
      manifest.index_url,
      d.decodeElectorateIndex,
      ['electorates', 0, 'election_count'],
    ],
    [
      manifest.index_url,
      d.decodeElectorateIndex,
      ['electorates', 0, 'latest_election'],
    ],
    [
      '/electorates/releases/b56417062ccc33cf/el_5d600e7f6dca5b72ae04d686.json',
      d.decodeElectorate,
      ['boundaries', 0, 'display_simplified'],
    ],
    ['/bills/index.json', d.decodeBillIndex, ['bills', 0, 'aliases']],
    ['/bills/au-federal-r7534.json', d.decodeBill, ['consultation']],
    ['/bills/au-federal-r7534.json', d.decodeBill, ['related']],
    ['/bills/au-federal-r7534.json', d.decodeBill, ['became']],
    ['/votes.json', d.decodeVotes, ['_meta']],
    ['/interests/10007.json', d.decodeInterest, ['statement_date']],
    ['/interests/10007.json', d.decodeInterest, ['unread_pages']],
    ['/interests/10007.json', d.decodeInterest, ['ties']],
    ['/interests/recent.json', d.decodeRecentInterests, ['items', 0, 'ties']],
    [
      '/expense-categories.json',
      d.decodeExpenseCategories,
      ['categories', 0, 'note'],
    ],
    ['/graph/money.json', d.decodeMoney, ['nodes', 0, 'aliases']],
    ['/graph/money.json', d.decodeMoney, ['nodes', 0, 'firstYear']],
  ];
optionalCases.push(
  ['/pay.json', d.decodePay, ['people', 'R36', 'now', 'assumed']],
  ['/discovery.json', d.decodeDiscovery, ['coverage', 'snapshot_at']],
  ['/discovery.json', d.decodeDiscovery, ['signals', 0, 'chart']],
  [
    '/graph/aec-extras.json',
    d.decodeAecExtras,
    [
      'parties',
      Object.keys(
        d.decodeAecExtras(pinned('/graph/aec-extras.json')).parties,
      )[0]!,
      'associated_entities_total',
    ],
  ],
);

beforeEach(() =>
  jest.spyOn(console, 'warn').mockImplementation(() => undefined),
);
afterEach(() => jest.restoreAllMocks());

test.each(optionalCases)(
  '%s optional %j treats null as missing',
  (path, decode, field) => {
    expect(decode(replaceAt(pinned(path), field, null))).toEqual(
      decode(replaceAt(pinned(path), field, undefined)),
    );
  },
);
test('one malformed roster row keeps all other rows in their original order', () => {
  const input = pinned('/parliamentarians.json') as {
    meta: unknown;
    people: unknown[];
  };
  const good = d.decodeRoster(input);
  const mixed = d.decodeRoster({
    ...input,
    people: [input.people[0], { name: null }, ...input.people.slice(1)],
  });
  expect(mixed).toEqual(good);
  expect(console.warn).toHaveBeenCalledWith(
    'Dropped malformed catalog row: rosterPerson [1]',
  );
});
test.each(['meta', 'people'])(
  'roster missing required %s fails the file',
  (key) => {
    expect(() =>
      d.decodeRoster(
        replaceAt(pinned('/parliamentarians.json'), [key], undefined),
      ),
    ).toThrow(ApiError);
  },
);
test('required nullable fields must still be present; missing data drops only that bill', () => {
  const raw = pinned('/bills/index.json') as { bills: unknown[] };
  const valid = d.decodeBillIndex(raw);
  const without = d.decodeBillIndex(
    replaceAt(raw, ['bills', 0, 'short_title'], undefined),
  );
  expect(without.bills).toEqual(valid.bills.slice(1));
  expect(
    d.decodeBillIndex(replaceAt(raw, ['bills', 0, 'short_title'], null)).bills,
  ).toHaveLength(valid.bills.length);
});
test('malformed keyed vote drops its name-index reference and keeps every other record', () => {
  const good = d.decodeVotes(pinned('/votes.json'));
  const mixed = d.decodeVotes(
    replaceAt(pinned('/votes.json'), ['10007', 'ayes'], 'bad'),
  );
  const { ['10007']: removed, ...kept } = good.records;
  expect(removed).toBeDefined();
  expect(mixed.records).toEqual(kept);
  expect(Object.values(mixed.names).flat()).not.toContain('10007');
});
test('a bad release row or duplicate cannot invalidate its healthy siblings', () => {
  const raw = pinned(manifest.index_url) as { electorates: unknown[] };
  const good = d.decodeElectorateIndex(raw);
  const bad = replaceAt(
    raw,
    ['electorates', 0, 'detail_url'],
    `/electorates/releases/0000000000000000/${good.electorates[0]!.electorate_id}.json`,
  );
  expect(d.decodeElectorateIndex(bad).electorates).toEqual(
    good.electorates.slice(1),
  );
  expect(
    d.decodeElectorateIndex({
      ...raw,
      electorates: [...raw.electorates, raw.electorates[0]],
    }),
  ).toEqual(good);
});
test('lookup catalogs drop only bad entries', () => {
  expect(
    d.decodeSlugs({ ...slugs, slugs: { ...slugs.slugs, 'bad-name': null } }),
  ).toEqual(slugs);
  const good = d.decodePhotoPeople(pinned('/photos/people.json'));
  expect(d.decodePhotoPeople({ ...good, bad: '../../og/person' })).toEqual(
    good,
  );
});
test('diagnostics run only in development or e2e and never log row contents', () => {
  const flags = globalThis as typeof globalThis & { __DEV__: boolean };
  const dev = flags.__DEV__;
  const decode = rows(d.decodeRoster, 'test');
  try {
    flags.__DEV__ = false;
    setCatalogDiagnostics(false);
    expect(decode([{ secret: 'private payload' }])).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
    setCatalogDiagnostics(true);
    decode([{ secret: 'private payload' }]);
    expect(console.warn).toHaveBeenLastCalledWith(
      'Dropped malformed catalog row: test [0]',
    );
    flags.__DEV__ = true;
    setCatalogDiagnostics(false);
    decode([null]);
    expect(console.warn).toHaveBeenCalledTimes(2);
  } finally {
    flags.__DEV__ = dev;
    setCatalogDiagnostics(false);
  }
});
test('collection decoders reject absent or malformed containers and do not swallow programming errors', () => {
  for (const value of [null, undefined, {}, 'rows'])
    expect(() => rows(d.decodeRoster)(value)).toThrow(ApiError);
  for (const value of [null, undefined, [], 'records'])
    expect(() => records(d.decodeRoster)(value)).toThrow(ApiError);
  const bug = () => {
    throw new TypeError('decoder bug');
  };
  expect(() => rows(bug)([{}])).toThrow(TypeError);
  expect(() => records(bug)({ key: {} })).toThrow(TypeError);
});
