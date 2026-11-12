import type { BillDetail } from '../src/api/catalog-decoders';
import type { RecordResult } from '../src/api/client';
import { decodeBill } from '../src/api/catalogs';
import {
  readDivisionHistory,
  type DivisionRecord,
} from '../src/features/directories/division-data';
import { bills, pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({ catalogs: {} }));

const detail = decodeBill(pinned('/bills/au-federal-r7534.json'));
const candidates = bills.bills
  .filter((bill) => bill.divisions > 0)
  .slice(0, 9)
  .map((bill, n) => ({ ...bill, status_as_of: `2026-10-${30 - n}` }));
const result = <T>(data: T): RecordResult<T> => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const reads = candidates.map(() => deferred<RecordResult<BillDetail>>());
  const files = candidates.map((bill, n) =>
    result({
      ...detail,
      key: bill.key,
      divisions: [
        {
          ...detail.divisions[0]!,
          date: n === 8 ? '2026-11-10' : '2026-01-01',
        },
      ],
    }),
  );
  const source = {
    bills: jest.fn(async () => result({ ...bills, bills: candidates })),
    bill: jest.fn(
      (key: string) =>
        reads[candidates.findIndex((bill) => bill.key === key)]!.promise,
    ),
  };
  const publish = jest.fn<void, [DivisionRecord]>();
  return { reads, files, source, publish };
}
const tick = async () => {
  for (let n = 0; n < 10; n++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('publishes once in final vote order, including newer votes from the last file batch', async () => {
  const { reads, files, source, publish } = setup();
  const pending = readDivisionHistory(source, false, publish);
  await tick();
  expect(source.bill).toHaveBeenCalledTimes(8);
  expect(publish).not.toHaveBeenCalled();
  // Reverse completion order within the batch must not affect the result.
  for (let n = 7; n >= 0; n--) reads[n]!.resolve(files[n]!);
  await tick();
  await jest.advanceTimersByTimeAsync(0);
  expect(source.bill).toHaveBeenCalledTimes(9);
  expect(publish).not.toHaveBeenCalled();
  reads[8]!.resolve(files[8]!);
  await tick();
  await jest.runAllTimersAsync();
  const final = await pending;
  expect(final.rows[0]!.billKey).toBe(candidates[8]!.key);
  expect(final.rows.slice(1).map((row) => row.key)).toEqual(
    final.rows
      .slice(1)
      .map((row) => row.key)
      .sort((a, b) => a.localeCompare(b)),
  );
  expect(publish.mock.calls.map(([record]) => record.rows.length)).toEqual([9]);
  expect(publish).toHaveBeenCalledWith(final);
  expect(final).toMatchObject({ loaded: 9, failed: 0, total: 9 });
});

test('partial failures and mismatched bill files settle before publishing a stable available count', async () => {
  const { reads, files, source, publish } = setup();
  const pending = readDivisionHistory(source, true, publish);
  await tick();
  reads[0]!.resolve(files[1]!);
  for (let n = 1; n < 8; n++) reads[n]!.resolve(files[n]!);
  await tick();
  await jest.advanceTimersByTimeAsync(0);
  expect(publish).not.toHaveBeenCalled();
  reads[8]!.reject(new Error('Unavailable'));
  await tick();
  await jest.runAllTimersAsync();
  const final = await pending;
  expect(publish).toHaveBeenCalledTimes(1);
  expect(final).toMatchObject({ loaded: 7, failed: 2, total: 9 });
  expect(final.rows).toHaveLength(7);
  expect(source.bills).toHaveBeenCalledWith(true, undefined);
  expect(source.bill).toHaveBeenCalledWith(candidates[0]!.key, true, undefined);
});

test('cancelling a read never publishes an incomplete snapshot', async () => {
  const { reads, files, source, publish } = setup();
  const controller = new AbortController();
  const pending = readDivisionHistory(
    source,
    false,
    publish,
    controller.signal,
  );
  const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await tick();
  controller.abort();
  for (let n = 0; n < 8; n++) reads[n]!.resolve(files[n]!);
  await failure;
  expect(publish).not.toHaveBeenCalled();
  expect(source.bill).toHaveBeenCalledTimes(8);
});
