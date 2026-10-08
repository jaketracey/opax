import { Catalogs } from '../src/api/catalogs';
import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import * as runtime from '../src/api/runtime';
import { loadDirectory } from '../src/features/directories/data';
import { readDivisionHistory } from '../src/features/directories/division-data';
import { pinnedBytes, slugs } from './pinned';
import { fixtureBytes } from './fixture-bytes';
import directorySnapshot from '../scripts/fixtures/directory-snapshot.json';
jest.mock('../src/api/runtime', () => ({ __esModule: true, catalogs: {} }));

class MemoryStore implements CacheStore {
  entries = new Map<string, CacheEntry>();
  index: CacheIndexEntry[] = [];
  async readIndex() {
    return this.index;
  }
  async writeIndex(index: CacheIndexEntry[]) {
    this.index = index;
  }
  async read(url: string) {
    return this.entries.get(url);
  }
  async write(entry: CacheEntry) {
    this.entries.set(entry.url, entry);
  }
  async remove(url: string) {
    this.entries.delete(url);
  }
}

test('opening all native directories and division history issues only static reads; catalog back-navigation is cached', async () => {
  const paths: string[] = [];
  const extraBytes = fixtureBytes(directorySnapshot);
  const transport = jest.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const address = new URL(String(url));
      expect(address.origin).toBe('https://fixture.test');
      expect(init?.method).toBe('GET');
      paths.push(address.pathname);
      // Fail any paid call at the transport boundary, even if another lane allows it.
      expect(address.search).toBe('');
      expect(
        address.pathname.startsWith('/api/') &&
          address.pathname !== '/api/person-slugs',
      ).toBe(false);
      const body =
        address.pathname === '/api/person-slugs'
          ? JSON.stringify(slugs)
          : (Object.hasOwn(directorySnapshot.files, address.pathname)
              ? extraBytes(address.pathname)
              : pinnedBytes(address.pathname)
            ).toString();
      return new Response(body, {
        status: 200,
        headers: { 'cache-control': 'public, max-age=300' },
      });
    },
  );
  const client = new ApiClient({
    origin: 'https://fixture.test',
    version: '1.0.0',
    build: '16',
    cache: new CatalogCache(new MemoryStore()),
    transport: transport as typeof fetch,
    retries: 0,
  });
  const source = new Catalogs(client);
  const replaced = jest.replaceProperty(runtime, 'catalogs', source);
  try {
    const people = await loadDirectory('person');
    const parties = await loadDirectory('party');
    const electorates = await loadDirectory('electorate');
    expect(people.people).toHaveLength(1090);
    expect(parties.parties.length).toBeGreaterThan(10);
    expect(electorates.electorates).toHaveLength(625);
    const beforeReturn = paths.length;
    await loadDirectory('person');
    await loadDirectory('party');
    await loadDirectory('electorate');
    expect(paths).toHaveLength(beforeReturn);
    const index = await source.bills();
    const history = await readDivisionHistory({
      bills: async () => ({
        ...index,
        data: {
          ...index.data,
          bills: index.data.bills.filter((b) => b.divisions > 0).slice(0, 3),
        },
      }),
      bill: source.bill.bind(source),
    });
    expect(history.loaded).toBe(3);
    expect(history.failed).toBe(0);
    expect(paths.filter((p) => p.startsWith('/bills/'))).toHaveLength(4);
    expect(paths).toContain('/graph/money.qld.json');
    expect(paths).toContain('/graph/money.vic.json');
  } finally {
    replaced.restore();
  }
});
