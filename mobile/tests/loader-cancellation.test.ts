import { ApiClient, LAST_WAITER_GRACE_MS } from '../src/api/client';
import { CatalogCache, type CacheStore } from '../src/api/cache';
import { Catalogs } from '../src/api/catalogs';
import { Records } from '../src/features/records/data';
import { ReportsRepository } from '../src/features/reports/repository';
import { MoneyCatalogs } from '../src/features/money-public/catalog';

function setup() {
  const store: CacheStore = {
    readIndex: jest.fn(async () => []),
    writeIndex: jest.fn(async () => {}),
    read: jest.fn(async () => undefined),
    write: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  };
  const signals: AbortSignal[] = [];
  const transport = jest.fn(
    (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        signals.push(init!.signal!);
        init!.signal!.addEventListener(
          'abort',
          () =>
            reject(
              Object.assign(new Error('Cancelled'), { name: 'AbortError' }),
            ),
          { once: true },
        );
      }),
  );
  const client = new ApiClient({
    origin: 'https://example.test',
    version: '1.0.0',
    build: '1',
    cache: new CatalogCache(store),
    transport,
    retries: 0,
  });
  const catalogs = new Catalogs(client),
    records = new Records(client),
    reports = new ReportsRepository(client),
    money = new MoneyCatalogs(client);
  const loaders = {
    bills: (signal: AbortSignal) => catalogs.bills(false, signal),
    grants: (signal: AbortSignal) => money.grants('federal', false, signal),
    document: (signal: AbortSignal) => records.document('speech-123', signal),
    topics: (signal: AbortSignal) => reports.topics(false, signal),
  };
  return { signals, store, loaders };
}
const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
// A read whose last reader has left is kept for a short grace, in case a
// reader comes back (a screen replaced by another), and cancelled when it
// ends. The grace runs on Jest's clock, moved only by the test.
beforeEach(() => {
  jest.useFakeTimers({
    doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
  });
});
afterEach(() => {
  jest.useRealTimers();
});
const graceEnds = () => jest.advanceTimersByTime(LAST_WAITER_GRACE_MS);
/**
 * Report topics are read through their own session, which runs each read
 * alone: its transport is cancelled the moment its last reader leaves.
 * The others are the client's shared plain reads, which have the grace.
 */
const graced = (name: string) => name !== 'topics';

test.each(['bills', 'grants', 'document', 'topics'] as const)(
  '%s forwards cancellation: the read is cancelled when the grace ends, and a new read then starts afresh',
  async (name) => {
    const { loaders, signals, store } = setup();
    const old = new AbortController();
    const pending = loaders[name](old.signal);
    const failure = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await tick();
    expect(signals).toHaveLength(1);
    old.abort();
    // The caller has stopped waiting; the transport goes with the grace.
    expect(signals[0]!.aborted).toBe(!graced(name));
    graceEnds();
    expect(signals[0]!.aborted).toBe(true);
    const next = new AbortController();
    const replacement = loaders[name](next.signal);
    const nextFailure = expect(replacement).rejects.toMatchObject({
      name: 'AbortError',
    });
    await tick();
    expect(signals).toHaveLength(2);
    expect(signals[1]!.aborted).toBe(false);
    next.abort();
    await Promise.all([failure, nextFailure]);
    graceEnds();
    expect(signals[1]!.aborted).toBe(true);
    expect(store.write).not.toHaveBeenCalled();
  },
);

// A document's read passes a decoder made for each call, so a new read is
// never the same read to the client: it does not rejoin, grace or no grace.
test.each(['bills', 'grants'] as const)(
  '%s: a new read inside the grace rejoins the request and starts no other',
  async (name) => {
    const { loaders, signals } = setup();
    const old = new AbortController();
    const failure = expect(loaders[name](old.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    await tick();
    old.abort();
    await failure;
    const next = new AbortController();
    const nextFailure = expect(
      loaders[name](next.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    graceEnds();
    // One request, still wanted.
    expect(signals).toHaveLength(1);
    expect(signals[0]!.aborted).toBe(false);
    next.abort();
    await nextFailure;
    graceEnds();
    expect(signals[0]!.aborted).toBe(true);
  },
);

test.each(['document', 'topics'] as const)(
  '%s shares a read until its last screen closes',
  async (name) => {
    const { loaders, signals } = setup();
    const first = new AbortController(),
      second = new AbortController();
    const a = loaders[name](first.signal),
      b = loaders[name](second.signal);
    const rejectedA = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    const rejectedB = expect(b).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    expect(signals).toHaveLength(1);
    first.abort();
    expect(signals[0]!.aborted).toBe(false);
    second.abort();
    expect(signals[0]!.aborted).toBe(!graced(name));
    graceEnds();
    expect(signals[0]!.aborted).toBe(true);
    await Promise.all([rejectedA, rejectedB]);
  },
);
