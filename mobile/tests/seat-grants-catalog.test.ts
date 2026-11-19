import {
  CatalogCache,
  type CacheEntry,
  type CacheStore,
} from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import { assertAllowedPath } from '../src/api/policy';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import { decodeGrantIndex } from '../src/features/money-public/data';
import { decodeSeatGrants } from '../src/features/money-public/seat-grants-data';
import index from './fixtures/money/seat-index.json';
import first from './fixtures/money/seat-maribyrnong.json';
import second from './fixtures/money/seat-maribyrnong-2.json';

function setup() {
  const entries = new Map<string, CacheEntry>();
  const store: CacheStore = {
    readIndex: async () => [],
    writeIndex: async () => {},
    read: async (url) => entries.get(url),
    write: async (entry) => {
      entries.set(entry.url, entry);
    },
    remove: async (url) => {
      entries.delete(url);
    },
  };
  const transport = jest.fn(
    async (url: string) =>
      new Response(JSON.stringify(url.endsWith('-2.json') ? second : first), {
        headers: { 'cache-control': 'max-age=300' },
      }),
  );
  const client = new ApiClient({
    origin: 'https://example.test',
    version: '1',
    build: '1',
    cache: new CatalogCache(store),
    transport: transport as typeof fetch,
    retries: 0,
    now: () => 1000,
  });
  return { catalog: new MoneyCatalogs(client), transport };
}

test('seat keys survive index decoding, including a saved index without keys', () => {
  expect(decodeGrantIndex(index).seats[0]!.key).toBe('maribyrnong');
  expect(
    decodeGrantIndex({
      ...index,
      electorates: index.electorates.map(({ key: _key, ...row }) => row),
    }).seats[0]!.key,
  ).toBe('');
});

test('seat pages retain the exact index figures and all grants across the continuation', async () => {
  const { catalog, transport } = setup();
  const a = await catalog.seat('federal', 'maribyrnong');
  const b = await catalog.seat('federal', 'maribyrnong', false, {
    page: a!.data.next!,
  });
  const seat = decodeGrantIndex(index).seats[0]!;
  expect(a!.data).toMatchObject({
    total: seat.total,
    count: seat.count,
    page: 1,
  });
  expect(b!.data).toMatchObject({
    total: seat.total,
    count: seat.count,
    page: 2,
    next: null,
  });
  const grants = [...a!.data.grants, ...b!.data.grants];
  expect(grants).toHaveLength(seat.count);
  expect(grants.reduce((total, g) => total + g.value, 0)).toBeCloseTo(
    seat.total,
    2,
  );
  expect(grants.map((g) => g.value)).toEqual(
    grants.map((g) => g.value).sort((x, y) => y - x),
  );
  expect(transport.mock.calls.map(([url]) => url)).toEqual([
    'https://example.test/grants/federal/seats/maribyrnong.json',
    'https://example.test/grants/federal/seats/maribyrnong-2.json',
  ]);
});

test('seat reads use the shared cache, refresh and offline fallback', async () => {
  const { catalog, transport } = setup();
  await catalog.seat('federal', 'maribyrnong');
  await catalog.seat('federal', 'maribyrnong');
  expect(transport).toHaveBeenCalledTimes(1);
  transport.mockRejectedValue(new TypeError('offline'));
  const saved = await catalog.seat('federal', 'maribyrnong', true);
  expect(saved).toMatchObject({
    stale: true,
    savedAt: 1000,
    data: { key: 'maribyrnong' },
  });
  expect(transport).toHaveBeenCalledTimes(2);
});

test('missing keys and HTTP 404 are absence, while other failures remain errors', async () => {
  const { catalog, transport } = setup();
  expect(await catalog.seat('federal', '')).toBeNull();
  expect(transport).not.toHaveBeenCalled();
  transport.mockResolvedValue(new Response('', { status: 404 }));
  expect(await catalog.seat('federal', 'maribyrnong')).toBeNull();
  transport.mockResolvedValue(new Response('', { status: 500 }));
  await expect(catalog.seat('federal', 'maribyrnong')).rejects.toMatchObject({
    code: 'server',
  });
});

test('an aborted seat request is cancelled before transport', async () => {
  const { catalog, transport } = setup();
  const controller = new AbortController();
  controller.abort();
  await expect(
    catalog.seat('federal', 'maribyrnong', false, {
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(transport).not.toHaveBeenCalled();
});

test.each([
  { key: 'another-seat' },
  { jur: 'qld' },
  { page: 2 },
  { next: '../programs/go6809.json' },
  { next: 'another-seat-2.json' },
  { next: 'maribyrnong.json' },
])(
  'mismatched identities and unsafe continuations are rejected: %j',
  async (change) => {
    const { catalog, transport } = setup();
    transport.mockResolvedValue(
      new Response(JSON.stringify({ ...first, ...change })),
    );
    await expect(catalog.seat('federal', 'maribyrnong')).rejects.toMatchObject({
      code: 'invalid-data',
    });
  },
);

test('the public allow-list admits only static federal seat files', () => {
  expect(() =>
    assertAllowedPath('/grants/federal/seats/maribyrnong.json'),
  ).not.toThrow();
  expect(() =>
    assertAllowedPath('/grants/federal/seats/maribyrnong-2.json'),
  ).not.toThrow();
  for (const path of [
    '/grants/qld/seats/example.json',
    '/grants/federal/seats/../example.json',
    '/grants/federal/seats/example.json?next=2',
  ])
    expect(() => assertAllowedPath(path)).toThrow();
});

test.each(['individual', 'undisclosed'])('seat grants apply the program privacy rule before presentation for kind=%s', (kind) => {
  const page = decodeSeatGrants({
    ...first,
    grants: [
      {
        ...first.grants[0],
        rn: 'Fixture private recipient',
        rid: 'person:fixture',
        k: kind,
        n: 'Fixture private purpose',
      },
    ],
  });
  expect(page.grants[0]).toMatchObject({
    name: 'Individual recipient',
    recipientId: '',
    title: '',
  });
  expect(JSON.stringify(page)).not.toContain('Fixture private');
});

test.each([undefined, null, '', '   '])(
  'a seat grant without a recipient name (%s) stays readable without an identity link',
  (rn) => {
    const page = decodeSeatGrants({
      ...first,
      grants: [{ ...first.grants[0], rn }],
    });
    expect(page.grants[0]).toMatchObject({
      name: 'Unnamed recipient',
      organisation: false,
      recipientId: '',
      sourceUrl: null,
      value: first.grants[0]!.v,
    });
  },
);

test('an undisclosed seat recipient keeps the source label without inventing an individual', () => {
  const page = decodeSeatGrants({
    ...first,
    grants: [
      {
        ...first.grants[0],
        rn: 'Recipients not disclosed',
        rid: 'undisclosed:federal',
        k: 'undisclosed',
      },
    ],
  });
  expect(page.grants[0]).toMatchObject({
    name: 'Recipients not disclosed',
    organisation: false,
    recipientId: '',
    sourceUrl: null,
  });
});

test('a full 500-grant page retains its continuation and oversized or empty continuations are rejected', () => {
  const grants = Array.from({ length: 500 }, (_, i) => ({
    ...first.grants[0],
    id: `GA-fixture-${i}`,
  }));
  expect(decodeSeatGrants({ ...first, c: 501, grants }).grants).toHaveLength(
    500,
  );
  expect(() =>
    decodeSeatGrants({
      ...first,
      c: 501,
      grants: [...grants, { ...grants[0], id: 'GA-fixture-500' }],
    }),
  ).toThrow();
  expect(() => decodeSeatGrants({ ...first, grants: [] })).toThrow();
});

test('a continuation named by its published site path is followed as the seat file', async () => {
  const { catalog, transport } = setup();
  transport.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('-2.json')
            ? second
            : { ...first, next: '/grants/federal/seats/maribyrnong-2.json' },
        ),
      ),
  );
  const a = await catalog.seat('federal', 'maribyrnong');
  expect(a!.data.next).toBe('maribyrnong-2.json');
  const b = await catalog.seat('federal', 'maribyrnong', false, {
    page: a!.data.next!,
  });
  expect(b!.data.grants).toHaveLength(2);
  for (const next of [
    '/grants/qld/seats/maribyrnong-2.json',
    '/grants/federal/seats/another-seat-2.json',
    'https://example.test/grants/federal/seats/maribyrnong-2.json',
  ])
    expect(() => decodeSeatGrants({ ...first, next })).toThrow();
});
