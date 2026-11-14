import { Platform } from 'react-native';
import { performance } from 'node:perf_hooks';
import { Catalogs } from '../src/api/catalogs';
import * as decoders from '../src/api/catalog-decoders';
import {
  CatalogCache,
  isFresh,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { ApiClient, shouldFreezeSnapshots } from '../src/api/client';
import { ApiError, httpError } from '../src/api/errors';
import { assertAllowedPath } from '../src/api/policy';
import { pinnedBytes } from './pinned';
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
test('cancellation while a cache write waits for its index leaves no saved entry', async () => {
  const { cache, store } = setup(jest.fn());
  let release!: (index: CacheIndexEntry[]) => void;
  jest.spyOn(store, 'readIndex').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const write = jest.spyOn(store, 'write');
  const controller = new AbortController();
  const pending = cache.put(
    {
      url: `${origin}/corpus.json`,
      body: { generated: '2026-09-04' },
      savedAt: 1000,
      validatedAt: 1000,
      expiresAt: 2000,
      asOf: null,
    },
    { requestStartedAt: 1000, signal: controller.signal },
  );
  const cancelled = expect(pending).rejects.toMatchObject({
    name: 'AbortError',
  });
  await Promise.resolve();
  controller.abort();
  release([]);
  await cancelled;
  expect(write).not.toHaveBeenCalled();
  expect(store.index).toEqual([]);
});
test('cancellation during persistence restores the previously saved record', async () => {
  const { cache, store } = setup(jest.fn());
  const previous: CacheEntry = {
    url: `${origin}/corpus.json`,
    body: { generated: '2026-09-04' },
    savedAt: 1000,
    validatedAt: 1000,
    expiresAt: 2000,
    asOf: null,
  };
  await cache.put(previous);
  let release!: () => void;
  const write = store.write.bind(store);
  jest.spyOn(store, 'write').mockImplementationOnce(async (entry) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await write(entry);
  });
  const controller = new AbortController();
  const pending = cache.put(
    {
      ...previous,
      body: { generated: '2026-09-05' },
      savedAt: 1500,
      validatedAt: 1500,
    },
    { requestStartedAt: 1500, signal: controller.signal },
  );
  const outcome = pending.then(
    () => null,
    (error: unknown) => error,
  );
  for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
  expect(release).toBeDefined();
  controller.abort();
  release();
  expect(await outcome).toMatchObject({ name: 'AbortError' });
  expect(await cache.get(previous.url)).toEqual(previous);
  expect(store.entries).toEqual([previous]);
});
test('an action response arriving after cancellation cannot enter the session cache', async () => {
  const responses: ((response: Response) => void)[] = [];
  const transport = jest.fn(
    () =>
      new Promise<Response>((resolve) => {
        responses.push(resolve);
      }),
  );
  const { client } = setup(transport);
  const controller = new AbortController();
  const first = client.getForAction('/api/topics', decode, {
    signal: controller.signal,
  });
  const cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  controller.abort();
  await cancelled;
  const next = client.getForAction('/api/topics', decode);
  await Promise.resolve();
  expect(transport).toHaveBeenCalledTimes(2);
  responses[1]!(new Response(JSON.stringify({ generated: '2026-09-05' })));
  const latest = await next;
  responses[0]!(response());
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(await client.getForAction('/api/topics', decode)).toBe(latest);
  expect(transport).toHaveBeenCalledTimes(2);
});
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
    ...['donor', 'supplier', 'receipt', 'contract', 'access', 'campaigner'].map(
      (kind) => `/api/search-all?q=x&kind=${kind}`,
    ),
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
test.each([5, 20])(
  'a cache lookup reaching the read deadline reports timeout before transport (%dms)',
  async (elapsed) => {
    let now = 1000;
    const transport = jest.fn();
    const { client, cache } = setup(transport, () => now, { timeoutMs: 5 });
    jest.spyOn(cache, 'get').mockImplementationOnce(async () => {
      now += elapsed;
      return undefined;
    });
    await expect(
      client.get('/parliamentarians.json', decode),
    ).rejects.toMatchObject({
      code: 'timeout',
    });
    expect(transport).not.toHaveBeenCalled();
  },
);
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

test('past-member votes reads reuse the fresh HTTP cache and the decoded snapshot', async () => {
  const body = pinnedBytes('/votes.json').toString();
  const transport = jest.fn().mockImplementation(
    async () =>
      new Response(body, {
        headers: { 'cache-control': 'max-age=3600', etag: 'fixture-votes' },
      }),
  );
  const { client, store } = setup(transport);
  const diskReads = jest.spyOn(store, 'read');
  const validate = jest.spyOn(decoders, 'decodeVotes');
  try {
    const catalogs = new Catalogs(client);
    const first = await catalogs.votes();
    diskReads.mockClear();
    expect((await catalogs.votes()).data).toBe(first.data);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(diskReads).not.toHaveBeenCalled();
    // Pull to refresh is deliberately allowed to reach the origin again.
    await catalogs.votes(undefined, true);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(2);
  } finally {
    validate.mockRestore();
  }
});

test('pinned votes decode timing', () => {
  const bytes = pinnedBytes('/votes.json').toString();
  const decodeTimes: number[] = [];
  const totalTimes: number[] = [];
  for (let sample = 0; sample < 7; sample++) {
    const started = performance.now();
    const raw: unknown = JSON.parse(bytes);
    const parsed = performance.now();
    const decoded = decoders.decodeVotes(raw);
    const finished = performance.now();
    expect(Object.keys(decoded.records).length).toBeGreaterThan(0);
    decodeTimes.push(finished - parsed);
    totalTimes.push(finished - started);
  }
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[3]!.toFixed(1);
  // Report rather than assert wall-clock timing on a shared Mac.
  console.info(
    `votes.json (7 samples): decode median ${median(decodeTimes)} ms, max ${Math.max(...decodeTimes).toFixed(1)} ms; parse + decode median ${median(totalTimes)} ms`,
  );
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

test('release builds skip the freeze but still reuse one decode per body', async () => {
  const transport = jest
    .fn()
    .mockResolvedValue(response(200, { 'cache-control': 'max-age=60' }));
  const { client, cache } = setup(transport, () => 1000, {
    freezeSnapshots: false,
  });
  const validate = jest.fn((body: unknown) => ({
    ...decode(body),
    nested: { values: [1, 2] },
  }));
  const first = await client.get('/parliamentarians.json', validate);
  expect(Object.isFrozen(first.data)).toBe(false);
  expect(Object.isFrozen(first.data.nested.values)).toBe(false);
  const raw = (await cache.get(`${origin}/parliamentarians.json`))!
    .body as object;
  expect(Object.isFrozen(raw)).toBe(false);
  const second = await client.get('/parliamentarians.json', validate);
  expect(second.data).toBe(first.data);
  expect(validate).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledTimes(1);
});

describe('snapshot freeze decision', () => {
  test.each([
    [{ dev: false, e2e: false, jest: false }, false],
    [{ dev: true, e2e: false, jest: false }, true],
    [{ dev: false, e2e: true, jest: false }, true],
    [{ dev: false, e2e: false, jest: true }, true],
  ])('%j freezes: %s', (build, expected) => {
    expect(shouldFreezeSnapshots(build)).toBe(expected);
  });

  // The module reads the decision once at load. Load it as a release build
  // and as an e2e build (no __DEV__, no Jest marker) and check the default.
  const loadClient = (e2e: boolean) => {
    const g = globalThis as { __DEV__?: boolean };
    const dev = g.__DEV__;
    const worker = process.env.JEST_WORKER_ID;
    let Client!: typeof ApiClient;
    try {
      g.__DEV__ = false;
      delete process.env.JEST_WORKER_ID;
      jest.isolateModules(() => {
        jest.doMock('../src/design/environment', () => ({ isE2E: e2e }));
        Client = require('../src/api/client').ApiClient;
      });
    } finally {
      g.__DEV__ = dev;
      process.env.JEST_WORKER_ID = worker;
      jest.dontMock('../src/design/environment');
    }
    return Client;
  };
  test.each([
    [true, true],
    [false, false],
  ])('e2e build %s freezes by default: %s', async (e2e, frozen) => {
    const Client = loadClient(e2e);
    const transport = jest
      .fn()
      .mockResolvedValue(response(200, { 'cache-control': 'max-age=60' }));
    const cache = new CatalogCache(new MemoryStore());
    const client = new Client({
      origin,
      version: '1.0.0',
      build: '1',
      cache,
      transport,
      now: () => 1000,
      retries: 0,
    });
    const first = await client.get('/parliamentarians.json', (body) => ({
      ...decode(body),
    }));
    expect(Object.isFrozen(first.data)).toBe(frozen);
  });
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

test('reader-facing error sentences leave Try again to the action', () => {
  expect(httpError(500).message).toBe('The public record couldn’t be loaded.');
  expect(
    new ApiError(
      'timeout',
      'The public record took too long to load. Try again.',
    ).message,
  ).toBe('The public record took too long to load.');
});
test.each(['ios', 'android'] as const)(
  'offline client errors use shared %s device copy',
  async (os) => {
    const original = Platform.OS;
    try {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      const { client } = setup(
        jest.fn().mockRejectedValue(new TypeError('offline')),
      );
      await expect(
        client.get('/parliamentarians.json', decode),
      ).rejects.toMatchObject({
        code: 'offline',
        message: expect.stringContaining(
          `this ${os === 'ios' ? 'iPhone' : 'phone'}`,
        ),
      });
    } finally {
      Object.defineProperty(Platform, 'OS', {
        value: original,
        configurable: true,
      });
    }
  },
);

test('launch revalidation checks a fresh cached record without a conditional user-refresh request', async () => {
  const transport = jest.fn<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >();
  transport.mockResolvedValueOnce(
    response(200, { etag: 'edition-v1', 'cache-control': 'max-age=3600' }),
  );
  const { client } = setup(transport);
  await client.get('/bills/index.json', decode);
  await client.get('/bills/index.json', decode);
  expect(transport).toHaveBeenCalledTimes(1);
  transport.mockRejectedValueOnce(new Error('Offline'));
  const saved = await client.get('/bills/index.json', decode, false, {
    background: true,
  });
  expect(saved.stale).toBe(true);
  const headers = transport.mock.calls[1]![1]!.headers as Record<
    string,
    string
  >;
  expect(headers['Cache-Control']).toBe('no-cache');
  expect(headers).not.toHaveProperty('If-None-Match');
});

test('a superseded read aborts its transport and does not retry or substitute cached content', async () => {
  const controller = new AbortController();
  let transportSignal: AbortSignal | undefined;
  const transport = jest.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        transportSignal = init?.signal ?? undefined;
        transportSignal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      }),
  );
  const { client } = setup(transport as typeof fetch, () => 1000, {
    retries: 2,
  });
  const pending = client.get('/parliamentarians.json', decode, false, {
    signal: controller.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(transportSignal?.aborted).toBe(true);
  expect(transport).toHaveBeenCalledTimes(1);
});

test('cancellation while decoding a response cannot publish or save that response', async () => {
  let finish!: (body: unknown) => void;
  const downloaded = response();
  jest
    .spyOn(downloaded, 'json')
    .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  const { client, store } = setup(jest.fn().mockResolvedValue(downloaded));
  const controller = new AbortController();
  const pending = client.get('/parliamentarians.json', decode, false, {
    signal: controller.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  finish({ generated: '2026-11-11' });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(store.entries).toEqual([]);
});

test('cancelling a retry backoff settles without waiting or starting another request', async () => {
  let finish!: () => void;
  const sleep = jest.fn(
    () => new Promise<void>((resolve) => (finish = resolve)),
  );
  const transport = jest.fn().mockRejectedValue(new Error('offline'));
  const { client } = setup(transport, () => 1000, { sleep, retries: 2 });
  const controller = new AbortController();
  let error: unknown;
  const pending = client
    .get('/parliamentarians.json', decode, false, {
      signal: controller.signal,
    })
    .catch((caught: unknown) => {
      error = caught;
    });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    expect(sleep).toHaveBeenCalledTimes(1);
    controller.abort();
    await new Promise((resolve) => setImmediate(resolve));
    expect(error).toMatchObject({ name: 'AbortError' });
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {
    finish();
    await pending;
  }
});

test.each([60, 86400])(
  'a response aged almost its %s second max-age revalidates after the remaining second',
  async (maxAge) => {
    let now = 1000;
    const transport = jest.fn().mockImplementation(async () =>
      response(200, {
        'cache-control': `max-age=${maxAge}`,
        age: String(maxAge - 1),
      }),
    );
    const { client } = setup(transport, () => now);
    await client.get('/parliamentarians.json', decode);
    now = 1999;
    await client.get('/parliamentarians.json', decode);
    expect(transport).toHaveBeenCalledTimes(1);
    now = 2000;
    await client.get('/parliamentarians.json', decode);
    expect(transport).toHaveBeenCalledTimes(2);
  },
);

test('an oversized update never leaves the superseded offline copy marked fresh', async () => {
  const store = new MemoryStore();
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(200, { 'cache-control': 'max-age=86400' }))
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            generated: '2026-11-11',
            padding: 'x'.repeat(1000),
          }),
        ),
    );
  const client = new ApiClient({
    origin,
    version: '1',
    build: '1',
    cache: new CatalogCache(store, 500),
    transport,
    now: () => 1000,
    retries: 0,
  });
  await client.get('/parliamentarians.json', decode);
  expect(
    (await client.get('/parliamentarians.json', decode, true)).data.generated,
  ).toBe('2026-11-11');
  expect(
    (await client.get('/parliamentarians.json', decode)).data.generated,
  ).toBe('2026-11-11');
  expect(transport).toHaveBeenCalledTimes(3);
  // Retain the smaller saved copy for an offline fallback, with its source date.
  transport.mockRejectedValueOnce(new Error('offline'));
  await expect(
    client.get('/parliamentarians.json', decode),
  ).resolves.toMatchObject({
    stale: true,
    data: { generated: '2026-09-04' },
  });
});

test('an explicit action timing out while reading JSON reports a retryable timeout', async () => {
  const transport = jest.fn(async (_url: string, init?: RequestInit) => {
    const downloaded = response();
    jest.spyOn(downloaded, 'json').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    return downloaded;
  });
  const { client } = setup(transport as typeof fetch, Date.now, {
    timeoutMs: 5,
  });
  await expect(client.getForAction('/api/news', decode)).rejects.toMatchObject({
    code: 'timeout',
  });
  expect(transport).toHaveBeenCalledTimes(1);
});

// Anonymous Victorian election reads, including the finder query boundary.
test('Victorian election GET policy admits only the published paths', () => {
  for (const path of [
    '/api/app/v1/vic-election',
    '/api/app/v1/vic-election/seat/albert-park',
    '/api/app/v1/vic-election/find?q=St%20Kilda',
    '/api/app/v1/vic-election/find?q=3350',
  ])
    expect(() => assertAllowedPath(path)).not.toThrow();
  for (const path of [
    '/api/app/v1/vic-election?x=1',
    '/api/app/v1/vic-election/seat/Bad_slug',
    '/api/app/v1/vic-election/seat/albert-park?q=x',
    '/api/app/v1/vic-election/find',
    '/api/app/v1/vic-election/find?q=',
    '/api/app/v1/vic-election/find?q=%20',
    '/api/app/v1/vic-election/find?q=x&q=y',
    '/api/app/v1/vic-election/find?q=x&x=y',
    `/api/app/v1/vic-election/find?q=${'x'.repeat(61)}`,
  ])
    expect(() => assertAllowedPath(path)).toThrow();
});
