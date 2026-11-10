import { act } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { useRead } from '../src/api/useRead';
import { useCatalogRecord } from '../src/features/bills/useCatalogRecord';

type Record = { stale: boolean; value: string };
type Load = (
  refresh: boolean,
  publish: (record: Record) => void,
) => Promise<Record>;
const day = 24 * 60 * 60 * 1000;

function catalogProbe(load: Load) {
  let current!: ReturnType<typeof useCatalogRecord<Record>>;
  function Probe({ read }: { read: Load }) {
    current = useCatalogRecord(read);
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Probe read={load} />);
  });
  return {
    get current() {
      return current;
    },
    replace(read: Load) {
      act(() => tree.update(<Probe read={read} />));
    },
    unmount() {
      act(() => tree.unmount());
    },
  };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a changed catalogue loader clears the previous subject before the new read settles', async () => {
  const probe = catalogProbe(async () => ({
    stale: false,
    value: 'First fixture',
  }));
  await act(async () => {});
  expect(probe.current.record?.value).toBe('First fixture');
  let fail!: (error: Error) => void;
  probe.replace(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  expect(probe.current.record).toBeNull();
  await act(async () => fail(new Error('Second fixture unavailable')));
  expect(probe.current.record).toBeNull();
  expect(probe.current.error).toEqual(new Error('Second fixture unavailable'));
});

test('returning after a day revalidates a previously fresh catalogue without refreshing on every focus', async () => {
  jest.useFakeTimers();
  let listener!: (state: AppStateStatus) => void;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, next) => {
      listener = next;
      return { remove: jest.fn() };
    });
  const load = jest.fn(async () => ({ stale: false, value: 'Daily fixture' }));
  const probe = catalogProbe(load);
  await act(async () => {});
  expect(listener).toBeDefined();
  act(() => jest.setSystemTime(Date.now() + day - 1));
  await act(async () => listener('active'));
  expect(load).toHaveBeenCalledTimes(1);
  act(() => jest.setSystemTime(Date.now() + 1));
  await act(async () => listener('active'));
  expect(load).toHaveBeenCalledTimes(2);
  expect(load).toHaveBeenLastCalledWith(true, expect.any(Function));
  probe.unmount();
});

test('a catalogue left open revalidates daily and cancels its timer on unmount', async () => {
  jest.useFakeTimers();
  const previousState = AppState.currentState;
  AppState.currentState = 'active';
  try {
    const load = jest.fn(async () => ({
      stale: false,
      value: 'Daily fixture',
    }));
    const probe = catalogProbe(load);
    await act(async () => {});
    await act(async () => jest.advanceTimersByTimeAsync(day));
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith(true, expect.any(Function));
    probe.unmount();
    await act(async () => jest.advanceTimersByTimeAsync(day));
    expect(load).toHaveBeenCalledTimes(2);
  } finally {
    AppState.currentState = previousState;
  }
});

test('a synchronous catalogue loader failure becomes recoverable hook state', async () => {
  const failure = new Error('Unreadable fixture');
  const load = jest
    .fn<Promise<Record>, Parameters<Load>>()
    .mockImplementationOnce(() => {
      throw failure;
    })
    .mockResolvedValue({ stale: false, value: 'Recovered fixture' });
  const probe = catalogProbe(load);
  await act(async () => {});
  expect(probe.current.error).toBe(failure);
  await act(async () => probe.current.retry());
  expect(probe.current.error).toBeNull();
  expect(probe.current.record?.value).toBe('Recovered fixture');
});

test('a synchronous explicit reader failure becomes recoverable hook state', async () => {
  const failure = new Error('Unreadable fixture');
  const load = jest
    .fn()
    .mockImplementationOnce(() => {
      throw failure;
    })
    .mockResolvedValue({
      data: 'Recovered fixture',
      stale: false,
      savedAt: 1,
      asOf: null,
    });
  let current!: ReturnType<typeof useRead<string>>;
  function Probe() {
    current = useRead<string>(load);
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  await act(async () => {});
  expect(current.error).toBe(failure);
  await act(async () => current.retry());
  expect(current.error).toBeNull();
  expect(current.record?.data).toBe('Recovered fixture');
});
