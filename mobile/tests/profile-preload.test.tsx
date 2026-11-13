import { act, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { decodeVotes } from '../src/api/catalog-decoders';
import { Catalogs, type PersonId } from '../src/api/catalogs';
import { ApiClient, dataAsOf, type RecordResult } from '../src/api/client';
import {
  PRELOAD_SETTLE_MS,
  PROFILE_PRELOAD,
  idleSlot,
  preloadProfileCatalogs,
  startProfilePreload,
  useProfilePreload,
} from '../src/features/people/profile-preload';
import { people, pinned, slugs } from './pinned';

// Any network read fails the test: the preload reads saved copies only.
jest.mock('expo/fetch', () => ({
  fetch: jest.fn(() => {
    throw new Error('The preload must not read the network');
  }),
}));
const expoFetch = jest.mocked(
  jest.requireMock<{ fetch: jest.Mock }>('expo/fetch').fetch,
);

const origin = 'https://example.test';
const NOW = 1_800_000_000_000;
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
/** Saved copies of the pinned catalogs at `paths`, as a past launch left. */
function savedOnDisk(paths: string[], expiresAt = NOW + 3_600_000) {
  const store = new MemoryStore();
  for (const path of paths) {
    const body = pinned(path);
    store.entries.push({
      url: origin + path,
      body,
      savedAt: NOW - 60_000,
      validatedAt: NOW - 60_000,
      expiresAt,
      asOf: dataAsOf(body),
      etag: '"pinned"',
    });
    store.index.push({
      url: origin + path,
      bytes: JSON.stringify(body).length,
      validatedAt: NOW - 60_000,
      bucket: 'catalog',
    });
  }
  return store;
}
function client(store: CacheStore) {
  const transport = jest.fn(async () => {
    throw new Error('The preload must not read the network');
  });
  return {
    transport,
    client: new ApiClient({
      origin,
      version: '1.0.0',
      build: '1',
      cache: new CatalogCache(store, 24 * 1024 * 1024, 220),
      transport: transport as unknown as typeof fetch,
      now: () => NOW,
      retries: 0,
    }),
  };
}
const now = async () => undefined;
const fetchSpy = jest.fn(() => {
  throw new Error('The preload must not read the network');
});
let realFetch: typeof fetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  fetchSpy.mockClear();
  expoFetch.mockClear();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
const noNetwork = (transport: jest.Mock) => {
  expect(transport).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(expoFetch).not.toHaveBeenCalled();
};

describe('the profile catalog preload', () => {
  test('reads saved copies only, skips what is not saved, and never calls the network', async () => {
    const store = savedOnDisk(['/votes.json', '/pay.json']);
    const { client: api, transport } = client(store);
    const result = await preloadProfileCatalogs(api, {
      signal: new AbortController().signal,
      first: now,
      next: now,
      active: () => true,
    });
    expect(result).toEqual({
      outcome: 'done',
      read: ['/votes.json', '/pay.json'],
      skipped: ['/expenses.json', '/expense-categories.json'],
    });
    noNetwork(transport);
  });

  test('expired saved copies are still read from disk, never revalidated', async () => {
    const store = savedOnDisk(
      PROFILE_PRELOAD.map(({ path }) => path),
      NOW - 1,
    );
    const { client: api, transport } = client(store);
    const result = await preloadProfileCatalogs(api, {
      signal: new AbortController().signal,
      first: now,
      next: now,
      active: () => true,
    });
    expect(result.read).toHaveLength(4);
    noNetwork(transport);
  });

  test('a profile read after it reuses the decoded snapshot, with no second disk read', async () => {
    const store = savedOnDisk(PROFILE_PRELOAD.map(({ path }) => path));
    const reads = jest.spyOn(store, 'read');
    const { client: api, transport } = client(store);
    const saved = jest.spyOn(api, 'saved');
    await preloadProfileCatalogs(api, {
      signal: new AbortController().signal,
      first: now,
      next: now,
      active: () => true,
    });
    const preloaded = (await saved.mock.results[0]!.value) as RecordResult<
      ReturnType<typeof decodeVotes>
    >;
    const votes = await new Catalogs(api).votes();
    // The same frozen snapshot: decoded once, by the preload.
    expect(votes.data).toBe(preloaded.data);
    expect(votes.stale).toBe(false);
    expect(
      reads.mock.calls.filter(([url]) => url.endsWith('/votes.json')),
    ).toHaveLength(1);
    noNetwork(transport);
  });

  test('its paths and decoders are the ones a profile reads', async () => {
    const calls: [string, unknown][] = [];
    const recording = {
      async get<T>(path: string, decode: (input: unknown) => T) {
        calls.push([path, decode]);
        const raw = path === '/api/person-slugs' ? slugs : pinned(path);
        return { data: decode(raw), stale: false, savedAt: 1, asOf: null };
      },
    };
    const albanese = people.people.find((p) => p.name === 'Anthony Albanese')!;
    await new Catalogs(recording).profileFor(albanese.person_id as PersonId);
    for (const { path, decode } of PROFILE_PRELOAD)
      expect(calls).toContainEqual([path, decode]);
  });

  test('reads one catalog per idle slot, so a queued tap runs first', async () => {
    const slots: (() => void)[] = [];
    const next = () => new Promise<void>((resolve) => slots.push(resolve));
    const saved = jest.fn(async () => null);
    const run = preloadProfileCatalogs(
      { saved },
      {
        signal: new AbortController().signal,
        first: now,
        next,
        active: () => true,
      },
    );
    for (let read = 1; read <= 4; read++) {
      await act(async () => undefined);
      expect(saved).toHaveBeenCalledTimes(read);
      if (read < 4) slots.shift()!();
    }
    await expect(run).resolves.toMatchObject({ outcome: 'done' });
  });

  test('stops between catalogs when cancelled, cancelling its idle callback', async () => {
    const pending = new Map<number, () => void>();
    let id = 0;
    const request = jest.fn((callback: () => void) => {
      pending.set(++id, callback);
      return id;
    });
    const cancel = jest.fn((handle: number) => pending.delete(handle));
    Object.assign(globalThis, {
      requestIdleCallback: request,
      cancelIdleCallback: cancel,
    });
    try {
      const controller = new AbortController();
      const saved = jest.fn(async () => null);
      const run = preloadProfileCatalogs(
        { saved },
        { signal: controller.signal, first: now, active: () => true },
      );
      await act(async () => undefined);
      expect(saved).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledTimes(1);
      controller.abort();
      await expect(run).resolves.toEqual({
        outcome: 'cancelled',
        read: [],
        skipped: ['/votes.json'],
      });
      expect(cancel).toHaveBeenCalledWith(1);
      expect(pending.size).toBe(0);
      expect(saved).toHaveBeenCalledTimes(1);
    } finally {
      Object.assign(globalThis, {
        requestIdleCallback: undefined,
        cancelIdleCallback: undefined,
      });
    }
  });

  test('without idle callbacks it reads nothing', async () => {
    const saved = jest.fn(async () => null);
    await expect(
      preloadProfileCatalogs(
        { saved },
        {
          signal: new AbortController().signal,
          first: idleSlot,
          active: () => true,
        },
      ),
    ).resolves.toEqual({ outcome: 'unavailable', read: [], skipped: [] });
    expect(saved).not.toHaveBeenCalled();
  });

  test('reads nothing while the app is not active', async () => {
    const saved = jest.fn(async () => null);
    await expect(
      preloadProfileCatalogs(
        { saved },
        {
          signal: new AbortController().signal,
          first: now,
          active: () => false,
        },
      ),
    ).resolves.toMatchObject({ outcome: 'cancelled', read: [] });
    expect(saved).not.toHaveBeenCalled();
  });
});

const initialAppState = AppState.currentState;
describe("Today's preload hook", () => {
  const pending = new Map<number, () => void>();
  let id = 0;
  let state: AppStateStatus = 'active';
  let appListener: ((next: AppStateStatus) => void) | undefined;
  beforeEach(() => {
    jest.useFakeTimers();
    pending.clear();
    id = 0;
    state = 'active';
    Object.assign(globalThis, {
      requestIdleCallback: jest.fn((callback: () => void) => {
        pending.set(++id, callback);
        return id;
      }),
      cancelIdleCallback: jest.fn((handle: number) => pending.delete(handle)),
    });
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      get: () => state,
    });
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appListener = listener as (next: AppStateStatus) => void;
        return { remove: () => (appListener = undefined) } as never;
      });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      writable: true,
      value: initialAppState,
    });
    Object.assign(globalThis, {
      requestIdleCallback: undefined,
      cancelIdleCallback: undefined,
    });
  });
  /** Focus is the screen being mounted; blur is leaving it. */
  const useMountFocus = (effect: () => void | (() => void)) =>
    useEffect(effect, [effect]);
  function Harness({
    api,
    drawn,
  }: {
    api: { saved: jest.Mock };
    drawn: boolean;
  }) {
    useProfilePreload(api, drawn, useMountFocus);
    return null;
  }
  const idle = async () => {
    const [handle, callback] = [...pending][0]!;
    pending.delete(handle);
    await act(async () => callback());
  };

  test('starts only once Today is drawn, after a frame and the settle time', async () => {
    const api = { saved: jest.fn(async () => null) };
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Harness api={api} drawn={false} />);
    });
    await act(async () => jest.advanceTimersByTime(PRELOAD_SETTLE_MS * 2));
    expect(pending.size).toBe(0);
    await act(async () => r.update(<Harness api={api} drawn />));
    await act(async () => jest.advanceTimersByTime(PRELOAD_SETTLE_MS - 1));
    expect(pending.size).toBe(0);
    await act(async () => jest.advanceTimersByTime(100));
    expect(pending.size).toBe(1);
    expect(api.saved).not.toHaveBeenCalled();
    await idle();
    expect(api.saved).toHaveBeenCalledWith('/votes.json', decodeVotes);
    await act(async () => r.unmount());
  });

  test('leaving Today cancels the queued reads', async () => {
    const api = { saved: jest.fn(async () => null) };
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Harness api={api} drawn />);
    });
    await act(async () => jest.advanceTimersByTime(PRELOAD_SETTLE_MS + 100));
    await idle();
    expect(api.saved).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(1);
    // A tap opens a profile: Today loses focus before the next idle slot.
    await act(async () => r.unmount());
    expect(globalThis.cancelIdleCallback).toHaveBeenCalledWith(2);
    expect(pending.size).toBe(0);
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(api.saved).toHaveBeenCalledTimes(1);
  });

  test('leaving Today before the settle time reads nothing', async () => {
    const api = { saved: jest.fn(async () => null) };
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<Harness api={api} drawn />);
    });
    await act(async () => jest.advanceTimersByTime(200));
    await act(async () => r.unmount());
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(pending.size).toBe(0);
    expect(api.saved).not.toHaveBeenCalled();
  });

  test('stops when the app leaves the foreground and resumes on return', async () => {
    const api = { saved: jest.fn(async () => null) };
    const stop = startProfilePreload(api, { first: now });
    await act(async () => undefined);
    expect(api.saved).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(1);
    state = 'background';
    await act(async () => appListener!('background'));
    expect(pending.size).toBe(0);
    expect(api.saved).toHaveBeenCalledTimes(1);
    state = 'active';
    await act(async () => appListener!('active'));
    // A new run: each catalog again, the read ones already in memory.
    expect(api.saved).toHaveBeenCalledTimes(2);
    while (pending.size) await idle();
    expect(api.saved).toHaveBeenCalledTimes(5);
    stop();
  });

  test('does not start in the background, and runs once per launch', async () => {
    const api = { saved: jest.fn(async () => null) };
    state = 'background';
    const stop = startProfilePreload(api, { first: now });
    await act(async () => undefined);
    expect(api.saved).not.toHaveBeenCalled();
    stop();
    state = 'active';
    const again = startProfilePreload(api, { first: now });
    await act(async () => undefined);
    while (pending.size) await idle();
    expect(api.saved).toHaveBeenCalledTimes(4);
    again();
    const third = startProfilePreload(api, { first: now });
    await act(async () => undefined);
    expect(api.saved).toHaveBeenCalledTimes(4);
    third();
  });
});
