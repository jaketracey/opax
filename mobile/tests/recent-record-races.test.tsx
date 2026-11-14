/** @jest-environment ./tests/sydney-environment.cjs */
import { act } from 'react';
import { RefreshControl } from 'react-native';
import TestRenderer from 'react-test-renderer';
import type { RecordResult } from '../src/api/client';
import { InsetGroup, RecordRow, SourceLine } from '../src/design/primitives';
import RecentRecords from '../src/features/records/RecentRecords';
import type { RecentFeed } from '../src/features/records/model';
import { records } from '../src/features/records/runtime';
import { withNavigationOptions } from './navigation-options';

jest.mock('../src/features/records/runtime', () => ({
  records: { recent: jest.fn() },
}));
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('expo-router', () => ({
  useSegments: () => [],
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

const record = (title: string): RecordResult<RecentFeed> => ({
  data: [{ slug: 'speech-100', title, indexed: '2026-11-10' }],
  stale: false,
  savedAt: 1,
  asOf: null,
});

test('closing Just added aborts a pending pull to refresh', async () => {
  let signal: AbortSignal | undefined;
  let finish!: (value: RecordResult<RecentFeed>) => void;
  jest
    .mocked(records.recent)
    .mockResolvedValueOnce(record('Initial fixture'))
    .mockImplementationOnce((_options, requestSignal) => {
      signal = requestSignal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      withNavigationOptions(<RecentRecords />, () => {}),
    );
  });
  await act(async () => view.root.findByType(RefreshControl).props.onRefresh());
  expect(signal).toBeInstanceOf(AbortSignal);
  act(() => view.unmount());
  expect(signal!.aborted).toBe(true);
  await act(async () => finish(record('Late fixture')));
});

test.each(['success', 'failure'])(
  'a late refresh %s cannot replace a newer record list or clear its spinner',
  async (outcome) => {
    let resolveOld!: (value: RecordResult<RecentFeed>) => void;
    let rejectOld!: (reason: Error) => void;
    let resolveNew!: (value: RecordResult<RecentFeed>) => void;
    jest
      .mocked(records.recent)
      .mockResolvedValueOnce(record('Initial fixture'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveOld = resolve;
            rejectOld = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve;
          }),
      );
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        withNavigationOptions(<RecentRecords />, () => {}),
      );
    });
    const refresh = () => view.root.findByType(RefreshControl);
    await act(async () => {
      refresh().props.onRefresh();
      refresh().props.onRefresh();
    });
    if (outcome === 'success')
      await act(async () => resolveOld(record('Older fixture')));
    else await act(async () => rejectOld(new Error('offline')));
    expect(refresh().props.refreshing).toBe(true);
    await act(async () => resolveNew(record('Newest fixture')));
    expect(view.root.findByType(RecordRow).props.title).toBe('Newest fixture');
    expect(refresh().props.refreshing).toBe(false);
    expect(view.root.findByType(SourceLine).props.state).toBeNull();
  },
);

test('an older successful refresh cannot overwrite the newest completed refresh', async () => {
  const pending: ((value: RecordResult<RecentFeed>) => void)[] = [];
  jest
    .mocked(records.recent)
    .mockResolvedValueOnce(record('Initial fixture'))
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      withNavigationOptions(<RecentRecords />, () => {}),
    );
  });
  const refresh = () => view.root.findByType(RefreshControl).props.onRefresh();
  await act(async () => {
    refresh();
    refresh();
  });
  await act(async () => pending[1]!(record('Newest fixture')));
  await act(async () => pending[0]!(record('Older fixture')));
  expect(view.root.findByType(RecordRow).props.title).toBe('Newest fixture');
});

test('a refresh answered from the saved copy says the list is saved', async () => {
  jest
    .mocked(records.recent)
    .mockResolvedValueOnce(record('Initial fixture'))
    .mockResolvedValueOnce({
      ...record('Saved fixture'),
      stale: true,
      savedAt: 5,
    });
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      withNavigationOptions(<RecentRecords />, () => {}),
    );
  });
  await act(async () => view.root.findByType(RefreshControl).props.onRefresh());
  const line = view.root.findByType(SourceLine).props;
  expect(line.state).toBe('saved');
  expect(line.savedAt).toBe(5);
  expect(line.asOf).toBeNull();
});

test('records are grouped by the reader’s own day added', async () => {
  jest.mocked(records.recent).mockResolvedValueOnce({
    ...record('Morning fixture'),
    data: [
      {
        slug: 'speech-200',
        title: 'Morning fixture',
        indexed: '2026-11-10T20:00:00.000Z',
      },
    ],
  });
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      withNavigationOptions(<RecentRecords />, () => {}),
    );
  });
  expect(view.root.findByType(InsetGroup).props.header).toBe(
    'Added 11 November 2026',
  );
});
