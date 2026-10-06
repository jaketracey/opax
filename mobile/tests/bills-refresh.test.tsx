import { act } from 'react';
import { useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { createHash } from 'node:crypto';
import { Catalogs } from '../src/api/catalogs';
import { ApiClient } from '../src/api/client';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { catalogs as runtime } from '../src/api/runtime';
import BillDetail from '../src/features/bills/BillDetail';
import BillsList from '../src/features/bills/BillsList';
import { pinned, pinnedBytes, slugs } from './pinned';

const mockParams: { key: string } = { key: 'au-federal-r7501' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    bills: jest.fn(),
    billFor: jest.fn(),
    roster: jest.fn(),
    slugs: jest.fn(),
  },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mock = jest.mocked(runtime);
// Pinned files, decoded without a cache.
const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
function use(catalogs: Catalogs) {
  mock.bills.mockImplementation((refresh) => catalogs.bills(refresh));
  mock.billFor.mockImplementation((key, refresh) =>
    catalogs.billFor(key, refresh),
  );
  mock.roster.mockImplementation(() => catalogs.roster());
  mock.slugs.mockImplementation(() => catalogs.slugs());
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  use(fixture);
});
async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
// The screen's own native refresh control (the first one in the tree).
const pull = (root: ReactTestInstance) =>
  act(async () =>
    root
      .findAll((node) => !!node.props.refreshControl)[0]!
      .props.refreshControl.props.onRefresh(),
  );

test.each([
  ['the Bills list', () => <BillsList />, 'bills', []],
  ['a bill', () => <BillDetail />, 'billFor', ['au-federal-r7501']],
] as const)(
  '%s forces its loader on a refresh, and not on the first load',
  async (_name, screen, loader, args) => {
    const renderer = await render(screen());
    expect(mock[loader]).toHaveBeenCalledTimes(1);
    expect(mock[loader]).toHaveBeenLastCalledWith(...args, false);
    await pull(renderer.root);
    expect(mock[loader]).toHaveBeenCalledTimes(2);
    expect(mock[loader]).toHaveBeenLastCalledWith(...args, true);
    act(() => renderer.unmount());
  },
);

// The real client and cache over the pinned files, served for an hour (the
// published JSON cache policy), counting reads that reach the network.
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
function cachedCatalogs() {
  const reads: string[] = [];
  const transport = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    reads.push(path);
    const bytes =
      path === '/api/person-slugs'
        ? Buffer.from(JSON.stringify(slugs))
        : pinnedBytes(path);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        ETag: `"${createHash('sha256').update(bytes).digest('hex')}"`,
      },
    });
  }) as typeof fetch;
  const client = new ApiClient({
    origin: 'https://example.test',
    version: '0.1.0',
    build: '1',
    cache: new CatalogCache(new MemoryStore()),
    transport,
    now: () => 1000,
    retries: 0,
  });
  return { catalogs: new Catalogs(client), reads };
}
test.each([
  ['the Bills list', () => <BillsList />, ['/bills/index.json']],
  [
    'a bill',
    () => <BillDetail />,
    ['/bills/au-federal-r7501.json', '/bills/index.json'],
  ],
] as const)(
  '%s re-reads still-fresh cached files from the network on a refresh',
  async (_name, screen, paths) => {
    const { catalogs, reads } = cachedCatalogs();
    use(catalogs);
    const renderer = await render(screen());
    for (const path of paths)
      expect(reads.filter((p) => p === path)).toHaveLength(1);
    await pull(renderer.root);
    for (const path of paths)
      expect(reads.filter((p) => p === path)).toHaveLength(2);
    act(() => renderer.unmount());
  },
);
