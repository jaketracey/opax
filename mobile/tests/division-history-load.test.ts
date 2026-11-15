import { Catalogs } from '../src/api/catalogs';
import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { ApiError } from '../src/api/errors';
import { readDivisionHistory } from '../src/features/directories/division-data';
import { pinnedBytes } from './pinned';
import { fixtureBytes } from './fixture-bytes';
import directorySnapshot from '../scripts/fixtures/directory-snapshot.json';
jest.mock('../src/api/runtime', () => ({ __esModule: true, catalogs: {} }));

// Votes in parliament reads every bill with a counted vote: about a thousand
// files. Its placeholder stood for 8 s on a local server because each read
// was saved to the offline cache, one serialised write after another, in
// batches that waited for their slowest file (ad-jank-records, 15 Nov 2026).

class MemoryStore implements CacheStore {
  entries = new Map<string, CacheEntry>();
  index: CacheIndexEntry[] = [];
  writes: string[] = [];
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
    this.writes.push(new URL(entry.url).pathname);
    this.entries.set(entry.url, entry);
  }
  async remove(url: string) {
    this.entries.delete(url);
  }
}

test('the bulk read saves no bill file, so it neither waits on the cache nor evicts the saved catalogs', async () => {
  const extraBytes = fixtureBytes(directorySnapshot);
  const transport = jest.fn(async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    return new Response(
      (Object.hasOwn(directorySnapshot.files, path)
        ? extraBytes(path)
        : pinnedBytes(path)
      ).toString(),
      { status: 200, headers: { 'cache-control': 'public, max-age=300' } },
    );
  });
  const store = new MemoryStore();
  const client = new ApiClient({
    origin: 'https://fixture.test',
    version: '1.0.0',
    build: '16',
    // Room for three records: six saved bill files would push the index out.
    cache: new CatalogCache(store, 24 * 1024 * 1024, 3),
    transport: transport as typeof fetch,
    retries: 0,
  });
  const source = new Catalogs(client);
  const index = await source.bills();
  expect(store.writes).toEqual(['/bills/index.json']);
  const six = index.data.bills.filter((b) => b.divisions > 0).slice(0, 6);
  const history = await readDivisionHistory({
    bills: async () => ({ ...index, data: { ...index.data, bills: six } }),
    bill: source.bill.bind(source),
  });
  expect(history.loaded).toBe(6);
  expect(history.failed).toBe(0);
  expect(history.rows.length).toBeGreaterThan(0);
  // Nothing was written for the six files, and the index is still saved.
  expect(store.writes).toEqual(['/bills/index.json']);
  expect(store.index.map((entry) => new URL(entry.url).pathname)).toEqual([
    '/bills/index.json',
  ]);
  // A bill opened on its own page is saved as before.
  await source.bill(six[0]!.key);
  expect(store.writes).toEqual([
    '/bills/index.json',
    `/bills/${six[0]!.key}.json`,
  ]);
});

const candidate = (n: number) => ({
  key: `au-federal-r${n + 1}`,
  divisions: 1,
  status_as_of: `2026-01-${String(28 - n).padStart(2, '0')}`,
  introduced: null,
});
const indexOf = (count: number) =>
  ({
    data: {
      generated_at: '2026-11-15',
      bills: Array.from({ length: count }, (_, n) => candidate(n)),
    },
    stale: false,
    savedAt: 1,
    etag: null,
    asOf: null,
  }) as unknown as Awaited<ReturnType<Catalogs['bills']>>;
const file = (key: string, date: string) =>
  ({
    data: {
      key,
      title: `Bill ${key}`,
      short_title: null,
      divisions: [
        {
          key: 'd1',
          date,
          house: 'senate',
          stage: 'second_reading',
          title: null,
          question: 'That the bill be read a second time.',
          ayes: 30,
          noes: 20,
          outcome: 'agreed',
        },
      ],
    },
    stale: false,
    savedAt: 1,
    etag: null,
    asOf: null,
  }) as unknown as Awaited<ReturnType<Catalogs['bill']>>;
const flush = async () => {
  for (let i = 0; i < 40; i++)
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

test('eight reads at a time, and one slow file holds one slot, not the reads queued behind it', async () => {
  const waiting = new Map<string, () => void>();
  let inFlight = 0;
  let most = 0;
  const started: string[] = [];
  const options: unknown[] = [];
  const bill = jest.fn(
    (key: string, _refresh?: boolean, _signal?: AbortSignal, opts?: unknown) =>
      new Promise<Awaited<ReturnType<Catalogs['bill']>>>((resolve) => {
        started.push(key);
        options.push(opts);
        most = Math.max(most, ++inFlight);
        const land = () => {
          inFlight--;
          resolve(
            file(
              key,
              `2026-02-${String(started.indexOf(key) + 1).padStart(2, '0')}`,
            ),
          );
        };
        // The first file is the slow one.
        if (key === 'au-federal-r1') waiting.set(key, land);
        else setTimeout(land, 0);
      }),
  );
  const published: number[] = [];
  const reading = readDivisionHistory(
    { bills: async () => indexOf(20), bill: bill as Catalogs['bill'] },
    false,
    (record) => published.push(record.rows.length),
  );
  await flush();
  // Every other file has been asked for and has landed behind the slow one
  // (a batch of eight would still be waiting with twelve unasked).
  expect(started).toHaveLength(20);
  expect(most).toBe(8);
  expect(published).toEqual([]);
  expect(
    options.every((o) => (o as { persist?: boolean }).persist === false),
  ).toBe(true);
  waiting.get('au-federal-r1')!();
  const record = await reading;
  // Published once, whole, newest first whatever order the files landed in.
  expect(published).toEqual([20]);
  expect(record.loaded).toBe(20);
  expect(record.rows.map((row) => row.date)).toEqual(
    [...record.rows.map((row) => row.date)].sort().reverse(),
  );
});

test('with nothing saved and no connection the read fails as offline, not as a broken record', async () => {
  const offline = new ApiError('offline', 'Not saved on this iPhone yet.');
  await expect(
    readDivisionHistory({
      bills: async () => indexOf(3),
      bill: (() => Promise.reject(offline)) as unknown as Catalogs['bill'],
    }),
  ).rejects.toBe(offline);
  await expect(
    readDivisionHistory({
      bills: async () => indexOf(3),
      bill: (() =>
        Promise.reject(
          new ApiError('http', 'no'),
        )) as unknown as Catalogs['bill'],
    }),
  ).rejects.toMatchObject({ code: 'http' });
});

test('offline with only the index saved, the page hears "not saved" after one wave of eight single attempts', async () => {
  const extraBytes = fixtureBytes(directorySnapshot);
  let online = true;
  const asked: string[] = [];
  const transport = jest.fn(async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    asked.push(path);
    if (!online) throw new TypeError('Network request failed');
    return new Response(
      (Object.hasOwn(directorySnapshot.files, path)
        ? extraBytes(path)
        : pinnedBytes(path)
      ).toString(),
      { status: 200, headers: { 'cache-control': 'public, max-age=300' } },
    );
  });
  // The app's own client settings: two retries, with their 300 and 600 ms
  // pauses, unless the read asks for none.
  const client = new ApiClient({
    origin: 'https://fixture.test',
    version: '1.0.0',
    build: '16',
    cache: new CatalogCache(new MemoryStore()),
    transport: transport as typeof fetch,
  });
  const source = new Catalogs(client);
  const index = await source.bills();
  const candidates = index.data.bills.filter((b) => b.divisions > 0);
  expect(candidates.length).toBeGreaterThan(900);
  online = false;
  asked.length = 0;
  const started = Date.now();
  const failure = await readDivisionHistory(source).catch((error) => error);
  // Three attempts a file took 16 files 1.8 s: about 110 s for them all.
  expect(Date.now() - started).toBeLessThan(2000);
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure.code).toBe('offline');
  expect(asked).toHaveLength(8);
  expect(new Set(asked).size).toBe(8);
});
