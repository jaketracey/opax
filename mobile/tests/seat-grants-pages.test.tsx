import { act, useEffect } from 'react';
import TestRenderer from 'react-test-renderer';
import type { RecordResult } from '../src/api/client';
import { money } from '../src/features/money-public/runtime';
import {
  decodeSeatGrants,
  type SeatGrantPage,
} from '../src/features/money-public/seat-grants-data';
import { useSeatGrants } from '../src/features/money-public/useSeatGrants';
import firstFixture from './fixtures/money/seat-maribyrnong.json';
import secondFixture from './fixtures/money/seat-maribyrnong-2.json';

jest.mock('../src/features/money-public/runtime', () => ({ money: {} }));
const first = decodeSeatGrants(firstFixture),
  second = decodeSeatGrants(secondFixture);
const record = (data: SeatGrantPage): RecordResult<SeatGrantPage> => ({
  data,
  stale: false,
  savedAt: 10,
  asOf: null,
});
let current: ReturnType<typeof useSeatGrants>;
const report = (value: ReturnType<typeof useSeatGrants>) => {
  current = value;
};
function Probe({ seatKey }: { seatKey: string }) {
  const value = useSeatGrants(seatKey);
  // Published after each commit, so the probe stays a pure render.
  useEffect(() => report(value));
  return null;
}
async function mount() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<Probe seatKey="maribyrnong" />);
  });
  return tree;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('changing seat aborts the old request and rejects a late first page', async () => {
  const old = deferred<RecordResult<SeatGrantPage>>();
  money.seat = jest.fn(async (_jur, key) =>
    key === 'maribyrnong'
      ? old.promise
      : record({ ...first, key: 'fixture-seat', name: 'Fixture seat' }),
  );
  const tree = await mount();
  const signal = jest.mocked(money.seat).mock.calls[0]![3]!.signal!;
  await act(async () => tree.update(<Probe seatKey="fixture-seat" />));
  expect(signal.aborted).toBe(true);
  expect(current.record?.data.key).toBe('fixture-seat');
  await act(async () => old.resolve(record(first)));
  expect(current.record?.data.key).toBe('fixture-seat');
  expect(current.grants).toHaveLength(25);
});

test('unmount aborts an in-flight continuation and prevents more requests', async () => {
  const pending = deferred<RecordResult<SeatGrantPage>>();
  money.seat = jest.fn(async (_jur, _key, _refresh, options) =>
    options?.page ? pending.promise : record(first),
  );
  const tree = await mount();
  await act(async () => current.showAll());
  expect(current.loadingMore).toBe(true);
  const signal = jest.mocked(money.seat).mock.calls.at(-1)![3]!.signal!;
  await act(async () => tree.unmount());
  expect(signal.aborted).toBe(true);
  await act(async () =>
    pending.resolve(record({ ...second, next: 'maribyrnong-3.json' })),
  );
  expect(money.seat).toHaveBeenCalledTimes(3);
});

test('refresh supersedes a pending continuation and refreshes every expanded page', async () => {
  const pending = deferred<RecordResult<SeatGrantPage>>();
  money.seat = jest.fn(async (_jur, _key, refresh, options) =>
    options?.page
      ? refresh
        ? record(second)
        : pending.promise
      : record(first),
  );
  await mount();
  await act(async () => current.showAll());
  const signal = jest.mocked(money.seat).mock.calls.at(-1)![3]!.signal!;
  await act(async () => current.refresh());
  expect(signal.aborted).toBe(true);
  expect(current.grants).toHaveLength(28);
  expect(current.loadingMore).toBe(false);
  expect(
    jest
      .mocked(money.seat)
      .mock.calls.slice(-2)
      .map((args) => args[2]),
  ).toEqual([true, true]);
  await act(async () => pending.resolve(record({ ...second, grants: [] })));
  expect(current.grants).toHaveLength(28);
});

test.each(['duplicate', 'different total'] as const)(
  'a continuation with %s does not corrupt the existing rows',
  async (kind) => {
    money.seat = jest.fn(async (_jur, _key, _refresh, options) =>
      record(
        options?.page
          ? {
              ...second,
              ...(kind === 'duplicate'
                ? { grants: [first.grants[0]!] }
                : { total: second.total + 1 }),
            }
          : first,
      ),
    );
    await mount();
    await act(async () => current.showAll());
    expect(current.grants).toHaveLength(26);
    expect(current.record?.data.moreError).toMatchObject({
      code: 'invalid-data',
    });
    expect(current.loadingMore).toBe(false);
  },
);

test('refresh keeps an expanded list readable while the later pages are pending', async () => {
  const pending = deferred<RecordResult<SeatGrantPage>>();
  money.seat = jest.fn(async (_jur, _key, refresh, options) =>
    options?.page
      ? refresh
        ? pending.promise
        : record(second)
      : record(first),
  );
  await mount();
  await act(async () => current.showAll());
  expect(current.grants).toHaveLength(28);
  await act(async () => current.refresh());
  expect(current.refreshing).toBe(true);
  expect(current.grants).toHaveLength(28);
  await act(async () => pending.resolve(record(second)));
  expect(current.refreshing).toBe(false);
  expect(current.grants).toHaveLength(28);
});
