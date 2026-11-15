import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import { RouteOptions } from '../src/navigation/preview';
import { DivisionRow, LinkRow } from '../src/design/primitives';
import { rhythm } from '../src/design/tokens';
import { ApiError } from '../src/api/errors';
import { useCatalogRecord } from '../src/features/bills/useCatalogRecord';
import DivisionHistory, {
  estimatedVoteInset,
} from '../src/features/directories/DivisionHistory';
import type { DivisionRecord } from '../src/features/directories/division-data';
import type { DivisionRow as Division } from '../src/features/directories/model';

// Votes in parliament while it loads holds the loaded page's shape
// (ad-jank-records, 15 Nov 2026): the count line was inserted above the list
// when the votes arrived, the placeholder was six two-bar rows where a bill
// header and its inset votes land, and the votes were drawn at the margin
// for a frame before their measured inset moved them in.
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/bills/useCatalogRecord', () => ({
  useCatalogRecord: jest.fn(),
}));
jest.mock('../src/design/primitives', () => ({
  ...jest.requireActual('../src/design/primitives'),
  DivisionRow: () => null,
  LinkRow: () => null,
}));
jest.mock('../src/design/row-link', () => ({
  ...jest.requireActual('../src/design/row-link'),
  useRowFollow: () => ({}),
}));

const rows: Division[] = Array.from({ length: 6 }, (_, n) => ({
  key: `au-federal-r1:d${n}`,
  billKey: 'au-federal-r1',
  title: 'First bill',
  stage: 'Second reading',
  date: `2026-11-${String(20 - n).padStart(2, '0')}`,
  house: 'house',
  question: 'That the bill be read a second time.',
  ayes: 70,
  noes: 40,
  outcome: 'agreed',
}));
const record: DivisionRecord = {
  rows,
  loaded: 1,
  total: 1,
  failed: 0,
  asAt: '2026-11-11',
  stale: false,
  savedAt: 1,
  partial: false,
};
const state = (value: DivisionRecord | null, error: unknown = null) => ({
  record: value,
  error: error as Error | null,
  refreshing: false,
  refresh: jest.fn(),
  retry: jest.fn(),
});
async function render(value: DivisionRecord | null, error: unknown = null) {
  jest.mocked(useCatalogRecord).mockReturnValue(state(value, error));
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<DivisionHistory />);
  });
  return r;
}
const host = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const hosts = (r: TestRenderer.ReactTestRenderer, prefix: string) =>
  r.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.testID === 'string' &&
      node.props.testID.startsWith(prefix),
  );
const flat = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style);
const hostParent = (node: ReactTestInstance) => {
  let at = node.parent!;
  while (typeof at.type !== 'string') at = at.parent!;
  return at;
};
/** The nearest host elements under a node, through any components. */
const hostChildren = (node: ReactTestInstance): ReactTestInstance[] =>
  node.children.flatMap((child) =>
    typeof child === 'string'
      ? []
      : typeof child.type === 'string'
        ? [child]
        : hostChildren(child),
  );
const inset = estimatedVoteInset(Dimensions.get('window').fontScale);

test('the count line holds its place while the votes load, in the count line own text style', async () => {
  const r = await render(null);
  expect(host(r, 'division-history-count')).toHaveLength(0);
  const pending = host(r, 'division-history-count-pending');
  expect(pending).toHaveLength(1);
  expect(pending[0]!.props.accessibilityElementsHidden).toBe(true);
  const stand = pending[0]!.findAllByType(NativeText);
  expect(stand).toHaveLength(1);
  const held = flat(stand[0]!);
  expect(held.opacity).toBe(0);
  jest.mocked(useCatalogRecord).mockReturnValue(state(record));
  await act(async () => r.update(<DivisionHistory />));
  expect(host(r, 'division-history-count-pending')).toHaveLength(0);
  const count = host(r, 'division-history-count');
  expect(count).toHaveLength(1);
  // The same row style, and the same line of type: nothing below moves.
  expect(flat(hostParent(count[0]!))).toEqual(flat(pending[0]!));
  expect(flat(count[0]!).lineHeight).toBe(held.lineHeight);
  expect(flat(count[0]!).fontSize).toBe(held.fontSize);
  await act(async () => r.unmount());
});

test('the placeholder is bill headers with their votes inset under them, as the loaded list is', async () => {
  const r = await render(null);
  const loading = host(r, 'division-history-loading');
  expect(loading).toHaveLength(1);
  expect(loading[0]!.props.accessibilityLabel).toBe('Loading votes');
  expect(loading[0]!.props.accessibilityRole).toBe('progressbar');
  const billBones = hosts(r, 'division-history-loading-bill-');
  const voteBones = hosts(r, 'division-history-loading-vote-');
  expect(billBones.length).toBeGreaterThanOrEqual(2);
  expect(voteBones.length).toBeGreaterThanOrEqual(4);
  // A header keeps the loaded header's margins and row padding.
  expect(flat(billBones[0]!)).toMatchObject({
    marginTop: rhythm.section,
    marginBottom: rhythm.tight,
    paddingVertical: rhythm.row,
    minHeight: 44,
  });
  // A vote holds five lines (stage, where and when, outcome, bar, counts)
  // and sits in by the header's symbol column.
  for (const vote of voteBones) {
    expect(flat(vote)).toMatchObject({
      paddingLeft: inset,
      paddingVertical: rhythm.row,
      minHeight: 44,
    });
    const lines = hostChildren(hostChildren(vote)[0]!);
    expect(lines).toHaveLength(5);
    expect(flat(lines[3]!).height).toBe(8);
  }
  await act(async () => r.unmount());
});

test('the votes are inset from their first frame, by the header symbol column', async () => {
  expect(inset).toBeGreaterThan(rhythm.tight);
  const r = await render(record);
  const votes = r.root.findAllByType(DivisionRow);
  expect(votes.length).toBe(6);
  for (const vote of votes) {
    expect(flat(hostParent(vote)).paddingLeft).toBe(inset);
  }
  expect(r.root.findAllByType(LinkRow)).toHaveLength(1);
  await act(async () => r.unmount());
});

test('a failed load holds no count line and draws no placeholder', async () => {
  const r = await render(null, new ApiError('http', 'no'));
  expect(host(r, 'division-history-count-pending')).toHaveLength(0);
  expect(host(r, 'division-history-loading')).toHaveLength(0);
  expect(host(r, 'division-history-error')).toHaveLength(1);
  await act(async () => r.unmount());
});

test('with nothing saved and no connection, the page offers Try again, which reads again', async () => {
  const offline = new ApiError('offline', 'Not saved on this iPhone yet.');
  const value = state(null, offline);
  jest.mocked(useCatalogRecord).mockReturnValue(value);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<DivisionHistory />);
  });
  expect(host(r, 'division-history-offline-uncached')).toHaveLength(1);
  const again = r.root.findAll(
    (node) =>
      node.props.testID === 'division-history-offline-retry' &&
      typeof node.props.onPress === 'function',
  );
  expect(again.length).toBeGreaterThan(0);
  await act(async () => again[0]!.props.onPress());
  expect(value.retry).toHaveBeenCalledTimes(1);
  await act(async () => r.unmount());
});

test.each([
  ['android', 'left'],
  ['ios', 'center'],
] as const)(
  'on %s the bar title is aligned %s: Android keeps the toolbar own title, with its margins',
  async (os, align) => {
    const original = Platform.OS;
    Platform.OS = os;
    try {
      const r = await render(record);
      expect(r.root.findByType(RouteOptions).props.options).toMatchObject({
        title: 'Votes in parliament',
        headerTitleAlign: align,
      });
      await act(async () => r.unmount());
    } finally {
      Platform.OS = original;
    }
  },
);
