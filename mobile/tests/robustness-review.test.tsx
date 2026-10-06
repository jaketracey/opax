import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as d from '../src/api/catalog-decoders';
import { ApiClient, type RecordResult } from '../src/api/client';
import { Catalogs, profileFor, personId } from '../src/api/catalogs';
import {
  CatalogCache,
  type CacheEntry,
  type CacheStore,
  type CacheIndexEntry,
} from '../src/api/cache';
import { ApiError } from '../src/api/errors';
import {
  filterRows,
  isPartialCatalog,
  number,
  records,
  rows,
  shape,
} from '../src/api/validation';
import {
  followState,
  type FollowSources,
} from '../src/features/follows/markers';
import { RecordStatus } from '../src/features/RecordStatus';
import { CatalogState } from '../src/features/CatalogState';
import { catalogs, index, manifest, pinned, replaceAt, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: { followSources: jest.fn() },
}));
beforeEach(() =>
  jest.spyOn(console, 'warn').mockImplementation(() => undefined),
);
afterEach(() => jest.restoreAllMocks());
class MemoryStore implements CacheStore {
  entries: CacheEntry[] = [];
  index: CacheIndexEntry[] = [];
  async readIndex() {
    return this.index;
  }
  async writeIndex(e: CacheIndexEntry[]) {
    this.index = e;
  }
  async read(url: string) {
    return this.entries.find((e) => e.url === url);
  }
  async write(entry: CacheEntry) {
    this.entries = [entry, ...this.entries.filter((e) => e.url !== entry.url)];
  }
  async remove(url: string) {
    this.entries = this.entries.filter((e) => e.url !== url);
  }
}
const sources = (over: Partial<FollowSources> = {}): FollowSources => ({
  manifest: catalogs.manifest,
  roster: catalogs.roster,
  slugs: catalogs.slugs,
  people: catalogs.people,
  electorates: index,
  bills: catalogs.bills!,
  votes: catalogs.votes!,
  interestIndex: catalogs.interestIndex!,
  pay: catalogs.pay!,
  expenses: catalogs.expenses!,
  stale: false,
  savedAt: 1,
  error: null,
  ...over,
});
const ready = (s: ReturnType<typeof followState>) => {
  if (s.status !== 'ready') throw new Error(s.status);
  return s;
};
const ALBANESE = 'person_2b850aa643795ce8902f754b';
const GRAYNDLER = 'el_5d600e7f6dca5b72ae04d686';

const brokenRoster = () => {
  const raw = pinned('/parliamentarians.json') as {
    people: Record<string, unknown>[];
  };
  return { ...raw, people: raw.people.map((p) => ({ ...p, name: 7 })) };
};
const brokenSeats = () => {
  const raw = pinned(manifest.index_url) as {
    electorates: Record<string, unknown>[];
  };
  return {
    ...raw,
    electorates: raw.electorates.map((e) => ({ ...e, representatives: {} })),
  };
};
test.each([
  ['R1 roster', '/parliamentarians.json', d.decodeRoster, brokenRoster],
  ['R1b seats', manifest.index_url, d.decodeElectorateIndex, brokenSeats],
] as const)(
  '%s: systemic rejection keeps the good cache, dates and values through relaunch',
  async (_name, path, decoder, broken) => {
    const decode = decoder as (v: unknown) => unknown;
    const good = pinned(path),
      bad = broken();
    expect(() => decode(bad)).toThrow(ApiError);
    let time = 1000;
    const store = new MemoryStore();
    const bodies = [good, bad];
    const options = {
      origin: 'https://example.test',
      version: '0',
      build: '1',
      cache: new CatalogCache(store),
      now: () => time,
      retries: 0,
    };
    const client = new ApiClient({
      ...options,
      transport: jest.fn(
        async () =>
          new Response(JSON.stringify(bodies.shift()), {
            headers: { 'cache-control': 'max-age=1' },
          }),
      ) as unknown as typeof fetch,
    });
    const first = await client.get(path, decode);
    const saved = { ...store.entries[0]! };
    time = 5000;
    const second = await client.get(path, decode);
    expect(second).toEqual({
      ...first,
      stale: true,
      staleReason: 'unreadable',
    });
    expect(store.entries).toEqual([saved]);
    const relaunched = new ApiClient({
      ...options,
      cache: new CatalogCache(store),
      transport: jest.fn(
        async () => new Response(JSON.stringify(bad)),
      ) as unknown as typeof fetch,
    });
    expect(await relaunched.get(path, decode)).toEqual(second);
  },
);
test('the one-row/1% budget rejects excess and all-loss arrays and dictionaries, but permits real empty lists', () => {
  for (const n of [2, 99, 100, 199, 200, 1000]) {
    const allowance = Math.max(1, Math.floor(n / 100));
    const input = Array.from({ length: n }, (_, i) =>
      i < allowance ? null : i,
    );
    expect(rows(number)(input)).toHaveLength(n - allowance);
    expect(isPartialCatalog(rows(number)(input))).toBe(true);
    input[allowance] = null;
    expect(() => rows(number)(input)).toThrow(ApiError);
    expect(() =>
      records(number)(Object.fromEntries(input.map((v, i) => [i, v]))),
    ).toThrow(ApiError);
  }
  expect(() => rows(number)([null])).toThrow(ApiError);
  expect(() => records(number)({ a: null })).toThrow(ApiError);
  expect(rows(number)([])).toEqual([]);
  expect(records(number)({})).toEqual({});
  // Schema loss and later logical loss share one budget.
  const oneLost = rows(number)([
    null,
    ...Array.from({ length: 99 }, (_, i) => i),
  ]);
  expect(() => filterRows(oneLost, (n) => n > 0, 'identity')).toThrow(ApiError);
});
test('R2: the newest pay row cannot be replaced by a superseded salary', () => {
  const raw = pinned('/pay.json') as { base: unknown[] };
  expect(d.decodePay(raw).base.at(-1)!.amount).toBe(239270);
  expect(() =>
    d.decodePay(
      replaceAt(raw, ['base', raw.base.length - 1, 'url'], 'javascript:x'),
    ),
  ).toThrow(ApiError);
});
test('R3: a rejected representative makes the seat unavailable for follows, without changing its saved markers', () => {
  const follow = { kind: 'electorate' as const, id: GRAYNDLER, seen: null };
  const seen = ready(followState(follow, sources())).current;
  const raw = pinned(manifest.index_url) as {
    electorates: { electorate_id: string }[];
  };
  const row = raw.electorates.findIndex((e) => e.electorate_id === GRAYNDLER);
  const bad = d.decodeElectorateIndex(
    replaceAt(raw, ['electorates', row, 'representatives', 0, 'person'], null),
  );
  expect(isPartialCatalog(bad)).toBe(true);
  expect(
    followState({ ...follow, seen }, sources({ electorates: bad })),
  ).toEqual({ status: 'unavailable' });
  expect(seen.representatives!.words).toBe('Anthony Albanese');
});
test('R4: a rejected vote record is never reported as a removed voting record', () => {
  const follow = { kind: 'person' as const, id: ALBANESE, seen: null };
  const seen = ready(followState(follow, sources())).current;
  const votes = d.decodeVotes(
    replaceAt(pinned('/votes.json'), ['10007', 'ayes'], null),
  );
  expect(isPartialCatalog(votes)).toBe(true);
  const out = ready(followState({ ...follow, seen }, sources({ votes })));
  expect(out.changes).toEqual([]);
  expect(out.current.divisions).toBeUndefined();
  expect({ ...seen, ...out.current }).toEqual(seen);
});
test('R5: one lost vote row makes the entire multi-record person unavailable, never a subtotal', () => {
  const raw = pinned('/votes.json') as Record<string, unknown> & {
    _names: Record<string, string[]>;
  };
  const keys = raw._names['janelle saffin']!;
  const good = d.decodeVotes(raw);
  expect(
    keys.reduce((sum, k) => sum + good.records[k]!.divisions_total, 0),
  ).toBe(875);
  const person = catalogs.people.people.find(
    (p) => p.name === 'Janelle Saffin',
  )!;
  const follow = { kind: 'person' as const, id: person.person_id, seen: null };
  const seen = ready(followState(follow, sources())).current;
  for (const key of keys) {
    const bad = d.decodeVotes(replaceAt(raw, [key, 'ayes'], null));
    expect(bad.names['janelle saffin']).toBeUndefined();
    for (const k of keys) expect(bad.records[k]).toBeUndefined();
    expect(
      profileFor(personId(person.person_id), { ...catalogs, votes: bad }).blocks
        .votes.data,
    ).toBeNull();
    const state = ready(
      followState({ ...follow, seen }, sources({ votes: bad })),
    );
    expect(state.changes).toEqual([]);
    expect(state.current.divisions).toBeUndefined();
    expect({ ...seen, ...state.current }).toEqual(seen);
  }
});
test('partial metadata survives memoization, fresh disk reads and followSources, which refuses every flagged file', async () => {
  const raw = replaceAt(pinned('/votes.json'), ['10007', 'ayes'], null);
  const store = new MemoryStore();
  const options = {
    origin: 'https://example.test',
    version: '0',
    build: '1',
    cache: new CatalogCache(store),
    retries: 0,
    transport: jest.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;
      return new Response(
        JSON.stringify(
          path === '/votes.json'
            ? raw
            : path === '/api/person-slugs'
              ? slugs
              : pinned(path),
        ),
      );
    }) as unknown as typeof fetch,
  };
  const client = new ApiClient(options);
  const first = await client.get('/votes.json', d.decodeVotes);
  expect(first.partial).toBe(true);
  expect((await client.get('/votes.json', d.decodeVotes)).data).toBe(
    first.data,
  );
  const relaunched = new ApiClient({
    ...options,
    cache: new CatalogCache(store),
  });
  expect((await relaunched.get('/votes.json', d.decodeVotes)).partial).toBe(
    true,
  );
  const out = await new Catalogs(relaunched).followSources({ people: true });
  expect(out.votes).toBeNull();
  expect(out.roster).not.toBeNull();
  expect(out.error?.code).toBe('invalid-data');
});
test.each(['people', 'seats'] as const)(
  'all rows sharing a duplicate ID are removed from %s, regardless of order',
  (kind) => {
    if (kind === 'people') {
      const raw = pinned(manifest.people_url) as {
        people: Record<string, unknown>[];
      };
      const original = d.decodePeople(raw);
      const collision = { ...raw.people[0], name: 'Conflicting identity' };
      for (const list of [
        [...raw.people, collision],
        [collision, ...raw.people],
      ]) {
        const out = d.decodePeople({ ...raw, people: list });
        expect(out.people).toEqual(original.people.slice(1));
        expect(isPartialCatalog(out)).toBe(true);
      }
    } else {
      const raw = pinned(manifest.index_url) as {
        electorates: Record<string, unknown>[];
      };
      const original = d.decodeElectorateIndex(raw);
      const collision = { ...raw.electorates[0], name: 'Conflicting seat' };
      for (const list of [
        [...raw.electorates, collision],
        [collision, ...raw.electorates],
      ]) {
        const out = d.decodeElectorateIndex({ ...raw, electorates: list });
        expect(out.electorates).toEqual(original.electorates.slice(1));
        expect(isPartialCatalog(out)).toBe(true);
      }
    }
  },
);
test('programming errors in shaped or keyed vote records escape isolation', () => {
  expect(() =>
    rows(
      shape({
        n: () => {
          throw new TypeError('decoder bug');
        },
      }),
    )([{ n: 1 }]),
  ).toThrow(TypeError);
  const raw = pinned('/votes.json') as Record<string, unknown>;
  Object.defineProperty(raw['10007'] as object, 'ayes', {
    enumerable: true,
    get() {
      throw new TypeError('vote decoder bug');
    },
  });
  expect(() => d.decodeVotes(raw)).toThrow(TypeError);
});
test('decode fallback and partial screens state the problem without claiming offline', () => {
  const record: RecordResult<unknown> = {
    data: {},
    stale: true,
    staleReason: 'unreadable',
    partial: true,
    savedAt: 1000,
    asOf: null,
  };
  for (const element of [
    <RecordStatus
      key="record"
      record={record}
      error={null}
      refreshing={false}
      refresh={() => {}}
      retry={() => {}}
      label="Loading"
      testID="record"
    />,
    <CatalogState
      key="block"
      block={{ ...record, status: 'ready', asAt: null, sources: [] }}
      empty="Empty"
      onRetry={() => {}}
      testID="block"
    >
      {() => null}
    </CatalogState>,
  ]) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(element);
    });
    const words = renderer.root
      .findAllByType(NativeText)
      .map((n) => [n.props.children].flat(3).join(''))
      .join(' ');
    expect(words).toContain(
      'The latest public export could not be read. Showing the saved copy.',
    );
    expect(words).toContain('Some rows in this export could not be read.');
    expect(words).toContain('Saved');
    expect(words).not.toContain('Offline');
    act(() => renderer.unmount());
  }
});

const seatPath =
  '/electorates/releases/b56417062ccc33cf/el_5d600e7f6dca5b72ae04d686.json';
test.each([
  ['/graph/money.json', d.decodeMoney, ['nodes', 0, 'total']],
  ['/graph/money.json', d.decodeMoney, ['edges', 0, 'total']],
  [
    '/graph/aec-extras.json',
    d.decodeAecExtras,
    ['parties', 'Labor', 'associated_entities', 0, 'year'],
  ],
  ['/pay.json', d.decodePay, ['current', 0, 'salary']],
  ['/pay.json', d.decodePay, ['meta', 'sources', 0, 'url']],
  ['/expenses.json', d.decodeExpenses, ['people', '10007', 'total']],
  [
    '/interests/10007.json',
    d.decodeInterest,
    ['buckets', 'memberships', 'items', 0, 'kind'],
  ],
  [
    '/expense-categories.json',
    d.decodeExpenseCategories,
    ['groups', 0, 'title'],
  ],
  ['/corpus.json', d.decodeCorpus, ['sources', 0, 'docs']],
  [seatPath, d.decodeElectorate, ['elections', 0, 'candidates', 0, 'name']],
  [seatPath, d.decodeElectorate, ['demographics', 0, 'year']],
  [
    seatPath,
    d.decodeElectorate,
    [
      'sources',
      Object.keys(d.decodeElectorate(pinned(seatPath)).sources)[0]!,
      'url',
    ],
  ],
  ['/bills/au-federal-r7534.json', d.decodeBill, ['divisions', 0, 'ayes']],
] as [string, (v: unknown) => unknown, (string | number)[]][])(
  '%s factual list %# stays whole when a missing row would change a fact or citation',
  (path, decode, field) => {
    expect(() => decode(replaceAt(pinned(path), field, null))).toThrow(
      ApiError,
    );
  },
);
test('a partial representation never becomes a shortened history for the same person', () => {
  const raw = pinned('/parliamentarians.json') as {
    people: Record<string, unknown>[];
  };
  const row = raw.people.findIndex(
    (p) => Array.isArray(p.representation) && p.representation.length > 0,
  );
  const good = d.decodeRoster(raw);
  const bad = d.decodeRoster(
    replaceAt(raw, ['people', row, 'representation', 0, 'jurisdiction'], null),
  );
  expect(bad.people).toEqual(good.people.filter((_, i) => i !== row));
  expect(isPartialCatalog(bad)).toBe(true);
});

test('a malformed voting name bridge fails the file instead of enabling a legacy-ID subtotal', () => {
  const raw = pinned('/votes.json');
  expect(() =>
    d.decodeVotes(replaceAt(raw, ['_names', 'janelle saffin', 0], null)),
  ).toThrow(ApiError);
});
