import * as Location from 'expo-location';
import { suggestFromLocation } from '../src/features/electorate-map/location';
import { Catalogs, decodeElectorateIndex } from '../src/api/catalogs';
import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
} from '../src/api/cache';
import { pinned } from './pinned';
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
let mockCatalogs: Catalogs;
jest.mock('../src/api/runtime', () => ({
  catalogs: { electorate: (path: string) => mockCatalogs.electorate(path) },
}));
const seats = decodeElectorateIndex(
  pinned(
    (pinned('/electorates/manifest.json') as { index_url: string }).index_url,
  ),
).electorates;
test('a real ApiClient request and cache-write audit never receive the device fix; repeat is cached', async () => {
  const entries = new Map<string, CacheEntry>();
  let index: CacheIndexEntry[] = [];
  const writes = jest.fn(async (e: CacheEntry) => {
    entries.set(e.url, e);
  });
  const cache = new CatalogCache(
    {
      readIndex: async () => index,
      writeIndex: async (v) => {
        index = v;
      },
      read: async (u) => entries.get(u),
      write: writes,
      remove: async (u) => {
        entries.delete(u);
      },
    },
    24 * 1024 * 1024,
    220,
  );
  const request = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(pinned(new URL(String(input)).pathname)), {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=3600' },
      }),
  );
  mockCatalogs = new Catalogs(
    new ApiClient({
      origin: 'https://fixture.invalid',
      version: '0.1.0',
      build: '4',
      cache,
      transport: request,
      retries: 0,
    }),
  );
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: { longitude: 151.145123456, latitude: -33.900123456, accuracy: 20 },
  });
  const before = jest.spyOn(console, 'log');
  const result = await suggestFromLocation(
    seats,
    () => {},
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    kind: 'suggested',
    seat: { name: 'Grayndler' },
  });
  expect(request).toHaveBeenCalledTimes(150);
  for (const [input, init] of request.mock.calls) {
    expect(new URL(String(input)).search).toBe('');
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.body).toBeUndefined();
  }
  const evidence = JSON.stringify({
    requests: request.mock.calls,
    writes: writes.mock.calls,
    result,
    logs: before.mock.calls,
  });
  expect(evidence).not.toContain('151.145123456');
  expect(evidence).not.toContain('-33.900123456');
  expect(evidence).not.toMatch(/"(?:latitude|longitude|coords)"/);
  await suggestFromLocation(seats, () => {}, new AbortController().signal);
  expect(request).toHaveBeenCalledTimes(150);
  before.mockRestore();
});
test('denial neither reads a fix nor requests outlines', async () => {
  jest.clearAllMocks();
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'denied',
  });
  expect(
    await suggestFromLocation(seats, () => {}, new AbortController().signal),
  ).toEqual({ kind: 'denied' });
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
});
