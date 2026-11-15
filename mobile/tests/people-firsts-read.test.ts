// /people/firsts.json is optional and may not be published yet. Its 404
// means "not there yet": no rows, no failure report, and one request a
// session however many profiles open. A later session that finds the file
// keeps it for the next profile to open.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { Catalogs } from '../src/api/catalogs';
import { ApiClient } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { forgetCatalogs, keptCatalogs } from '../src/api/kept-catalogs';
import {
  decodePeopleFirsts,
  memberFirsts,
  PEOPLE_FIRSTS_PATH,
} from '../src/api/people-firsts';
import { firstRows } from '../src/features/people/firsts';

const origin = 'https://example.test';
const sample = readFileSync(
  join(__dirname, 'fixtures', 'people-firsts.sample.json'),
  'utf8',
);
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
const response = (status: number, body = '') =>
  new Response(status === 200 ? body : 'Not here', {
    status,
    headers: {
      'content-type': status === 200 ? 'application/json' : 'text/plain',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
/** One app session: its own client, its own catalogs, the device's store. */
function session(store: CacheStore, answer: () => Response) {
  const transport = jest.fn(async () => answer());
  const failures: [string, unknown][] = [];
  const client = new ApiClient({
    origin,
    version: '1.0.0',
    build: '1',
    cache: new CatalogCache(store, 24 * 1024 * 1024, 220),
    transport: transport as unknown as typeof fetch,
    retries: 2,
    sleep: async () => undefined,
    onFailure: (path, failure) => failures.push([path, failure]),
  });
  return { transport, failures, client, catalogs: new Catalogs(client) };
}
/** A profile opening: it starts the read and never waits on it. */
const open = (catalogs: Catalogs) => catalogs.peopleFirsts().catch(() => null);

beforeEach(() => forgetCatalogs());

test('a file not published yet: no rows, no failure report, and one request across several profile opens', async () => {
  const store = new MemoryStore();
  const { transport, failures, catalogs } = session(store, () => response(404));
  for (let opens = 0; opens < 4; opens++)
    await expect(catalogs.peopleFirsts()).resolves.toBeNull();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(failures).toEqual([]);
  expect(keptCatalogs().firsts).toBeUndefined();
  expect(
    firstRows(
      memberFirsts(keptCatalogs().firsts, {
        name: 'Avery Example',
        pid: '90001',
      }),
    ),
  ).toEqual([]);
  // Nothing is saved in its place.
  expect(store.entries).toEqual([]);
});

test('once it is published, a new session keeps it and the next profile to open has its rows; still one request', async () => {
  const store = new MemoryStore();
  const before = session(store, () => response(404));
  await open(before.catalogs);
  forgetCatalogs();
  const after = session(store, () => response(200, sample));
  await open(after.catalogs);
  await open(after.catalogs);
  await open(after.catalogs);
  expect(after.transport).toHaveBeenCalledTimes(1);
  expect(after.failures).toEqual([]);
  expect(
    firstRows(
      memberFirsts(keptCatalogs().firsts, {
        name: 'Avery Example',
        pid: '90001',
      }),
    ).map((row) => row.testID),
  ).toEqual(['person-first-speech', 'person-first-division']);
  expect(keptCatalogs().firsts).toEqual(decodePeopleFirsts(JSON.parse(sample)));
});

test('only this optional read is silent: the same 404 on another file is reported, and so is any other failure here', async () => {
  const missing = session(new MemoryStore(), () => response(404));
  await expect(
    missing.client.get(PEOPLE_FIRSTS_PATH, decodePeopleFirsts),
  ).rejects.toMatchObject({ code: 'not-found' });
  expect(missing.failures).toHaveLength(1);
  expect(missing.failures[0]![0]).toBe(PEOPLE_FIRSTS_PATH);
  // The optional read still throws its 404 to the caller: only the report goes.
  await expect(
    missing.client.get(PEOPLE_FIRSTS_PATH, decodePeopleFirsts, false, {
      optional: true,
    }),
  ).rejects.toMatchObject({ code: 'not-found' });
  expect(missing.failures).toHaveLength(1);

  // A server fault is a fault: reported, and the next profile may ask again.
  const broken = session(new MemoryStore(), () => response(503));
  await expect(broken.catalogs.peopleFirsts()).rejects.toBeInstanceOf(ApiError);
  expect(broken.failures).toHaveLength(1);
  const asked = broken.transport.mock.calls.length;
  await expect(broken.catalogs.peopleFirsts()).rejects.toBeInstanceOf(ApiError);
  expect(broken.transport.mock.calls.length).toBeGreaterThan(asked);
  expect(broken.failures).toHaveLength(2);

  // A file that cannot be decoded is reported too.
  const bad = session(new MemoryStore(), () => response(200, '{"meta":{}}'));
  await expect(bad.catalogs.peopleFirsts()).rejects.toMatchObject({
    code: 'invalid-data',
  });
  expect(bad.failures).toHaveLength(1);
  expect(keptCatalogs().firsts).toBeUndefined();
});
