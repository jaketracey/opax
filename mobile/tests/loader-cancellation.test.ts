import { ApiClient } from '../src/api/client';
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

test.each(['bills', 'grants', 'document', 'topics'] as const)(
  '%s forwards cancellation and permits an immediate new read',
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
    expect(store.write).not.toHaveBeenCalled();
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
    expect(signals[0]!.aborted).toBe(true);
    await Promise.all([rejectedA, rejectedB]);
  },
);
