import { pinnedBytes } from './pinned';
import { Platform } from 'react-native';
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
      version: '1.0.0',
      build: '1',
      cache,
      transport,
      now,
      retries: 0,
      ...options,
    }),
  };
}
test.each(['android', 'ios'] as const)(
  'catalog requests label %s while preserving their transport boundary',
  async (platform) => {
    const original = Platform.OS;
    try {
      Object.defineProperty(Platform, 'OS', {
        value: platform,
        configurable: true,
      });
      const transport = jest.fn().mockResolvedValue(response());
      const { client } = setup(transport);
      await client.get('/parliamentarians.json', decode);
      expect(transport.mock.calls[0]).toEqual([
        `${origin}/parliamentarians.json`,
        expect.objectContaining({
          method: 'GET',
          credentials: 'omit',
          redirect: 'manual',
          headers: expect.objectContaining({
            'User-Agent': `OPAX-${platform === 'android' ? 'Android' : 'iOS'}/1.0.0 (1)`,
          }),
        }),
      ]);
      await expect(client.get('/api/ask', decode)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        value: original,
        configurable: true,
      });
    }
  },
);
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
    '/api/search-all?q=x&kind=bill&nocache=1',
    '/api/search-all?q=x&kind=speech',
    ...[
      'donor',
      'supplier',
      'receipt',
      'contract',
      'access',
      'campaigner',
    ].map((kind) => `/api/search-all?q=x&kind=${kind}`),
    ...['party', 'agency', 'grant', 'report'].map(
      (kind) => `/api/search-all?q=x&kind=${kind}&nocache=1`,
    ),
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
    headers: { 'User-Agent': 'OPAX-iOS/1.0.0 (1)' },
  });
});
test('a forced read reaches the network while a fresh copy is saved, and tells the HTTP cache to revalidate', async () => {
  // URLSession's own HTTP cache answers a fresh entry itself, even with an
  // If-None-Match; only a request no-cache makes it ask the origin.
  let time = 1000;
  const transport = jest
    .fn()
    .mockResolvedValueOnce(
      response(200, { ETag: '"index-v1"', 'Cache-Control': 'max-age=300' }),
    )
    .mockResolvedValueOnce(
      new Response(null, {
        status: 304,
        headers: { 'Cache-Control': 'max-age=300' },
      }),
    )
    .mockResolvedValueOnce(
      response(200, { ETag: '"index-v2"', 'Cache-Control': 'max-age=300' }),
    );
  const { client } = setup(transport, () => time);
  await client.get('/interests/index.json', decode);
  expect(transport.mock.calls[0]?.[1].headers).not.toHaveProperty(
    'Cache-Control',
  );
  time = 2000;
  // Still fresh: an ordinary read stays on the device.
  await client.get('/interests/index.json', decode);
  expect(transport).toHaveBeenCalledTimes(1);
  const refreshed = await client.get('/interests/index.json', decode, true);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1]?.[1].headers).toMatchObject({
    'If-None-Match': '"index-v1"',
    'Cache-Control': 'no-cache',
  });
  expect(refreshed.stale).toBe(false);
  // An expiry revalidation is ordinary: no request directive.
  time = 1000 + 301_000 + 2000;
  await client.get('/interests/index.json', decode);
  expect(transport).toHaveBeenCalledTimes(3);
  expect(transport.mock.calls[2]?.[1].headers).not.toHaveProperty(
    'Cache-Control',
  );
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
test('404 cannot silently fall back to stale data', async () => {
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

test.each([
  [60, false],
  [0, true],
])(
  'a delayed 304 cannot replace a newer 200 with TTL %s',
  async (ttl, stale) => {
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
        response(200, { etag: 'v2', 'cache-control': `max-age=${ttl}` }),
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
    expect(await slow).toMatchObject({
      data: { generated: '2026-09-04' },
      stale,
    });
    expect((await cache.get(`${origin}/parliamentarians.json`))?.etag).toBe(
      'v2',
    );
  },
);
test.each([200, 304])(
  'a concurrent zero-TTL %s validation of the same ETag is online',
  async (status) => {
    let release!: () => void;
    let now = 1000;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const headers = { etag: 'v1', 'cache-control': 'max-age=0' };
    const transport = jest
      .fn()
      .mockImplementationOnce(async () => {
        await gate;
        return status === 304
          ? new Response(null, { status, headers })
          : response(status, headers);
      })
      .mockResolvedValueOnce(response(200, headers))
      .mockRejectedValueOnce(new TypeError('connection lost'));
    const { client, cache } = setup(transport, () => now);
    const url = `${origin}/parliamentarians.json`;
    await cache.put({
      url,
      body: { generated: '2026-09-04' },
      asOf: '2026-09-04',
      etag: 'v1',
      savedAt: 1,
      validatedAt: 1,
      expiresAt: 2,
    });
    const slow = client.get('/parliamentarians.json', decode, true);
    while (!transport.mock.calls.length) await Promise.resolve();
    now = 2000;
    expect(
      (await client.get('/parliamentarians.json', decode, true)).stale,
    ).toBe(false);
    now = 3000;
    release();
    expect(await slow).toMatchObject({
      data: { generated: '2026-09-04' },
      stale: false,
    });
    // Retain the winning observation and still revalidate the next read.
    expect(await cache.get(url)).toMatchObject({
      validatedAt: 2000,
      expiresAt: 2000,
    });
    now = 4000;
    expect((await client.get('/parliamentarians.json', decode)).stale).toBe(
      true,
    );
    expect(transport).toHaveBeenCalledTimes(3);
  },
);
test.each([200, 304])(
  'a %s response remains online when a later same-ETag validation commits first',
  async (status) => {
    let now = 1000,
      release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const headers = { etag: 'v1', 'cache-control': 'max-age=0' };
    const transport = jest
      .fn()
      .mockResolvedValueOnce(
        status === 304
          ? new Response(null, { status, headers })
          : response(status, headers),
      )
      .mockResolvedValueOnce(response(200, headers));
    const { client, cache } = setup(transport, () => now);
    const url = `${origin}/parliamentarians.json`;
    await cache.put({
      url,
      body: { generated: '2026-09-04' },
      asOf: '2026-09-04',
      etag: 'v1',
      savedAt: 1,
      validatedAt: 1,
      expiresAt: 2,
    });
    const put = cache.put.bind(cache);
    const pending = jest
      .spyOn(cache, 'put')
      .mockImplementationOnce(async (entry) => {
        await gate;
        return (await cache.get(entry.url)) ?? entry;
      })
      .mockImplementation(put);
    const slow = client.get('/parliamentarians.json', decode, true);
    while (!pending.mock.calls.length) await Promise.resolve();
    // The first response has already been timestamped, but its cache commit waits.
    now = 2000;
    expect(
      (await client.get('/parliamentarians.json', decode, true)).stale,
    ).toBe(false);
    release();
    expect((await slow).stale).toBe(false);
    expect(await cache.get(url)).toMatchObject({ validatedAt: 2000 });
  },
);
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
test('repeated cache reads reuse the retained parsed snapshot without rereading disk', async () => {
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
  expect(bodyReads).not.toHaveBeenCalled();
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

describe.each(['remove', 'writeIndex'] as const)(
  'legacy search cleanup with a failing %s',
  (method) => {
    function legacyStore() {
      const store = new MemoryStore();
      const catalog: CacheEntry = {
        url: `${origin}/parliamentarians.json`,
        body: { generated: '2026-09-04' },
        savedAt: 1,
        validatedAt: 1,
        expiresAt: 2,
        asOf: '2026-09-04',
      };
      const search = {
        ...catalog,
        url: `${origin}/api/search-all?q=legacy-query&kind=person`,
        body: { query: 'legacy-query', results: ['legacy-result'] },
      };
      store.entries = [catalog, search];
      store.index = [
        { url: catalog.url, bytes: 100, validatedAt: 1, bucket: 'catalog' },
        { url: search.url, bytes: 100, validatedAt: 1, bucket: 'search' },
      ];
      jest.spyOn(store, method).mockRejectedValueOnce(new Error('disk full'));
      return { store, catalog, search };
    }
    test('catalog reads, network fetches and writes survive the cleanup failure', async () => {
      const { store, catalog, search } = legacyStore();
      const cache = new CatalogCache(store);
      expect(await cache.get(catalog.url)).toEqual(catalog);
      expect(await cache.get(search.url)).toBeUndefined();
      const transport = jest.fn().mockResolvedValue(response());
      const client = new ApiClient({
        origin,
        version: '1.0.0',
        build: '1',
        cache,
        transport,
        now: () => 1000,
        retries: 0,
      });
      await expect(
        client.get('/parliamentarians.json', decode),
      ).resolves.toMatchObject({
        data: { generated: '2026-09-04' },
        stale: false,
      });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(await cache.get(catalog.url)).toMatchObject({ validatedAt: 1000 });
      const next = { ...catalog, url: 'next-catalog', validatedAt: 1001 };
      await expect(cache.put(next)).resolves.toEqual(next);
      expect(await cache.get(next.url)).toEqual(next);
      expect(store.index.map((entry) => entry.url)).toEqual([
        next.url,
        catalog.url,
      ]);
      expect(JSON.stringify(store.index)).not.toContain('legacy-query');
    });
    test('keeps the filtered index in memory and retries failed cleanup next launch', async () => {
      const { store, catalog, search } = legacyStore();
      const indexReads = jest.spyOn(store, 'readIndex');
      const cache = new CatalogCache(store);
      expect(await cache.get(catalog.url)).toEqual(catalog);
      expect(await cache.get(catalog.url)).toEqual(catalog);
      expect(await cache.get(search.url)).toBeUndefined();
      expect(indexReads).toHaveBeenCalledTimes(1);
      expect(store.index.some((entry) => entry.url === search.url)).toBe(true);
      expect(await new CatalogCache(store).get(catalog.url)).toEqual(catalog);
      expect(indexReads).toHaveBeenCalledTimes(2);
      expect(store.entries).toEqual([catalog]);
      expect(JSON.stringify(store)).not.toContain('legacy-query');
    });
  },
);

test('a catalog write during legacy cleanup cannot be overwritten by the cleanup index', async () => {
  const store = new MemoryStore();
  const catalog: CacheEntry = {
    url: 'catalog',
    body: 'saved',
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 2,
    asOf: null,
  };
  const search = {
    ...catalog,
    url: `${origin}/api/search-all?q=legacy-query&kind=person`,
  };
  store.entries = [catalog, search];
  store.index = [
    { url: catalog.url, bytes: 100, validatedAt: 1, bucket: 'catalog' },
    { url: search.url, bytes: 100, validatedAt: 1, bucket: 'search' },
  ];
  let started!: () => void;
  const cleanupStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish!: () => void;
  const remove = store.remove.bind(store);
  jest.spyOn(store, 'remove').mockImplementationOnce(async (url) => {
    started();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await remove(url);
  });
  const cache = new CatalogCache(store);
  const read = cache.get(catalog.url);
  await cleanupStarted;
  const next = { ...catalog, url: 'next-catalog', validatedAt: 2 };
  const writes = jest.spyOn(store, 'write');
  const write = cache.put(next);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(writes).not.toHaveBeenCalled();
  finish();
  await Promise.all([read, write]);
  expect(await cache.get(next.url)).toEqual(next);
  expect(store.index.map((entry) => entry.url)).toEqual([
    next.url,
    catalog.url,
  ]);
});

test('one decoded snapshot per decoder and body, including 304; a new body validates despite identical ETag/date', async () => {
  let time = 1000;
  const transport = jest
    .fn()
    .mockResolvedValueOnce(
      response(200, { etag: 'same', 'cache-control': 'max-age=1' }),
    )
    .mockResolvedValueOnce(
      new Response(null, {
        status: 304,
        headers: { 'cache-control': 'max-age=60' },
      }),
    )
    .mockResolvedValueOnce(
      response(200, { etag: 'same', 'cache-control': 'max-age=60' }),
    );
  const { client } = setup(transport, () => time);
  const validate = jest.fn((value: unknown) => ({ ...decode(value) }));
  const first = await client.get('/parliamentarians.json', validate);
  expect((await client.get('/parliamentarians.json', validate)).data).toBe(
    first.data,
  );
  expect(validate).toHaveBeenCalledTimes(1);
  time = 2000;
  const revalidated = await client.get('/parliamentarians.json', validate);
  expect(revalidated.data).toBe(first.data);
  expect(revalidated.savedAt).toBe(first.savedAt);
  expect(validate).toHaveBeenCalledTimes(1);
  const otherDecoder = jest.fn(decode);
  await client.get('/parliamentarians.json', otherDecoder);
  expect(otherDecoder).toHaveBeenCalledTimes(1);
  const refreshed = await client.get('/parliamentarians.json', validate, true);
  expect(refreshed.data).toEqual(first.data);
  expect(refreshed.data).not.toBe(first.data);
  expect(validate).toHaveBeenCalledTimes(2);
  expect(transport).toHaveBeenCalledTimes(3);
});

test('memoized decoding still checks expiry and returns source/save dates on offline fallback', async () => {
  let time = 1000;
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(200, { 'cache-control': 'max-age=1' }))
    .mockRejectedValue(new TypeError('offline'));
  const { client } = setup(transport, () => time);
  const validate = jest.fn(decode);
  const first = await client.get('/parliamentarians.json', validate);
  time = 2000;
  expect(await client.get('/parliamentarians.json', validate)).toEqual({
    ...first,
    stale: true,
  });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(validate).toHaveBeenCalledTimes(1);
});

test('failed validation is never memoized; invalid forced refresh serves the last good snapshot', async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(200, { 'cache-control': 'max-age=60' }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ generated: 1 })));
  const { client } = setup(transport);
  const validate = jest.fn((value: unknown) => {
    if (typeof decode(value).generated !== 'string') throw new Error('invalid');
    return decode(value);
  });
  const first = await client.get('/parliamentarians.json', validate);
  await expect(
    client.get('/parliamentarians.json', validate, true),
  ).resolves.toEqual({ ...first, stale: true, staleReason: 'unreadable' });
  expect(validate).toHaveBeenCalledTimes(2);
});

test('concurrent disk reads share a snapshot; eviction and replacements drop its in-memory version', async () => {
  const store = new MemoryStore();
  const entry = (url: string, time: number): CacheEntry => ({
    url,
    body: { time },
    asOf: null,
    savedAt: time,
    validatedAt: time,
    expiresAt: 10000,
  });
  await new CatalogCache(store, 2000, 1).put(entry('a', 1));
  const read = jest.spyOn(store, 'read').mockImplementation(async (url) => {
    const value = store.entries.find((e) => e.url === url);
    return value
      ? (JSON.parse(JSON.stringify(value)) as CacheEntry)
      : undefined;
  });
  const cache = new CatalogCache(store, 2000, 1);
  const [first, second] = await Promise.all([cache.get('a'), cache.get('a')]);
  expect(second).toBe(first);
  expect(read).toHaveBeenCalledTimes(1);
  await cache.put(entry('b', 2));
  expect(await cache.get('a')).toBeUndefined();
  await cache.put(entry('a', 3));
  expect((await cache.get('a'))?.body).toEqual({ time: 3 });
  expect(await cache.get('a')).not.toBe(first);
  expect(await cache.get('b')).toBeUndefined();
});

test('a restored disk index cannot exceed a smaller in-memory entry bound', async () => {
  const store = new MemoryStore();
  const original = new CatalogCache(store, 2000, 2);
  const entry = (url: string): CacheEntry => ({
    url,
    body: { url },
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 100,
    asOf: null,
  });
  await original.put(entry('a'));
  await original.put(entry('b'));
  const read = jest.spyOn(store, 'read');
  const cache = new CatalogCache(store, 2000, 1);
  await cache.get('a');
  await cache.get('b');
  await cache.get('b');
  await cache.get('a');
  expect(read.mock.calls).toEqual([['a'], ['b'], ['a']]);
});

test('validated raw and decoded snapshots cannot be mutated to bypass their decoder', async () => {
  const transport = jest
    .fn()
    .mockResolvedValue(response(200, { 'cache-control': 'max-age=60' }));
  const { client, cache } = setup(transport);
  const validate = jest.fn((body: unknown) => ({
    ...decode(body),
    nested: { values: [1, 2] },
  }));
  const first = await client.get('/parliamentarians.json', validate);
  expect(Reflect.set(first.data, 'generated', 'invalid')).toBe(false);
  expect(Reflect.set(first.data.nested.values, 0, 'invalid')).toBe(false);
  const raw = (await cache.get(`${origin}/parliamentarians.json`))!
    .body as object;
  expect(Reflect.set(raw, 'generated', 1)).toBe(false);
  expect((await client.get('/parliamentarians.json', validate)).data).toEqual(
    first.data,
  );
  expect(validate).toHaveBeenCalledTimes(1);
});

test('pre-frozen parents still protect nested raw and decoded snapshot values', async () => {
  const transport = jest.fn();
  const { client, cache } = setup(transport);
  const body = Object.freeze({
    generated: '2026-09-04',
    nested: { value: 1 },
  });
  await cache.put({
    url: `${origin}/parliamentarians.json`,
    body,
    savedAt: 1000,
    validatedAt: 1000,
    expiresAt: 61000,
    asOf: body.generated,
  });
  const validate = jest.fn((value: unknown) =>
    Object.freeze({ ...decode(value), nested: { values: [1, 2] } }),
  );
  const first = await client.get('/parliamentarians.json', validate);
  expect(Reflect.set(body.nested, 'value', 2)).toBe(false);
  expect(Reflect.set(first.data.nested.values, 0, 2)).toBe(false);
  expect((await client.get('/parliamentarians.json', validate)).data).toBe(
    first.data,
  );
  expect(validate).toHaveBeenCalledTimes(1);
  expect(transport).not.toHaveBeenCalled();
});

describe('reviewed portrait byte transport', () => {
  const portrait = () => new Uint8Array(pinnedBytes('/photos/10007.webp'));
  test('bytes stay unchanged and only GET with omitted credentials reaches the reviewed origin', async () => {
    const transport = jest.fn(
      async () =>
        new Response(portrait(), { headers: { 'Content-Type': 'image/webp' } }),
    );
    const { client } = setup(transport);
    expect(await client.getPortrait('/photos/10007.webp')).toEqual(portrait());
    expect(transport).toHaveBeenCalledWith(
      'https://example.test/photos/10007.webp',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'manual',
        headers: expect.objectContaining({ Accept: 'image/webp' }),
      }),
    );
    await expect(
      client.get('/photos/10007.webp', decode),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test.each([
    '/photos/10007.webp?x=1',
    '/photos/0.webp',
    '/photos/wd-Q0.webp',
    '/photos/jpg/10007.jpg',
    '/photos/10007.webp#x',
    '//example.test/photos/10007.webp',
    '/og/person/10007.webp',
    '/photos/%31.webp',
    '/photos/100000000000.webp',
  ])('unreviewed byte path fails before transport: %s', async (path) => {
    const transport = jest.fn();
    await expect(setup(transport).client.getPortrait(path)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  test.each([
    () =>
      new Response(portrait(), {
        status: 302,
        headers: { location: '/og/person/x' },
      }),
    () =>
      new Response(portrait(), { headers: { 'Content-Type': 'image/jpeg' } }),
    () =>
      new Response(portrait(), {
        headers: { 'Content-Type': 'image/webp', 'Content-Length': '65537' },
      }),
    () =>
      new Response(new Uint8Array(65537), {
        headers: { 'Content-Type': 'image/webp' },
      }),
    () =>
      new Response('<html>Error</html>', {
        headers: { 'Content-Type': 'image/webp' },
      }),
  ])(
    'redirects, wrong type, declared or actual oversize and invalid files are rejected',
    async (make) => {
      await expect(
        setup(jest.fn(async () => make())).client.getPortrait(
          '/photos/10007.webp',
        ),
      ).rejects.toThrow();
    },
  );
  test.each([
    ['/photos/people.json', 65537],
    ['/photos/credits.json', 262145],
  ] as const)('metadata %s has a bounded response body', async (path, size) => {
    const transport = jest.fn(
      async () =>
        new Response(' '.repeat(size), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await expect(
      setup(transport).client.get(path, decode),
    ).rejects.toMatchObject({ code: 'invalid-data' });
  });
});

describe.each([false, true])('last good copy, force=%s', (force) => {
  test.each(['schema', 'json'])(
    'bad %s keeps the cached bytes and original dates after relaunch',
    async (kind) => {
      const transport = jest
        .fn()
        .mockResolvedValueOnce(
          response(200, { 'cache-control': 'max-age=1', etag: 'good' }),
        )
        .mockResolvedValueOnce(
          new Response(kind === 'schema' ? '{"generated":1}' : '{broken', {
            headers: { etag: 'bad' },
          }),
        )
        .mockRejectedValue(new TypeError('offline'));
      let time = 1000;
      const { client, cache, store } = setup(transport, () => time);
      const validate = (v: unknown) => {
        if (
          !v ||
          typeof v !== 'object' ||
          typeof (v as { generated?: unknown }).generated !== 'string'
        )
          throw new ApiError('invalid-data', 'bad schema');
        return decode(v);
      };
      const first = await client.get('/parliamentarians.json', validate);
      const saved = await cache.get(`${origin}/parliamentarians.json`);
      const writes = jest.spyOn(store, 'write');
      time = 3000;
      expect(
        await client.get('/parliamentarians.json', validate, force),
      ).toEqual({ ...first, stale: true, staleReason: 'unreadable' });
      expect(await cache.get(`${origin}/parliamentarians.json`)).toBe(saved);
      expect(writes).not.toHaveBeenCalled();
      const relaunched = new ApiClient({
        origin,
        version: '1.0.0',
        build: '1',
        cache: new CatalogCache(store),
        transport,
        now: () => time,
        retries: 0,
      });
      expect(await relaunched.get('/parliamentarians.json', validate)).toEqual({
        ...first,
        stale: true,
      });
      expect(store.entries[0]!.etag).toBe('good');
    },
  );
});
test('an undecodable download with no good cache still fails and writes nothing', async () => {
  const { client, store } = setup(
    jest.fn().mockResolvedValue(new Response('{broken')),
  );
  await expect(
    client.get('/parliamentarians.json', decode),
  ).rejects.toMatchObject({ code: 'invalid-data' });
  expect(store.entries).toEqual([]);
});
