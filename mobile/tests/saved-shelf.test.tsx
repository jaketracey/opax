import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { ApiClient } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { LinkRow } from '../src/design/rows';
import { ContentUnavailable } from '../src/design/states';
import { RecordLoadError } from '../src/features/records/RecordLoadError';
import {
  readSavedShelf,
  SHELF_ROWS,
  type ShelfItem,
} from '../src/features/records/saved-shelf';
import {
  setShelfReaderForTests,
  SHELF_WAIT_MS,
} from '../src/features/records/SavedShelf';
import { index, manifest, pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({ apiClient: {} }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Pressable } = jest.requireActual('react-native');
  const Link = ({ children, ...props }: { children: unknown }) =>
    React.createElement(Pressable, props, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    ...jest.requireActual('expo-router'),
    Link,
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

class MemoryStore implements CacheStore {
  entries: CacheEntry[] = [];
  index: CacheIndexEntry[] = [];
  writes = 0;
  async readIndex() {
    return this.index;
  }
  async writeIndex(entries: CacheIndexEntry[]) {
    this.writes += 1;
    this.index = entries;
  }
  async read(url: string) {
    return this.entries.find((entry) => entry.url === url);
  }
  async write(entry: CacheEntry) {
    this.writes += 1;
    this.entries = [
      entry,
      ...this.entries.filter((item) => item.url !== entry.url),
    ];
  }
  async remove(url: string) {
    this.writes += 1;
    this.entries = this.entries.filter((entry) => entry.url !== url);
  }
}
const origin = 'https://example.test';
const BILL_A = 'au-federal-r7534';
const BILL_B = 'au-federal-r7549';
const seatOf = (id: string) =>
  index.electorates.find((row) => row.electorate_id === id)!;
const seat = seatOf('el_5d600e7f6dca5b72ae04d686');
const otherSeat = seatOf('el_ef31724e8e3b5d238b28454d');
const billTitle = (key: string) =>
  (pinned(`/bills/${key}.json`) as { title: string }).title;

function setup() {
  const store = new MemoryStore();
  const cache = new CatalogCache(store);
  const transport = jest.fn(async () => {
    throw new Error('The shelf must never use the network');
  });
  const client = new ApiClient({
    origin,
    version: '1.0.0',
    build: '1',
    cache,
    transport: transport as unknown as typeof fetch,
    retries: 0,
  });
  const save = (path: string, validatedAt: number, body = pinned(path)) =>
    cache.put({
      url: `${origin}${path}`,
      body,
      savedAt: validatedAt,
      validatedAt,
      expiresAt: validatedAt + 1,
      asOf: null,
    });
  return { store, cache, client, transport, save };
}

describe('the saved copies the shelf reads', () => {
  test('bills and electorates with their own saved file, newest first, titled from the saved copy', async () => {
    const { client, save, store, transport } = setup();
    await save('/electorates/manifest.json', 50);
    await save('/bills/index.json', 90);
    await save('/parliamentarians.json', 80);
    await save(`/bills/${BILL_A}.json`, 10);
    await save(seat.detail_url, 30);
    await save(`/bills/${BILL_B}.json`, 20);
    const writes = store.writes;
    const shelf = await readSavedShelf(client);
    expect(shelf).toEqual([
      {
        key: seat.detail_url,
        kind: 'Electorate',
        title: seat.name,
        route: {
          pathname: '/electorate/[id]',
          params: { id: seat.electorate_id },
        },
      },
      {
        key: `/bills/${BILL_B}.json`,
        kind: 'Bill',
        title: billTitle(BILL_B),
        route: { pathname: '/bill/[key]', params: { key: BILL_B } },
      },
      {
        key: `/bills/${BILL_A}.json`,
        kind: 'Bill',
        title: billTitle(BILL_A),
        route: { pathname: '/bill/[key]', params: { key: BILL_A } },
      },
    ]);
    // Read only: no network, and nothing written, added or removed.
    expect(transport).not.toHaveBeenCalled();
    expect(store.writes).toBe(writes);
  });

  test('nothing saved, or only catalogue files, is no shelf', async () => {
    const { client, save } = setup();
    await expect(readSavedShelf(client)).resolves.toEqual([]);
    await save('/bills/index.json', 90);
    await save('/electorates/manifest.json', 50);
    await expect(readSavedShelf(client)).resolves.toEqual([]);
  });

  test('a copy that no longer validates, and a seat of another release, are skipped', async () => {
    const { client, save } = setup();
    await save(`/bills/${BILL_A}.json`, 40, { key: BILL_A });
    await save(`/bills/${BILL_B}.json`, 30);
    // The seat's file is saved, but under a release this device has not
    // saved a manifest for: the page would not read it.
    await save(
      otherSeat.detail_url.replace(manifest.release_id, '0123456789abcdef'),
      20,
      pinned(otherSeat.detail_url),
    );
    await save('/electorates/manifest.json', 10);
    expect((await readSavedShelf(client)).map((item) => item.key)).toEqual([
      `/bills/${BILL_B}.json`,
    ]);
    // With no manifest saved at all, no electorate is listed.
    const bare = setup();
    await bare.save(seat.detail_url, 5);
    await expect(readSavedShelf(bare.client)).resolves.toEqual([]);
  });

  test(`at most ${SHELF_ROWS} rows`, async () => {
    const { client, save } = setup();
    const body = pinned(`/bills/${BILL_A}.json`) as Record<string, unknown>;
    for (let n = 0; n < 8; n += 1)
      await save(`/bills/au-federal-r90${n}.json`, n + 1, {
        ...body,
        key: `au-federal-r90${n}`,
      });
    const shelf = await readSavedShelf(client);
    expect(shelf.map((item) => item.key)).toEqual(
      [7, 6, 5, 4, 3].map((n) => `/bills/au-federal-r90${n}.json`),
    );
  });

  test('the cache lists its saved copies without the session-only searches', async () => {
    const { cache, client, save } = setup();
    await save(`/bills/${BILL_A}.json`, 10);
    await save('/api/search-all?q=budget', 99, {});
    expect(await cache.saved()).toEqual([
      { url: `${origin}/bills/${BILL_A}.json`, validatedAt: 10 },
    ]);
    expect(await client.savedPaths()).toEqual([
      { path: `/bills/${BILL_A}.json`, validatedAt: 10 },
    ]);
  });
});

describe('the offline dead end', () => {
  const offline = new ApiError('offline', 'You’re offline.');
  const items: ShelfItem[] = [
    {
      key: '/bills/au-federal-r1.json',
      kind: 'Bill',
      title: 'Fixture Bill 2026',
      route: { pathname: '/bill/[key]', params: { key: 'au-federal-r1' } },
    },
    {
      key: '/electorates/releases/0123456789abcdef/el_x.json',
      kind: 'Electorate',
      title: 'Fixture Seat',
      route: { pathname: '/electorate/[id]', params: { id: 'el_x' } },
    },
  ];
  const mounted: TestRenderer.ReactTestRenderer[] = [];
  function render(element: ReactElement) {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(element);
    });
    mounted.push(tree);
    return tree;
  }
  const view = (props: Partial<Parameters<typeof RecordLoadError>[0]> = {}) => (
    <RecordLoadError
      error={offline}
      slug=""
      onRetry={() => {}}
      testID="doc-error"
      {...props}
    />
  );
  const rows = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(LinkRow);
  const messages = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(ContentUnavailable);
  afterEach(() => {
    act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
    setShelfReaderForTests(null);
    jest.useRealTimers();
  });

  test('is drawn whole: nothing until the saved copies are read, then the message and the shelf together', async () => {
    let answer!: (items: ShelfItem[]) => void;
    setShelfReaderForTests(
      () => new Promise<ShelfItem[]>((resolve) => (answer = resolve)),
    );
    const tree = render(view());
    expect(tree.toJSON()).toBeNull();
    await act(async () => answer(items));
    expect(messages(tree)).toHaveLength(1);
    expect(messages(tree)[0]!.props.title).toMatch(/^Not saved on this /);
    expect(rows(tree).map((row) => row.props.title)).toEqual([
      'Fixture Bill 2026',
      'Fixture Seat',
    ]);
    expect(rows(tree).map((row) => row.props.detail)).toEqual([
      'Bill',
      'Electorate',
    ]);
    expect(rows(tree)[0]!.props.href).toEqual(items[0]!.route);
    const group = tree.root.find(
      (node) =>
        node.props.testID === 'doc-error-saved' && 'header' in node.props,
    );
    expect(group.props.header).toMatch(/^Saved on this /);
    // VoiceOver reads a row as its title, then its kind.
    const drawn = tree.root.find(
      (node) =>
        node.props.testID === 'doc-error-saved-0' &&
        typeof node.type === 'string' &&
        !!node.props.accessibilityLabel,
    );
    expect(drawn.props.accessibilityLabel).toBe('Fixture Bill 2026, Bill');
  });

  test('with nothing saved it is the message alone', async () => {
    setShelfReaderForTests(async () => []);
    const tree = render(view());
    await act(async () => {});
    expect(messages(tree)).toHaveLength(1);
    expect(rows(tree)).toHaveLength(0);
  });

  test('a slow or failed read is no shelf, and a late answer never adds one', async () => {
    jest.useFakeTimers();
    let answer!: (items: ShelfItem[]) => void;
    setShelfReaderForTests(
      () => new Promise<ShelfItem[]>((resolve) => (answer = resolve)),
    );
    const tree = render(view());
    act(() => {
      jest.advanceTimersByTime(SHELF_WAIT_MS - 1);
    });
    expect(tree.toJSON()).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(messages(tree)).toHaveLength(1);
    await act(async () => answer(items));
    expect(rows(tree)).toHaveLength(0);
    jest.useRealTimers();
    setShelfReaderForTests(async () => {
      throw new Error('unreadable');
    });
    const failed = render(view());
    await act(async () => {});
    expect(messages(failed)).toHaveLength(1);
    expect(rows(failed)).toHaveLength(0);
  });

  test('nothing is read online, for a missing record, or in a sheet', async () => {
    const read = jest.fn(async () => items);
    setShelfReaderForTests(read);
    const failed = render(view({ error: new Error('broken') }));
    const missing = render(
      view({ error: new ApiError('not-found', 'Not found.') }),
    );
    const sheet = render(view({ sheet: true }));
    await act(async () => {});
    expect(read).not.toHaveBeenCalled();
    for (const tree of [failed, missing, sheet]) {
      expect(messages(tree)).toHaveLength(1);
      expect(rows(tree)).toHaveLength(0);
    }
    // The first frame of each is already its message.
    setShelfReaderForTests(() => new Promise<ShelfItem[]>(() => {}));
    expect(messages(render(view({ sheet: true })))).toHaveLength(1);
  });
});
