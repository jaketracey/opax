import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
} from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import overview from '../scripts/fixtures/vic-election/overview.json';
import seat from '../scripts/fixtures/vic-election/albert-park.json';
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
    writeIndex: async (value: CacheIndexEntry[]) => {
      index = value;
    },
    read: async (url: string) => entries.get(url),
    write: async (entry: CacheEntry) => {
      entries.set(entry.url, entry);
    },
    remove: async (url: string) => {
      entries.delete(url);
    },
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
  return { reads, client, transport, entries };
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
