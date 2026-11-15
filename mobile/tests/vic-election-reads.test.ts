import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
} from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import overview from '../scripts/fixtures/vic-election/overview.json';
import seat from '../scripts/fixtures/vic-election/albert-park.json';
import finder from '../scripts/fixtures/vic-election/find-st-kilda.json';
import { decodeElectorateIndex } from '../src/api/catalogs';
import { manifest, pinned } from './pinned';
import { decodeOverview } from '../src/features/vic-election/decoders';
import {
  ElectionReads,
  ElectionUnavailable,
  overviewPath,
} from '../src/features/vic-election/reads';
jest.mock('../src/api/runtime', () => ({ apiClient: {} }));
function setup() {
  const entries = new Map<string, CacheEntry>();
  let index: CacheIndexEntry[] = [];
  const store = {
    readIndex: async () => index,
    writeIndex: jest.fn(async (value: CacheIndexEntry[]) => {
      index = value;
    }),
    read: async (url: string) => entries.get(url),
    write: jest.fn(async (entry: CacheEntry) => {
      entries.set(entry.url, entry);
    }),
    remove: jest.fn(async (url: string) => {
      entries.delete(url);
    }),
  };
  const transport = jest.fn();
  const client = new ApiClient({
    origin: 'https://fixture.test',
    version: '1',
    build: '1',
    cache: new CatalogCache(store),
    transport,
    retries: 0,
  });
  const reads = new ElectionReads(client);
  return { reads, client, transport, entries, store, index: () => index };
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'cache-control': 'public, max-age=300' },
  });
test('overview withdrawal deletes a cached payload and updates every subscriber', async () => {
  const { reads, client, transport, entries } = setup();
  transport.mockResolvedValueOnce(reply(overview));
  await reads.loadOverview();
  expect(reads.overview.record?.data.title).toBe(overview.title);
  expect(await client.saved(overviewPath, decodeOverview)).not.toBeNull();
  const listener = jest.fn();
  reads.subscribe(listener);
  transport.mockResolvedValueOnce(reply({ error: 'not_published' }, 404));
  await reads.loadOverview();
  expect(reads.overview.record).toBeNull();
  expect(reads.overview.error).toBeInstanceOf(ElectionUnavailable);
  expect(await client.saved(overviewPath, decodeOverview)).toBeNull();
  expect(entries.size).toBe(0);
  expect(listener).toHaveBeenCalled();
});
test('network failure retains the saved copy, while a cold failure is visible', async () => {
  const { reads, transport } = setup();
  transport.mockResolvedValueOnce(reply(overview));
  await reads.loadOverview();
  transport.mockRejectedValue(new Error('offline'));
  await reads.loadOverview();
  expect(reads.overview.record?.stale).toBe(true);
  const cold = setup();
  cold.transport.mockRejectedValue(new Error('offline'));
  await cold.reads.loadOverview();
  expect(cold.reads.overview.record).toBeNull();
  expect(cold.reads.overview.error).toBeTruthy();
});
test('50 revalidations reuse one absence wrapper and one decoded snapshot per decoder', async () => {
  const { reads, client, transport, entries } = setup();
  const get = jest.spyOn(client, 'get');
  const decode = jest.fn(decodeOverview);
  transport.mockResolvedValueOnce(reply(overview));
  const first = await reads.read(overviewPath, decode);
  const snapshots = new Set([first.data]);
  transport.mockImplementation(async () => new Response(null, { status: 304 }));
  const secondReader = new ElectionReads(client);
  for (let i = 0; i < 50; i++) {
    const reader = i % 2 ? reads : secondReader;
    snapshots.add((await reader.read(overviewPath, decode)).data);
  }
  expect(transport).toHaveBeenCalledTimes(51);
  expect(new Set(get.mock.calls.map((call) => call[1])).size).toBe(1);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(snapshots.size).toBe(1);
  expect(entries.size).toBe(1);

  const otherDecoder = jest.fn(decodeOverview);
  const other = await reads.read(overviewPath, otherDecoder);
  expect(other.data).not.toBe(first.data);
  expect(other.data).toEqual(first.data);
  expect(otherDecoder).toHaveBeenCalledTimes(1);
  await secondReader.read(overviewPath, otherDecoder);
  expect(otherDecoder).toHaveBeenCalledTimes(1);
  expect(new Set(get.mock.calls.map((call) => call[1])).size).toBe(2);
});
test('seat not_found is distinct from a withdrawn hub', async () => {
  const { reads, transport } = setup();
  transport.mockResolvedValueOnce(reply(seat));
  await reads.seat('albert-park');
  transport.mockResolvedValueOnce(reply({ error: 'not_found' }, 404));
  await expect(reads.seat('missing')).rejects.toMatchObject({
    reason: 'not_found',
  });
});
test('finder uses a trimmed, bounded query and forwards cancellation', async () => {
  const { reads, transport } = setup();
  const controller = new AbortController();
  controller.abort();
  await expect(
    reads.find(' St Kilda ', controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(transport).not.toHaveBeenCalled();
});
test('a finder response and its query never write a disk entry or index', async () => {
  const { reads, transport, entries, store, index } = setup();
  transport.mockResolvedValueOnce(reply(finder));
  expect((await reads.find(' St Kilda ')).data).toEqual(finder);
  expect(store.write).not.toHaveBeenCalled();
  expect(store.writeIndex).not.toHaveBeenCalled();
  expect(entries.size).toBe(0);
  expect(index()).toEqual([]);
});
test('the saved electorate catalog survives 50 different seat-finder queries', async () => {
  const { reads, client, transport, entries, store, index } = setup();
  const path = manifest.index_url;
  transport.mockResolvedValueOnce(reply(pinned(path)));
  await client.get(path, decodeElectorateIndex);
  const savedIndex = [...index()];
  const savedEntries = new Map(entries);
  store.write.mockClear();
  store.writeIndex.mockClear();
  store.remove.mockClear();
  transport.mockImplementation(async (url: string) =>
    reply({ ...finder, q: new URL(url).searchParams.get('q') }),
  );
  for (let i = 0; i < 50; i++) await reads.find(`Test suburb ${i}`);
  expect(store.write).not.toHaveBeenCalled();
  expect(store.writeIndex).not.toHaveBeenCalled();
  expect(store.remove).not.toHaveBeenCalled();
  expect(index()).toEqual(savedIndex);
  expect(entries).toEqual(savedEntries);
  transport.mockRejectedValue(new Error('offline'));
  const saved = await client.get(path, decodeElectorateIndex, true);
  expect(saved.stale).toBe(true);
  expect(saved.data.electorates.length).toBeGreaterThan(0);
});
test('old disk finder URLs are removed when the catalog index loads', async () => {
  const { client, entries, store, index } = setup();
  const url = `https://fixture.test${overviewPath}/find?q=3350`;
  const entry = {
    url,
    body: finder,
    savedAt: 1,
    validatedAt: 1,
    expiresAt: 1,
    asOf: null,
  };
  entries.set(url, entry);
  await store.writeIndex([
    { url, bytes: 1, validatedAt: 1, bucket: 'catalog' },
  ]);
  await client.saved(overviewPath, decodeOverview);
  expect(entries.has(url)).toBe(false);
  expect(index()).toEqual([]);
});

describe('the shared read (Today’s state row)', () => {
  const headers = (transport: jest.Mock, call: number) =>
    (transport.mock.calls[call]![1] as { headers: Record<string, string> })
      .headers;
  test('adds no request beside a read in flight or a record at hand', async () => {
    const { reads, transport } = setup();
    transport.mockResolvedValue(reply(overview));
    // The block's forced read and the shared read, together: one request.
    await Promise.all([reads.loadOverview(), reads.loadOverviewShared()]);
    expect(transport).toHaveBeenCalledTimes(1);
    // The record is at hand: nothing more is asked, mount after mount.
    await reads.loadOverviewShared();
    await reads.loadOverviewShared();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(reads.overview.record?.data.title).toBe(overview.title);
  });
  test('asks through the cache: never no-cache, a fresh saved copy answers, a stale one is revalidated with If-None-Match', async () => {
    const { client, transport } = setup();
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify(overview), {
        status: 200,
        headers: { 'cache-control': 'public, max-age=300', etag: '"v1"' },
      }),
    );
    // A cold shared read reaches the origin once, without forcing it.
    const first = new ElectionReads(client);
    await first.loadOverviewShared();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(headers(transport, 0)['Cache-Control']).toBeUndefined();
    // A new session with the copy still fresh: the cache answers.
    const second = new ElectionReads(client);
    await second.loadOverviewShared();
    expect(second.overview.record?.data.title).toBe(overview.title);
    expect(transport).toHaveBeenCalledTimes(1);
    // The block's own read is the forced one.
    transport.mockResolvedValueOnce(reply(overview));
    await second.loadOverview();
    expect(headers(transport, 1)['Cache-Control']).toBe('no-cache');
    expect(headers(transport, 1)['If-None-Match']).toBe('"v1"');
  });
  test('a withdrawal answers the shared read as it does the block’s', async () => {
    const { reads, transport } = setup();
    transport.mockResolvedValueOnce(reply({ error: 'not_published' }, 404));
    await reads.loadOverviewShared();
    expect(reads.overview.record).toBeNull();
    expect(reads.overview.loading).toBe(false);
    expect(reads.overview.error).toBeInstanceOf(ElectionUnavailable);
  });
});
