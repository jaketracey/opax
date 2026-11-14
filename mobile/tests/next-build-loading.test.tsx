import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Text as NativeText } from 'react-native';
import {
  ContentUnavailable,
  EmptyState,
  InlineError,
  LoadingState,
} from '../src/design/primitives';
import { RecordBlock } from '../src/features/your-mp/Evidence';
import { ProfileBlock } from '../src/features/people/Block';
import { Skeleton } from '../src/design/states';
import { MoneyList } from '../src/features/money-public/parts';
import DivisionHistory from '../src/features/directories/DivisionHistory';
import { useCatalogRecord } from '../src/features/bills/useCatalogRecord';
import { useFollowStates } from '../src/features/follows/useFollowStates';
import { catalogs } from '../src/api/runtime';
import type { EvidenceBlock } from '../src/features/your-mp/model';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { followSources: jest.fn(), partyPage: jest.fn() },
}));
jest.mock('../src/features/bills/useCatalogRecord', () => ({
  useCatalogRecord: jest.fn(),
}));
jest.mock('../src/features/follows/store', () => ({
  ...jest.requireActual('../src/features/follows/store'),
  useFollows: () => [
    { kind: 'bill', id: 'au-federal-r1', title: 'A bill', seen: null },
  ],
}));
const loading: EvidenceBlock<string[]> = {
  status: 'loading',
  data: null,
  asAt: null,
  sources: [],
  stale: false,
  savedAt: null,
};
const words = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(Infinity)
    .join(' ');
async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const unmount = async (r: TestRenderer.ReactTestRenderer) => {
  await act(async () => r.unmount());
};

test('evidence waits with a skeleton, then shows a completed empty response', async () => {
  const block = (value: typeof loading) => (
    <RecordBlock
      title="Speeches"
      id="evidence"
      block={value}
      missing="No speeches."
      retry={jest.fn()}
    >
      {() => null}
    </RecordBlock>
  );
  const r = await render(block(loading));
  expect(r.root.findAllByType(LoadingState)).toHaveLength(1);
  expect(r.root.findAllByType(EmptyState)).toHaveLength(0);
  await act(async () => r.update(block({ ...loading, status: 'missing' })));
  expect(r.root.findAllByType(LoadingState)).toHaveLength(0);
  expect(r.root.findByType(EmptyState).props.message).toBe('No speeches.');
  await unmount(r);
});

test('evidence retains a saved block while refreshing', async () => {
  const r = await render(
    <RecordBlock
      title="Speeches"
      id="saved"
      block={{ ...loading, data: ['A saved speech'] }}
      missing="No speeches."
      retry={jest.fn()}
    >
      {(rows) => <NativeText>{rows[0]}</NativeText>}
    </RecordBlock>,
  );
  expect(words(r)).toContain('A saved speech');
  expect(r.root.findAllByType(EmptyState)).toHaveLength(0);
  await unmount(r);
});

test('party blocks show a skeleton before the first response', async () => {
  const r = await render(
    <ProfileBlock
      title="Recent votes"
      block={loading}
      retry={jest.fn()}
      id="divisions"
    >
      {() => null}
    </ProfileBlock>,
  );
  expect(r.root.findAllByType(Skeleton)).toHaveLength(1);
  expect(r.root.findAllByType(EmptyState)).toHaveLength(0);
  await unmount(r);
});

test('a money list has no end marker or empty copy under its loading skeleton', async () => {
  const props = {
    rows: [] as string[],
    rowKey: (s: string) => s,
    render: () => null,
    refresh: jest.fn(),
    refreshing: false,
    id: 'money',
  };
  const r = await render(
    <MoneyList
      {...props}
      loaded={false}
      header={<LoadingState label="Loading grants" />}
    />,
  );
  expect(r.root.findAllByType(LoadingState)).toHaveLength(1);
  expect(r.root.findAllByType(EmptyState)).toHaveLength(0);
  expect(words(r)).not.toContain('End of record');
  await act(async () =>
    r.update(<MoneyList {...props} loaded header={null} />),
  );
  // The Apple-design lists end without a marker (specs/money.md 1.3).
  expect(words(r)).not.toContain('End of record');
  expect(r.root.findAllByType(EmptyState)).toHaveLength(1);
  await unmount(r);
});

test('division history shows a skeleton during both the index and progressive file reads', async () => {
  const state = {
    record: null,
    error: null,
    refreshing: false,
    refresh: jest.fn(),
    retry: jest.fn(),
  };
  jest.mocked(useCatalogRecord).mockReturnValue(state);
  const r = await render(<DivisionHistory />);
  expect(r.root.findAllByType(Skeleton)).toHaveLength(1);
  expect(r.root.findAllByType(EmptyState)).toHaveLength(0);
  jest.mocked(useCatalogRecord).mockReturnValue({
    ...state,
    record: { rows: [], total: 2, loaded: 0, failed: 0, stale: false },
  });
  await act(async () => r.update(<DivisionHistory />));
  expect(r.root.findAllByType(Skeleton)).toHaveLength(1);
  expect(r.root.findAllByType(EmptyState)).toHaveLength(0);
  jest.mocked(useCatalogRecord).mockReturnValue({
    ...state,
    record: { rows: [], total: 2, loaded: 0, failed: 2, stale: false },
    error: new Error('Unavailable'),
  });
  await act(async () => r.update(<DivisionHistory />));
  expect(r.root.findAllByType(ContentUnavailable)).toHaveLength(1);
  expect(r.root.findAllByType(EmptyState)).toHaveLength(0);
  await unmount(r);
});

test.each([null, new Error('Unavailable')])(
  'a completed total division failure shows one refreshable error with loader error %p',
  async (error) => {
    const refresh = jest.fn();
    const retry = jest.fn();
    jest.mocked(useCatalogRecord).mockReturnValue({
      record: { rows: [], total: 2, loaded: 0, failed: 2, stale: false },
      error,
      refreshing: false,
      refresh,
      retry,
    });
    const r = await render(<DivisionHistory />);
    const failure = r.root.findByType(ContentUnavailable);
    expect(failure.props.title).toBe('Votes couldn’t be loaded');
    expect(r.root.findAllByType(Skeleton)).toHaveLength(0);
    expect(r.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(words(r)).not.toContain('No division records match that search.');
    expect(
      r.root.findAllByProps({ testID: 'division-history-retry' }),
    ).toHaveLength(0);
    await act(async () => failure.props.action.onPress());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    await unmount(r);
  },
);

test('a partial division failure keeps the coverage line and refresh button', async () => {
  const refresh = jest.fn();
  jest.mocked(useCatalogRecord).mockReturnValue({
    record: { rows: [], total: 2, loaded: 1, failed: 1, stale: false },
    error: null,
    refreshing: false,
    refresh,
    retry: jest.fn(),
  });
  const r = await render(<DivisionHistory />);
  expect(words(r)).toContain('Votes from 1 of 2 bills. 1 couldn’t be loaded.');
  expect(r.root.findAllByType(Skeleton)).toHaveLength(0);
  expect(
    r.root.findAllByProps({ testID: 'division-history-error' }),
  ).toHaveLength(0);
  const partial = r.root
    .findAllByType(InlineError)
    .find((node) => node.props.testID === 'division-history-partial')!;
  await act(async () => partial.props.onRetry());
  expect(refresh).toHaveBeenCalledTimes(1);
  await unmount(r);
});

test('a total follow read failure is exposed and never presented as no changes', async () => {
  let fail!: (error: Error) => void;
  jest.mocked(catalogs.followSources).mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  let value!: ReturnType<typeof useFollowStates>;
  function Probe() {
    value = useFollowStates(0);
    return null;
  }
  const r = await render(<Probe />);
  expect(value.states.get('bill:au-federal-r1')?.status).toBe('unavailable');
  await act(async () => fail(new Error('Offline')));
  expect(value.sources?.error?.message).toContain('could not be loaded');
  expect(
    [...value.states.values()].every((s) => s.status === 'unavailable'),
  ).toBe(true);
  await unmount(r);
});
