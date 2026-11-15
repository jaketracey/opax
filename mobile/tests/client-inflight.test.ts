// Plain reads of one address that overlap share one request (N-inflight).
import {
  CatalogCache,
  type CacheEntry,
  type CacheIndexEntry,
  type CacheStore,
} from '../src/api/cache';
import { ApiClient } from '../src/api/client';
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
const ok = () =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'cache-control': 'public, max-age=300' },
  });
/** A client whose transport answers only when the test lets it. */
function held() {
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
        calls.push({
          url: String(url),
          signal: init!.signal as AbortSignal,
          headers: init!.headers as Record<string, string>,
          answer,
          fail,
        });
      }),
  );
  const client = new ApiClient({
    origin: 'https://fixture.test',
    version: '1.0.0',
    build: '1',
    cache: new CatalogCache(new MemoryStore()),
    transport: transport as typeof fetch,
    retries: 0,
  });
  return { client, transport, calls };
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
const same = (value: unknown) => value as typeof body;

test('two plain reads at once are one request, and each caller decodes for itself', async () => {
  const { client, transport, calls } = held();
  const first = client.get(path, same);
  const second = client.get(path, (value) => ({
    count: (value as typeof body).rows.length,
  }));
  await reached(calls, 1);
  await quiet();
  expect(transport).toHaveBeenCalledTimes(1);
  calls[0]!.answer(ok());
  const [a, b] = await Promise.all([first, second]);
  expect(a.data).toEqual(body);
  expect(b.data).toEqual({ count: 3 });
  expect(a.stale).toBe(false);
  expect(b.stale).toBe(false);
  expect(b.savedAt).toBe(a.savedAt);
  // Settled: the next read is a fresh saved copy, still no second request.
  expect((await client.get(path, same)).data).toEqual(body);
  expect(transport).toHaveBeenCalledTimes(1);
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
  calls[0]!.answer(ok());
  expect((await second).data).toEqual(body);
  expect(transport).toHaveBeenCalledTimes(1);
});

test('the first caller leaving does not cancel a request others joined', async () => {
  const { client, transport, calls } = held();
  const leaving = new AbortController();
  const second = (async () => {
    await reached(calls, 1);
    return client.get(path, same);
  })();
  const first = client.get(path, same, false, { signal: leaving.signal });
  await reached(calls, 1);
  await quiet();
  leaving.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  calls[0]!.answer(ok());
  expect((await second).data).toEqual(body);
  expect(transport).toHaveBeenCalledTimes(1);
  // An already-aborted caller never joins or starts anything.
  const gone = new AbortController();
  gone.abort();
  await expect(
    client.get('/expenses.json', same, false, { signal: gone.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(transport).toHaveBeenCalledTimes(1);
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
  calls[0]!.answer(ok());
  calls[1]!.answer(ok());
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
  calls[0]!.answer(ok());
  calls[1]!.answer(ok());
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
  calls[1]!.answer(ok());
  expect((await again).data).toEqual(body);
});

test('a caller whose decoder cannot read the shared body reads for itself', async () => {
  const { client, transport, calls } = held();
  const fine = client.get(path, same);
  const strict = client.get(path, () => {
    throw new Error('Not the shape this caller reads');
  });
  await reached(calls, 1);
  await quiet();
  expect(transport).toHaveBeenCalledTimes(1);
  calls[0]!.answer(ok());
  expect((await fine).data).toEqual(body);
  // It asks for itself, and gets what it got before reads were shared: its
  // own invalid-data.
  await reached(calls, 2);
  expect(transport).toHaveBeenCalledTimes(2);
  calls[1]!.answer(ok());
  await expect(strict).rejects.toMatchObject({ code: 'invalid-data' });
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
  calls.forEach((call) => call.answer(ok()));
  await Promise.all([pay, expenses]);
});
