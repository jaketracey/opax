// Plain reads of one address that overlap share one request (N-inflight).
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { ApiClient, LAST_WAITER_GRACE_MS } from '../src/api/client';
import { ApiError } from '../src/api/errors';

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

const path = '/pay.json';
const body = { rows: [1, 2, 3] };
const reply = (value: unknown = body) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'cache-control': 'public, max-age=300' },
  });
/** A client whose transport answers only when the test lets it. */
function held(extra: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) {
  const calls: {
    url: string;
    signal: AbortSignal;
    headers: Record<string, string>;
    answer: (response: Response) => void;
    fail: (error: unknown) => void;
  }[] = [];
  const transport = jest.fn(
    (url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((answer, fail) => {
        const signal = init!.signal as AbortSignal;
        // As fetch does: an aborted request rejects.
        signal.addEventListener('abort', () =>
          fail(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
        );
        calls.push({
          url: String(url),
          signal,
          headers: init!.headers as Record<string, string>,
          answer,
          fail,
        });
      }),
  );
  const store = new MemoryStore();
  const client = new ApiClient({
    origin: 'https://fixture.test',
    version: '1.0.0',
    build: '1',
    cache: new CatalogCache(store),
    transport: transport as typeof fetch,
    retries: 0,
    ...extra,
  });
  return { client, transport, calls, store };
}
/** Lets the reads reach the transport (the cache lookup is asynchronous). */
const reached = async (calls: unknown[], count: number) => {
  for (let turn = 0; turn < 200 && calls.length < count; turn++)
    await new Promise((resolve) => setImmediate(resolve));
};
const quiet = async () => {
  for (let turn = 0; turn < 20; turn++)
    await new Promise((resolve) => setImmediate(resolve));
};
/**
 * The grace after a last waiter leaves runs on Jest's clock, moved only by
 * the test. The event loop's own turns (`reached`, `quiet`) stay real.
 */
const heldClock = () =>
  jest.useFakeTimers({
    doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
  });
afterEach(() => {
  jest.useRealTimers();
});
const same = (value: unknown) => value as typeof body;
const strict = (value: unknown) => {
  const rows = (value as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) throw new Error('Not the rows this reader needs');
  return value as typeof body;
};
const lenient = (_value: unknown) => 'ok';

test('two plain reads at once, with one decoder, are one request', async () => {
  const { client, transport, calls } = held();
  const first = client.get(path, same);
  const second = client.get(path, same);
  await reached(calls, 1);
  await quiet();
  expect(transport).toHaveBeenCalledTimes(1);
  calls[0]!.answer(reply());
  const [a, b] = await Promise.all([first, second]);
  expect(a.data).toEqual(body);
  expect(b.data).toEqual(body);
  expect(a.stale).toBe(false);
  expect(b.savedAt).toBe(a.savedAt);
  // Settled: the next read is the fresh saved copy, still no second request.
  expect((await client.get(path, same)).data).toEqual(body);
  expect(transport).toHaveBeenCalledTimes(1);
});

test('readers with different decoders do not share: each has its own verdict on the body', async () => {
  const { client, transport, calls } = held();
  const first = client.get(path, same);
  const second = client.get(path, (value) => ({
    count: (value as typeof body).rows.length,
  }));
  await reached(calls, 2);
  expect(transport).toHaveBeenCalledTimes(2);
  calls.forEach((call) => call.answer(reply()));
  expect((await first).data).toEqual(body);
  expect((await second).data).toEqual({ count: 3 });
});

test('a caller that aborts stops waiting; the request carries on for the other', async () => {
  const { client, transport, calls } = held();
  const leaving = new AbortController();
  const first = client.get(path, same, false, { signal: leaving.signal });
  const second = client.get(path, same);
  await reached(calls, 1);
  await quiet();
  leaving.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  // The shared request belongs to neither caller.
  expect(calls[0]!.signal.aborted).toBe(false);
  expect(transport).toHaveBeenCalledTimes(1);
  calls[0]!.answer(reply());
  expect((await second).data).toEqual(body);
  expect(transport).toHaveBeenCalledTimes(1);
});

test('an already-aborted caller never joins or starts anything', async () => {
  const { client, transport } = held();
  const gone = new AbortController();
  gone.abort();
  await expect(
    client.get(path, same, false, { signal: gone.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await quiet();
  expect(transport).not.toHaveBeenCalled();
});

test('two waiters that abort in one pass: nobody rejoins, so the request is cancelled when the grace ends, and nothing is saved', async () => {
  heldClock();
  const { client, calls, store } = held();
  const one = new AbortController();
  const two = new AbortController();
  const first = client.get(path, same, false, { signal: one.signal });
  const second = client.get(path, same, false, { signal: two.signal });
  await reached(calls, 1);
  await quiet();
  // Both panes unmount in one commit: both cleanups run before any microtask.
  one.abort();
  two.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  // Kept for the grace, to the millisecond, in case a reader comes back.
  jest.advanceTimersByTime(LAST_WAITER_GRACE_MS - 1);
  expect(calls[0]!.signal.aborted).toBe(false);
  jest.advanceTimersByTime(1);
  expect(calls[0]!.signal.aborted).toBe(true);
  await quiet();
  // Cancelled, not left running: nothing saved, and no timer left behind.
  expect(store.entries.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('when the waiters leave one after another, the last one starts the grace; after it the request is cancelled and the next read starts again', async () => {
  heldClock();
  const { client, transport, calls, store } = held();
  const one = new AbortController();
  const two = new AbortController();
  const first = client.get(path, same, false, { signal: one.signal });
  const second = client.get(path, same, false, { signal: two.signal });
  await reached(calls, 1);
  await quiet();
  one.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  // Another waiter remains: no grace is running at all.
  expect(jest.getTimerCount()).toBe(1); // the request's own deadline
  jest.advanceTimersByTime(LAST_WAITER_GRACE_MS);
  expect(calls[0]!.signal.aborted).toBe(false);
  two.abort();
  await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  expect(calls[0]!.signal.aborted).toBe(false);
  jest.advanceTimersByTime(LAST_WAITER_GRACE_MS);
  expect(calls[0]!.signal.aborted).toBe(true);
  await quiet();
  expect(store.entries.size).toBe(0);
  const again = client.get(path, same);
  await reached(calls, 2);
  expect(transport).toHaveBeenCalledTimes(2);
  calls[1]!.answer(reply());
  expect((await again).data).toEqual(body);
});

test('a reader arriving within the grace after the last abort rejoins the one request (a screen replaced by another)', async () => {
  heldClock();
  const { client, transport, calls } = held();
  const one = new AbortController();
  const first = client.get(path, same, false, { signal: one.signal });
  await reached(calls, 1);
  await quiet();
  // The pane's detail unmounts, and the route's mounts a little later.
  one.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  jest.advanceTimersByTime(LAST_WAITER_GRACE_MS - 1);
  const two = new AbortController();
  const rejoined = client.get(path, same, false, { signal: two.signal });
  await quiet();
  // The grace it interrupted never fires: the request is the reader's now.
  jest.advanceTimersByTime(LAST_WAITER_GRACE_MS * 4);
  expect(calls[0]!.signal.aborted).toBe(false);
  expect(transport).toHaveBeenCalledTimes(1);
  calls[0]!.answer(reply());
  expect((await rejoined).data).toEqual(body);
  expect(transport).toHaveBeenCalledTimes(1);
  // And when that reader leaves in turn, a fresh grace starts for it.
  const three = new AbortController();
  const held2 = client.get('/expenses.json', same, false, {
    signal: three.signal,
  });
  await reached(calls, 2);
  three.abort();
  await expect(held2).rejects.toMatchObject({ name: 'AbortError' });
  jest.advanceTimersByTime(LAST_WAITER_GRACE_MS);
  expect(calls[1]!.signal.aborted).toBe(true);
});

test('an answer that lands in the grace with nobody back is not saved, and leaves no timer behind', async () => {
  heldClock();
  const { client, transport, calls, store } = held();
  const one = new AbortController();
  const first = client.get(path, same, false, { signal: one.signal });
  await reached(calls, 1);
  await quiet();
  one.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  // The transport answers while the request is on its way out.
  calls[0]!.answer(reply());
  await quiet();
  // An abandoned read's answer, as a lone read's abort always was: not
  // saved, and the grace's timer went with the request.
  expect(store.entries.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  // The next reader asks again.
  const next = client.get(path, same);
  await reached(calls, 2);
  expect(transport).toHaveBeenCalledTimes(2);
  calls[1]!.answer(reply());
  expect((await next).data).toEqual(body);
});

test('an answer that lands after a reader rejoined in the grace is that reader’s, and is saved', async () => {
  heldClock();
  const { client, transport, calls, store } = held();
  const one = new AbortController();
  const first = client.get(path, same, false, { signal: one.signal });
  await reached(calls, 1);
  await quiet();
  one.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const rejoined = client.get(path, same);
  await quiet();
  calls[0]!.answer(reply());
  expect((await rejoined).data).toEqual(body);
  expect(store.entries.size).toBe(1);
  expect(transport).toHaveBeenCalledTimes(1);
});

test('the half-way rule still holds over the grace: a request too old to join is cancelled at once, and is never rejoined', async () => {
  heldClock();
  let time = 1_000_000;
  const { client, transport, calls } = held({
    now: () => time,
    timeoutMs: 8000,
  });
  // Past half way when its last waiter leaves: nobody could join it, so
  // there is no grace to wait out.
  const one = new AbortController();
  const first = client.get(path, same, false, { signal: one.signal });
  await reached(calls, 1);
  await quiet();
  time += 4001;
  one.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  expect(calls[0]!.signal.aborted).toBe(true);
  // Exactly half way when it leaves: the grace runs, and a reader in it
  // still joins.
  const two = new AbortController();
  const second = client.get(path, same, false, { signal: two.signal });
  await reached(calls, 2);
  await quiet();
  time += 4000;
  two.abort();
  await expect(second).rejects.toMatchObject({ name: 'AbortError' });
  expect(calls[1]!.signal.aborted).toBe(false);
  const joiner = new AbortController();
  const joined = client.get(path, same, false, { signal: joiner.signal });
  await quiet();
  expect(transport).toHaveBeenCalledTimes(2);
  // That reader leaves too, and the clock passes half way inside the
  // grace: the next reader does not rejoin the old request. It starts its
  // own, and the old one is cancelled when its grace ends.
  joiner.abort();
  await expect(joined).rejects.toMatchObject({ name: 'AbortError' });
  time += 1;
  const late = client.get(path, same);
  await reached(calls, 3);
  expect(transport).toHaveBeenCalledTimes(3);
  expect(calls[1]!.signal.aborted).toBe(false);
  jest.advanceTimersByTime(LAST_WAITER_GRACE_MS);
  expect(calls[1]!.signal.aborted).toBe(true);
  expect(calls[2]!.signal.aborted).toBe(false);
  calls[2]!.answer(reply());
  expect((await late).data).toEqual(body);
});

test('a forced read does not join a plain one; a second plain read does', async () => {
  const { client, transport, calls } = held();
  const plain = client.get(path, same);
  await reached(calls, 1);
  const forced = client.get(path, same, true);
  await reached(calls, 2);
  const joined = client.get(path, same);
  await quiet();
  // Plain, forced: two requests. The second plain read joined the first.
  expect(transport).toHaveBeenCalledTimes(2);
  expect(calls[1]!.headers['Cache-Control']).toBe('no-cache');
  expect(calls[0]!.headers['Cache-Control']).toBeUndefined();
  calls[0]!.answer(reply());
  calls[1]!.answer(reply());
  for (const record of await Promise.all([plain, forced, joined]))
    expect(record.data).toEqual(body);
  expect(transport).toHaveBeenCalledTimes(2);
});

test.each([
  ['an unsaved read', { persist: false }],
  ['a background read', { background: true }],
  ['a read with its own timeout', { timeoutMs: 5000 }],
  ['a read with its own retries', { retries: 0 }],
])('%s runs alone', async (_name, options) => {
  const { client, transport, calls } = held();
  const plain = client.get(path, same);
  await reached(calls, 1);
  const other = client.get(path, same, false, options);
  await reached(calls, 2);
  expect(transport).toHaveBeenCalledTimes(2);
  calls[0]!.answer(reply());
  calls[1]!.answer(reply());
  await Promise.all([plain, other]);
});

test('an error reaches every waiter, and the next read asks again', async () => {
  const { client, transport, calls } = held();
  const first = client.get(path, same);
  const second = client.get(path, same);
  await reached(calls, 1);
  await quiet();
  expect(transport).toHaveBeenCalledTimes(1);
  calls[0]!.fail(new TypeError('Network request failed'));
  const outcomes = await Promise.allSettled([first, second]);
  for (const outcome of outcomes) {
    expect(outcome.status).toBe('rejected');
    expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
    expect((outcome as PromiseRejectedResult).reason.code).toBe('offline');
  }
  expect(transport).toHaveBeenCalledTimes(1);
  // The failed request is forgotten: this one goes to the network.
  const again = client.get(path, same);
  await reached(calls, 2);
  expect(transport).toHaveBeenCalledTimes(2);
  calls[1]!.answer(reply());
  expect((await again).data).toEqual(body);
});

test('a strict reader that rejects the body does not take a lenient one down with it', async () => {
  const { client, calls } = held();
  const first = Promise.allSettled([client.get(path, strict)]);
  await reached(calls, 1);
  const second = Promise.allSettled([client.get(path, lenient)]);
  await reached(calls, 2);
  await quiet();
  for (const call of calls) call.answer(reply({ nope: true }));
  const [[a], [b]] = await Promise.all([first, second]);
  expect(a!.status).toBe('rejected');
  expect((a as PromiseRejectedResult).reason.code).toBe('invalid-data');
  expect(b!.status).toBe('fulfilled');
});

test('a lenient reader saving a body does not cost a strict reader its good stale copy', async () => {
  let time = 1_000_000;
  const { client, calls } = held({ now: () => time });
  // A good copy is saved, then goes stale.
  const seed = client.get(path, strict);
  await reached(calls, 1);
  calls[0]!.answer(reply());
  await seed;
  time += 10 * 60 * 1000;
  const first = client.get(path, lenient);
  await reached(calls, 2);
  const second = client.get(path, strict);
  await reached(calls, 3);
  await quiet();
  for (const call of calls.slice(1)) call.answer(reply({ nope: true }));
  const [a, b] = await Promise.allSettled([first, second]);
  expect(a.status).toBe('fulfilled');
  // Strict serves its known-good copy as stale, as it did before sharing.
  expect(b.status).toBe('fulfilled');
  const record = (
    b as PromiseFulfilledResult<{ stale: boolean; data: unknown }>
  ).value;
  expect(record.stale).toBe(true);
  expect(record.data).toEqual(body);
});

test('a flight more than half way to its deadline takes no new waiters', async () => {
  let time = 1_000_000;
  const { client, transport, calls } = held({
    now: () => time,
    timeoutMs: 8000,
  });
  const first = client.get(path, same);
  await reached(calls, 1);
  // Half way exactly: still joined.
  time += 4000;
  const early = client.get(path, same);
  await quiet();
  expect(transport).toHaveBeenCalledTimes(1);
  // Past half way: a reader with a second of the old deadline left would
  // time out with it. It starts its own, with its own full time.
  time += 3000;
  const late = client.get(path, same);
  await reached(calls, 2);
  expect(transport).toHaveBeenCalledTimes(2);
  // Whoever comes next joins the fresh one, not the old one.
  const next = client.get(path, same);
  await quiet();
  expect(transport).toHaveBeenCalledTimes(2);
  calls[1]!.answer(reply());
  expect((await late).data).toEqual(body);
  expect((await next).data).toEqual(body);
  // The old request is still its own waiters' and still answers them.
  calls[0]!.answer(reply());
  expect((await first).data).toEqual(body);
  expect((await early).data).toEqual(body);
});

test('abort listeners are removed when the shared read settles', async () => {
  const { client, calls } = held();
  const controller = new AbortController();
  const added: unknown[] = [];
  const removed: unknown[] = [];
  const signal = controller.signal;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = ((type: string, fn: never, o: never) => {
    added.push(fn);
    add(type, fn, o);
  }) as typeof signal.addEventListener;
  signal.removeEventListener = ((type: string, fn: never) => {
    removed.push(fn);
    remove(type, fn);
  }) as typeof signal.removeEventListener;
  const a = client.get(path, same, false, { signal });
  const b = client.get(path, same);
  await reached(calls, 1);
  calls[0]!.answer(reply());
  await Promise.all([a, b]);
  expect(added.length).toBeGreaterThan(0);
  for (const fn of added) expect(removed).toContain(fn);
});

test('different addresses never share', async () => {
  const { client, transport, calls } = held();
  const pay = client.get('/pay.json', same);
  const expenses = client.get('/expenses.json', same);
  await reached(calls, 2);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(calls.map((call) => new URL(call.url).pathname).sort()).toEqual([
    '/expenses.json',
    '/pay.json',
  ]);
  calls.forEach((call) => call.answer(reply()));
  await Promise.all([pay, expenses]);
});
