import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { RecordSearch } from '../src/features/search/api';
import { defaultFilters } from '../src/features/search/contracts';
import { searchFixture } from '../scripts/search-fixture';
import { roster } from './pinned';
class Store implements CacheStore {
  index: CacheIndexEntry[] = [];
  data = new Map<string, CacheEntry>();
  async readIndex() {
    return this.index;
  }
  async writeIndex(v: CacheIndexEntry[]) {
    this.index = v;
  }
  async read(url: string) {
    return this.data.get(url);
  }
  async write(v: CacheEntry) {
    this.data.set(v.url, v);
  }
  async remove(url: string) {
    this.data.delete(url);
  }
}
function service(transport: typeof fetch) {
  return new RecordSearch(
    new ApiClient({
      origin: 'https://example.test',
      version: '0.1.0',
      build: '7',
      cache: new CatalogCache(new Store()),
      transport,
      retries: 2,
      sleep: async () => undefined,
    }),
  );
}
test('a failing paid action is one request, with no automatic retry; a later explicit retry makes one new request', async () => {
  const transport = jest.fn(async () => new Response('{}', { status: 503 }));
  const api = service(transport);
  await expect(api.search('housing', defaultFilters)).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(1);
  await expect(api.search('housing', defaultFilters)).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(2);
});
test('session and in-flight reuse covers search, summary and briefs, with the public client headers and the exact web SSE request', async () => {
  const transport = jest.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe('omit');
      const fixture = searchFixture(new URL(String(url)), roster)!;
      return new Response(fixture.body.toString(), {
        headers: {
          'content-type': fixture.contentType ?? 'application/json',
          'cache-control': 'no-store',
        },
      });
    },
  );
  const api = service(transport);
  expect(transport).not.toHaveBeenCalled();
  const f = { ...defaultFilters, kind: 'speech' };
  const [a, b] = await Promise.all([
    api.search('housing', f),
    api.search('housing', f),
  ]);
  expect(a).toBe(b);
  expect(transport).toHaveBeenCalledTimes(1);
  await api.search('housing', f);
  expect(transport).toHaveBeenCalledTimes(1);
  await api.summary('housing', f);
  await api.summary('housing', f);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(String(transport.mock.calls[1]![0])).toContain(
    '/api/search-summary?stream=1&q=housing&kind=speech&mode=hybrid&page=1&per=20&sort=relevance',
  );
  await api.briefs(a.data.results.map((r) => r.resource));
  await api.briefs(a.data.results.map((r) => r.resource));
  expect(transport).toHaveBeenCalledTimes(3);
  expect(transport.mock.calls[0]![1]).toMatchObject({
    method: 'GET',
    credentials: 'omit',
    redirect: 'manual',
    headers: { 'User-Agent': 'OPAX-iOS/0.1.0 (7)' },
  });
});
