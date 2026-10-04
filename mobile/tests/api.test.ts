import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  isFresh,
  type CacheEntry,
  type CacheStore,
  type CacheIndexEntry,
} from '../src/api/cache';
import { assertAllowedPath } from '../src/api/policy';
import { ApiError, httpError } from '../src/api/errors';
class MemoryStore implements CacheStore {
  entries: CacheEntry[] = [];
  index: CacheIndexEntry[] = [];
  async readIndex() {
    return this.index;
  }
  async writeIndex(entries: CacheIndexEntry[]) {
    this.index = entries;
  }
  async read(url: string) {
    return this.entries.find((entry) => entry.url === url);
  }
  async write(entry: CacheEntry) {
    this.entries = [
      entry,
      ...this.entries.filter((item) => item.url !== entry.url),
    ];
  }
  async remove(url: string) {
    this.entries = this.entries.filter((entry) => entry.url !== url);
  }
}
const origin = 'https://example.test';
const decode = (value: unknown) => value as { generated: string };
const response = (status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ generated: '2026-09-04' }), {
    status,
    headers,
  });
function setup(transport: typeof fetch, now = () => 1000, options = {}) {
  const store = new MemoryStore();
  const cache = new CatalogCache(store);
  return {
    store,
    cache,
    client: new ApiClient({
      origin,
      version: '0.1.0',
      build: '1',
      cache,
      transport,
      now,
      retries: 0,
      ...options,
    }),
  };
}
describe('the never-call boundary', () => {
  test.each([
    '/api/ask',
    '/api/search?q=x&mode=keyword',
    '/api/search-summary',
    '/api/followups',
    '/api/journey-story',
    '/api/brief',
    '/api/person-topics',
    '/api/positions',
    '/api/person-positions',
    '/api/topics',
    '/api/resource/a',
    '/og/a',
    '/mcp',
    '/api/voice/status',
    '/api/search-all?q=x',
    '/api/search-all?q=x&kind=all',
    '/api/search-all?q=x&kind=bill',
    '/api/search-all?q=x&kind=speech',
    ...[
      'party',
      'donor',
      'agency',
      'supplier',
      'receipt',
      'contract',
      'grant',
      'access',
      'campaigner',
      'report',
    ].map((kind) => `/api/search-all?q=x&kind=${kind}`),
    '/api/search-all?q=x&kind=person&kind=bill',
    '//example.test/parliamentarians.json',
    '/x/../parliamentarians.json',
    '/%61pi/search',
    '/parliamentarians.json?nocache=1',
    '/api/search-all?q=x&kind=person&nocache=1',
  ])('rejects %s before fetching', async (path) => {
    const transport = jest.fn();
    const { client } = setup(transport);
    await expect(client.get(path, decode)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  test.each([
    '/parliamentarians.json',
    '/api/person-slugs',
    '/api/search-all?q=Anthony&kind=person',
    ...['interest', 'pay', 'expense'].map(
      (kind) => `/api/search-all?q=Anthony&kind=${kind}`,
    ),
    '/api/search-all?q=O%27Neill&kind=person',
    '/api/search-all?q=J%C3%A9r%C3%B4me&kind=person',
    '/bills/index.json',
    '/bills/au-federal-r7549.json',
    '/electorates/releases/b56417062ccc33cf/people.json',
  ])('allows %s', (path) =>
    expect(() => assertAllowedPath(path)).not.toThrow(),
  );
});
test('expiry revalidates with ETag; preserves original saved date on 304', async () => {
  let time = 1000;
  const transport = jest
    .fn()
    .mockResolvedValueOnce(
      response(200, { ETag: '"roster-v1"', 'Cache-Control': 'max-age=1' }),
    )
    .mockResolvedValueOnce(
      new Response(null, {
        status: 304,
        headers: { 'Cache-Control': 'max-age=60' },
      }),
    );
  const { client } = setup(transport, () => time);
  const first = await client.get('/parliamentarians.json', decode);
  expect(first.asOf).toBe('2026-09-04');
  time = 1500;
  await client.get('/parliamentarians.json', decode);
  expect(transport).toHaveBeenCalledTimes(1);
  time = 2000;
  const revalidated = await client.get('/parliamentarians.json', decode);
  expect(transport.mock.calls[1]?.[1].headers['If-None-Match']).toBe(
    '"roster-v1"',
  );
  expect(revalidated.savedAt).toBe(1000);
  expect(revalidated.stale).toBe(false);
  expect(transport.mock.calls[0]?.[1]).toMatchObject({
    method: 'GET',
    credentials: 'omit',
    redirect: 'manual',
    headers: { 'User-Agent': 'OPAX-iOS/0.1.0 (1)' },
  });
});
test('offline fallback has its saved/as-of dates, uncached offline maps to error', async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(200, { 'Cache-Control': 'no-store' }))
    .mockRejectedValue(new TypeError('offline'));
  const { client } = setup(transport);
  await client.get('/parliamentarians.json', decode);
  expect(await client.get('/parliamentarians.json', decode)).toMatchObject({
    stale: true,
    savedAt: 1000,
    asOf: '2026-09-04',
  });
  await expect(client.get('/api/person-slugs', decode)).rejects.toMatchObject({
    code: 'offline',
  });
});
test('404 and invalid data cannot silently fall back to stale data', async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(200, { 'Cache-Control': 'no-store' }))
    .mockResolvedValueOnce(response(404));
  const { client } = setup(transport);
  await client.get('/parliamentarians.json', decode);
  await expect(
    client.get('/parliamentarians.json', decode),
  ).rejects.toMatchObject({ code: 'not-found' });
});
test('GET retries with bounded exponential backoff on transient failure', async () => {
  const sleep = jest.fn().mockResolvedValue(undefined);
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(503))
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValue(response());
  const { client } = setup(transport, () => 1000, { retries: 2, sleep });
  await client.get('/parliamentarians.json', decode);
  expect(sleep.mock.calls).toEqual([[300], [600]]);
  expect(transport).toHaveBeenCalledTimes(3);
});
test('timeout maps distinctly, redirect response and broken JSON fail closed', async () => {
  const transport: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener('abort', () =>
        reject(new Error('aborted')),
      ),
    );
  await expect(
    setup(transport, Date.now, { timeoutMs: 5 }).client.get(
      '/parliamentarians.json',
      decode,
    ),
  ).rejects.toMatchObject({ code: 'timeout' });
  const redirected = response();
  Object.defineProperty(redirected, 'redirected', { value: true });
  await expect(
    setup(jest.fn().mockResolvedValue(redirected)).client.get(
      '/parliamentarians.json',
      decode,
    ),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    setup(
      jest
        .fn()
        .mockResolvedValue(
          response(302, { Location: 'https://example.test/api/ask' }),
        ),
    ).client.get('/parliamentarians.json', decode),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    setup(jest.fn().mockResolvedValue(new Response('broken'))).client.get(
      '/parliamentarians.json',
      decode,
    ),
  ).rejects.toMatchObject({ code: 'invalid-data' });
});
test('cache expiry is exact, writes serialize, entries and bytes are bounded', async () => {
  const store = new MemoryStore();
  const cache = new CatalogCache(store, 2000, 2);
  const entry = (url: string): CacheEntry => ({
    url,
    body: 'small',
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 2,
    asOf: null,
  });
  expect(isFresh(entry('a'), 2)).toBe(false);
  await Promise.all(['a', 'b', 'c'].map((url) => cache.put(entry(url))));
  expect(store.entries.map((entry) => entry.url)).toEqual(['c', 'b']);
  await cache.put({ ...entry('large'), body: 'x'.repeat(2500) });
  expect(store.entries.map((entry) => entry.url)).toEqual(['c', 'b']);
});
test('a corrupt cached body is refetched rather than reused with an ETag', async () => {
  const transport = jest.fn().mockResolvedValue(response());
  const { client, cache } = setup(transport);
  await cache.put({
    url: `${origin}/parliamentarians.json`,
    body: { generated: 1 },
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 10000,
    asOf: null,
    etag: 'bad',
  });
  const strictDecode = (value: unknown) => {
    if (
      !value ||
      typeof (value as { generated: unknown }).generated !== 'string'
    )
      throw new Error('invalid');
    return value;
  };
  await client.get('/parliamentarians.json', strictDecode);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]?.[1].headers['If-None-Match']).toBeUndefined();
});
test('timeouts and disconnects while reading the body retain offline fallback semantics', async () => {
  const timeoutTransport: typeof fetch = async (_url, init) => {
    const result = response();
    result.json = () =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted body')),
        ),
      );
    return result;
  };
  await expect(
    setup(timeoutTransport, Date.now, { timeoutMs: 5 }).client.get(
      '/parliamentarians.json',
      decode,
    ),
  ).rejects.toMatchObject({ code: 'timeout' });
  const broken = response();
  broken.json = async () => {
    throw new TypeError('connection lost');
  };
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(200, { 'Cache-Control': 'no-store' }))
    .mockResolvedValueOnce(broken);
  const { client } = setup(transport);
  await client.get('/parliamentarians.json', decode);
  expect((await client.get('/parliamentarians.json', decode)).stale).toBe(true);
});
test.each([
  [403, 'forbidden'],
  [404, 'not-found'],
  [429, 'rate-limited'],
  [503, 'server'],
  [400, 'http'],
])('maps HTTP %s', (status, code) => {
  expect(httpError(status as number)).toBeInstanceOf(ApiError);
  expect(httpError(status as number).code).toBe(code);
});

test('a delayed 304 cannot replace a newer 200', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = jest
    .fn()
    .mockImplementationOnce(async () => {
      await gate;
      return new Response(null, { status: 304, headers: { etag: 'v1' } });
    })
    .mockResolvedValueOnce(
      response(200, { etag: 'v2', 'cache-control': 'max-age=60' }),
    );
  const { client, cache } = setup(transport, () => 5000);
  await cache.put({
    url: `${origin}/parliamentarians.json`,
    body: { generated: '2026-09-01' },
    asOf: '2026-09-01',
    etag: 'v1',
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 2,
  });
  const slow = client.get('/parliamentarians.json', decode, true);
  // Wait until the first request actually enters the transport.
  while (!transport.mock.calls.length) await Promise.resolve();
  await client.get('/parliamentarians.json', decode, true);
  release();
  expect((await slow).data.generated).toBe('2026-09-04');
  expect((await cache.get(`${origin}/parliamentarians.json`))?.etag).toBe('v2');
});
test('an older as-at body cannot replace a newer observation', async () => {
  const transport = jest.fn().mockResolvedValue(
    new Response(JSON.stringify({ generated: '2026-08-01' }), {
      headers: { etag: 'v0' },
    }),
  );
  const { client, cache } = setup(transport, () => 5000);
  await cache.put({
    url: `${origin}/parliamentarians.json`,
    body: { generated: '2026-09-04' },
    asOf: '2026-09-04',
    etag: 'v2',
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 2,
  });
  expect((await client.get('/parliamentarians.json', decode, true)).asOf).toBe(
    '2026-09-04',
  );
  expect((await cache.get(`${origin}/parliamentarians.json`))?.etag).toBe('v2');
});
test('a request predating stored validation cannot replace it even with the same as-at', async () => {
  const store = new MemoryStore();
  const cache = new CatalogCache(store);
  const entry: CacheEntry = {
    url: 'a',
    body: 'new',
    asOf: null,
    savedAt: 20,
    validatedAt: 20,
    expiresAt: 30,
  };
  await cache.put(entry);
  expect(
    (
      await cache.put(
        { ...entry, body: 'old', validatedAt: 25 },
        { requestStartedAt: 10 },
      )
    ).body,
  ).toBe('new');
});
test('search eviction cannot evict catalogs; oldest validation is evicted within its bucket', async () => {
  const store = new MemoryStore();
  const cache = new CatalogCache(store, 2000, 2, 1000, 2);
  const entry = (url: string, time: number): CacheEntry => ({
    url,
    body: 'small',
    asOf: null,
    savedAt: time,
    validatedAt: time,
    expiresAt: time,
  });
  await cache.put(entry('catalog-a', 3));
  await cache.put(entry('catalog-b', 1));
  await cache.put(entry('catalog-c', 2));
  for (let n = 1; n <= 12; n++)
    await cache.put(entry(`${origin}/api/search-all?kind=person&q=${n}`, n));
  expect(store.entries.map((e) => e.url).sort()).toEqual([
    'catalog-a',
    'catalog-c',
  ]);
  expect(store.index.every((e) => e.bucket === 'catalog')).toBe(true);
  expect(
    await cache.get(`${origin}/api/search-all?kind=person&q=10`),
  ).toBeUndefined();
  expect(
    await cache.get(`${origin}/api/search-all?kind=person&q=11`),
  ).toBeDefined();
  expect(
    await cache.get(`${origin}/api/search-all?kind=person&q=12`),
  ).toBeDefined();
});
test('429 honours Retry-After seconds and dates, without exceeding the total budget', async () => {
  for (const header of ['2', new Date(3000).toUTCString()]) {
    let time = 1000;
    const sleep = jest.fn(async (ms: number) => {
      time += ms;
    });
    const transport = jest
      .fn()
      .mockResolvedValueOnce(response(429, { 'Retry-After': header }))
      .mockResolvedValueOnce(response());
    await setup(transport, () => time, { retries: 2, sleep }).client.get(
      '/parliamentarians.json',
      decode,
    );
    expect(sleep).toHaveBeenCalledWith(2000);
  }
  const sleep = jest.fn();
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(200, { 'Cache-Control': 'no-store' }))
    .mockResolvedValue(response(429, { 'Retry-After': '60' }));
  const { client } = setup(transport, () => 1000, { retries: 2, sleep });
  await client.get('/parliamentarians.json', decode);
  expect((await client.get('/parliamentarians.json', decode)).stale).toBe(true);
  expect(sleep).not.toHaveBeenCalled();
  expect(transport).toHaveBeenCalledTimes(2);
});
test('all retries share one timeout budget before saved data is returned', async () => {
  jest.useFakeTimers();
  try {
    const transport = jest
      .fn()
      .mockResolvedValueOnce(response(200, { 'Cache-Control': 'no-store' }))
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
      );
    const { client } = setup(transport, Date.now, { retries: 2 });
    await client.get('/parliamentarians.json', decode);
    const pending = client.get('/parliamentarians.json', decode);
    await jest.advanceTimersByTimeAsync(8001);
    expect((await pending).stale).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test('byte eviction keeps the most recently validated entries', async () => {
  const store = new MemoryStore();
  const cache = new CatalogCache(store, 500, 40);
  const entry = (url: string, time: number): CacheEntry => ({
    url,
    body: 'x'.repeat(120),
    asOf: null,
    savedAt: time,
    validatedAt: time,
    expiresAt: time,
  });
  await cache.put(entry('new', 3));
  await cache.put(entry('old', 1));
  await cache.put(entry('middle', 2));
  expect(store.entries.map((e) => e.url).sort()).toEqual(['middle', 'new']);
  expect(
    store.index.reduce((total, e) => total + e.bytes, 0),
  ).toBeLessThanOrEqual(500);
});
test('repeated cache reads use one metadata load and only the requested body', async () => {
  const store = new MemoryStore();
  const indexReads = jest.spyOn(store, 'readIndex');
  const bodyReads = jest.spyOn(store, 'read');
  const cache = new CatalogCache(store);
  await cache.put({
    url: 'a',
    body: 'a',
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 2,
    asOf: null,
  });
  bodyReads.mockClear();
  await cache.get('a');
  await cache.get('a');
  expect(indexReads).toHaveBeenCalledTimes(1);
  expect(bodyReads.mock.calls).toEqual([['a'], ['a']]);
});

test('clock moving forward then back refetches and retains a newer as-at', async () => {
  let time = 1000;
  const ahead = time + 30 * 86400 * 1000;
  const transport = jest
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ generated: '2026-09-01' }), {
        headers: { etag: 'v1', 'cache-control': 'max-age=60' },
      }),
    )
    .mockResolvedValue(
      response(200, { etag: 'v2', 'cache-control': 'max-age=60' }),
    );
  const { client, cache } = setup(transport, () => time);
  time = ahead;
  await client.get('/parliamentarians.json', decode);
  time = 1000;
  const entry = await cache.get(`${origin}/parliamentarians.json`);
  expect(isFresh(entry!, time)).toBe(false);
  const refreshed = await client.get('/parliamentarians.json', decode);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(refreshed).toMatchObject({
    asOf: '2026-09-04',
    stale: false,
    savedAt: time,
  });
  expect((await cache.get(`${origin}/parliamentarians.json`))?.etag).toBe('v2');
});

test('a strictly newer as-at wins even if its request started before trusted validation', async () => {
  const store = new MemoryStore();
  const cache = new CatalogCache(store);
  const entry: CacheEntry = {
    url: 'a',
    body: 'old',
    asOf: '2026-09-01',
    savedAt: 20,
    validatedAt: 20,
    expiresAt: 30,
  };
  await cache.put(entry);
  expect(
    (
      await cache.put(
        { ...entry, body: 'new', asOf: '2026-09-04', validatedAt: 25 },
        { requestStartedAt: 10 },
      )
    ).body,
  ).toBe('new');
});

test('a future stored validation cannot block same-date online validation after clock rollback', async () => {
  const store = new MemoryStore();
  const cache = new CatalogCache(store);
  const entry: CacheEntry = {
    url: 'a',
    body: 'old',
    asOf: '2026-09-01',
    savedAt: 3000,
    validatedAt: 3000,
    expiresAt: 4000,
  };
  await cache.put(entry);
  expect(
    (
      await cache.put(
        { ...entry, body: 'new', validatedAt: 1000 },
        { requestStartedAt: 900 },
      )
    ).body,
  ).toBe('new');
});

test('concurrent first reads and a write share one pending index load without losing the write', async () => {
  const store = new MemoryStore();
  let release!: (index: CacheIndexEntry[]) => void;
  const indexReads = jest.spyOn(store, 'readIndex').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const cache = new CatalogCache(store);
  const reads = [
    cache.get('missing-a'),
    cache.get('missing-b'),
    cache.get('new'),
  ];
  await Promise.resolve();
  const entry: CacheEntry = {
    url: 'new',
    body: 'new',
    asOf: null,
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 2,
  };
  const write = cache.put(entry);
  await Promise.resolve();
  expect(indexReads).toHaveBeenCalledTimes(1);
  release([]);
  await Promise.all([...reads, write]);
  expect(await cache.get('new')).toEqual(entry);
  expect(store.index.map((item) => item.url)).toEqual(['new']);
  expect(indexReads).toHaveBeenCalledTimes(1);
});

test('search query URLs and result bodies never reach the persistent store or survive a new cache', async () => {
  const store = new MemoryStore();
  const methods = [
    'readIndex',
    'writeIndex',
    'read',
    'write',
    'remove',
  ] as const;
  const calls = methods.map((method) => jest.spyOn(store, method));
  const cache = new CatalogCache(store);
  const entry: CacheEntry = {
    url: `${origin}/api/search-all?kind=interest&q=private-query&page=2`,
    body: { query: 'private-query', results: ['private-result'] },
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 2,
    asOf: null,
  };
  await cache.put(entry);
  expect(await cache.get(entry.url)).toEqual(entry);
  for (const call of calls) expect(call).not.toHaveBeenCalled();
  expect(JSON.stringify(store)).not.toMatch(
    /private-query|private-result|search-all/,
  );
  expect(await new CatalogCache(store).get(entry.url)).toBeUndefined();
});
test('legacy persistent search pages and query metadata are removed while catalogs remain', async () => {
  const store = new MemoryStore();
  const entry = (url: string): CacheEntry => ({
    url,
    body: 'saved',
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 2,
    asOf: null,
  });
  const catalog = entry('catalog');
  const search = entry(`${origin}/api/search-all?q=legacy-query&kind=person`);
  store.entries = [catalog, search];
  store.index = [
    { url: catalog.url, bytes: 100, validatedAt: 1, bucket: 'catalog' },
    { url: search.url, bytes: 100, validatedAt: 1, bucket: 'search' },
  ];
  const cache = new CatalogCache(store);
  expect(await cache.get(search.url)).toBeUndefined();
  expect(await cache.get(catalog.url)).toEqual(catalog);
  expect(store.entries).toEqual([catalog]);
  expect(store.index).toEqual([
    { url: catalog.url, bytes: 100, validatedAt: 1, bucket: 'catalog' },
  ]);
  expect(JSON.stringify(store)).not.toContain('legacy-query');
});
