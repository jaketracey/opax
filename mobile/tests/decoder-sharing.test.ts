// Overlapping reads share a request only when they pass the same decoder
// (ApiClient.get). These callers built a decoder on every call, so their
// reads never shared; each now passes one function per address or key.
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { Catalogs } from '../src/api/catalogs';
import { ApiClient } from '../src/api/client';
import { decoderPerKey } from '../src/api/decoder-memo';
import { apiClient } from '../src/api/runtime';
import { ExploreRepository } from '../src/features/explore/repository';
import { loadRecipientGrant } from '../src/features/money-public/recipient-grant';

type Held = { url: string; answer: (response: Response) => void };
const mockCalls: Held[] = [];
jest.mock('../src/api/runtime', () => {
  const { ApiClient: Client } = jest.requireActual('../src/api/client');
  const { CatalogCache: Cache } = jest.requireActual('../src/api/cache');
  const entries = new Map<string, unknown>();
  let index: unknown[] = [];
  return {
    apiClient: new Client({
      origin: 'https://fixture.test',
      version: '1.0.0',
      build: '1',
      retries: 0,
      cache: new Cache({
        readIndex: async () => index,
        writeIndex: async (next: unknown[]) => {
          index = next;
        },
        read: async (url: string) => entries.get(url),
        write: async (entry: { url: string }) => {
          entries.set(entry.url, entry);
        },
        remove: async (url: string) => {
          entries.delete(url);
        },
      }),
      transport: (url: string) =>
        new Promise<Response>((answer) =>
          mockCalls.push({ url: String(url), answer }),
        ),
    }),
  };
});

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
/** A client whose transport answers only when the test lets it. */
function held() {
  const calls: Held[] = [];
  const client = new ApiClient({
    origin: 'https://fixture.test',
    version: '1.0.0',
    build: '1',
    retries: 0,
    cache: new CatalogCache(new MemoryStore()),
    transport: ((url: string) =>
      new Promise<Response>((answer) =>
        calls.push({ url: String(url), answer }),
      )) as unknown as typeof fetch,
  });
  return { client, calls };
}
/** Lets the reads reach the transport, and any second request show itself. */
const settled = async () => {
  for (let turn = 0; turn < 60; turn++)
    await new Promise((resolve) => setImmediate(resolve));
};
const paths = (calls: Held[]) =>
  calls.map((call) => new URL(call.url).pathname);
const reply = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'cache-control': 'public, max-age=300' },
  });

beforeEach(() => {
  mockCalls.length = 0;
});

test('a decoder per key is the same function for the same key, and bounded', () => {
  const made: number[] = [];
  const decoder = decoderPerKey((key: number) => {
    made.push(key);
    return (raw: unknown) => [key, raw] as const;
  }, 2);
  expect(decoder(1)).toBe(decoder(1));
  expect(decoder(1)).not.toBe(decoder(2));
  expect(decoder(1)(7)).toEqual([1, 7]);
  expect(made).toEqual([1, 2]);
  // A third key drops the oldest; asked again, it is made again.
  decoder(3);
  decoder(1);
  expect(made).toEqual([1, 2, 3, 1]);
});

test('Leads and a lead’s page, reading discovery at once, are one request', async () => {
  const { client, calls } = held();
  const catalogs = new Catalogs(client);
  const list = catalogs.discovery();
  const detail = catalogs.discovery();
  // Neither is answered: a caught rejection keeps the test quiet at exit.
  void list.catch(() => undefined);
  void detail.catch(() => undefined);
  await settled();
  expect(paths(calls)).toEqual(['/discovery.json']);
});

test('two readers of one year at once are one request; another year is its own', async () => {
  const { client, calls } = held();
  const explore = new ExploreRepository(client);
  for (const read of [
    explore.year(2019),
    explore.year(2019),
    explore.year(2020),
  ])
    void read.catch(() => undefined);
  await settled();
  expect(paths(calls).sort()).toEqual(['/years/2019.json', '/years/2020.json']);
});

test('two reads of one recipient’s award at once share the index request, then the shard’s', async () => {
  expect(apiClient).toBeDefined();
  const rid = 'r-fixture-1';
  const reads = [
    loadRecipientGrant('federal', rid, 'award-1', false),
    loadRecipientGrant('federal', rid, 'award-1', false),
  ];
  for (const read of reads) void read.catch(() => undefined);
  await settled();
  expect(paths(mockCalls)).toEqual(['/graph/grants.federal.json']);
  mockCalls[0]!.answer(
    reply({
      meta: { generated: '2026-11-01' },
      recipients: [{ id: rid, sh: 7 }],
    }),
  );
  await settled();
  // Both went on to the same shard, with the same award's decoder.
  expect(paths(mockCalls)).toEqual([
    '/graph/grants.federal.json',
    '/grants/federal/shard-07.json',
  ]);
});
