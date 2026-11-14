import { Text as NativeText } from 'react-native';
import { SourceLine } from '../src/design/primitives';
import { CatalogState } from '../src/features/CatalogState';
// Design pass 5, lane A (docs/design/review-2026-10/pass5-app-critique.md).
// P2-10: division history titles each row by its stage, with its outcome as
// a status and the count beside it, under one line per run of a bill's
// divisions. P2-19: its source line follows the first page. P2-12: the
// people directory's ⓘ, saved-copy date and as-at line are one SourceLine.
// P2-21: on iPad the directory opens its first row. The catalog
// states say a saved copy once.
import { router } from 'expo-router';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import DirectoryScreen from '../src/features/directories/DirectoryScreen';
import {
  divisionLabel,
  historySections,
} from '../src/features/directories/DivisionHistory';
import {
  loadDirectory,
  type DirectoryRecord,
} from '../src/features/directories/data';
import type { DivisionRow } from '../src/features/directories/model';

const mockParams: { kind: string; open?: string } = { kind: 'person' };
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Link = ({ children }: { children: unknown }) =>
    React.createElement(React.Fragment, null, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    useLocalSearchParams: () => mockParams,
    router: { push: jest.fn(), setParams: jest.fn() },
    Stack: { Screen: () => null },
    Link,
  };
});
jest.mock('../src/features/directories/division-data', () => ({
  loadDivisionHistory: jest.fn(),
}));
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/directories/data', () => ({
  loadDirectory: jest.fn(),
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
jest.mock('../src/features/split/RecordDetail', () => ({
  RecordDetail: () => null,
  RecordShare: () => null,
}));
// A live adaptive-device flag, read at render after imports load.
const mockPad = { pad: false };
jest.mock('../src/design/primitives', () => {
  const actual = jest.requireActual('../src/design/primitives');
  const React = jest.requireActual('react');
  const pad = () => !!(globalThis as { __opaxTestPad?: boolean }).__opaxTestPad;
  const out = {
    ...actual,
    useAdaptiveDevice: pad,
    useLayout: () => ({ ...actual.useLayout(), regular: pad(), split: pad() }),
    SplitLayout: ({
      list,
      selected,
      initialSelection,
      onSelect,
    }: {
      list: React.ReactNode;
      selected: unknown;
      initialSelection?: () => unknown;
      onSelect: (entry: unknown) => void;
    }) => {
      const first = initialSelection?.();
      React.useEffect(() => {
        if (pad() && !selected && first) onSelect(first);
      }, [selected, first, onSelect]);
      return list;
    },
  };
  Object.defineProperty(out, 'isPad', { get: pad, enumerable: true });
  return out;
});
const setPad = (on: boolean) => {
  mockPad.pad = on;
  (globalThis as { __opaxTestPad?: boolean }).__opaxTestPad = on;
};
const mockWindow = { width: 1366, height: 1024, scale: 2, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const division = (
  billKey: string,
  n: number,
  extra: Partial<DivisionRow> = {},
): DivisionRow => ({
  key: `${billKey}:d${n}`,
  billKey,
  title: `Bill ${billKey}`,
  stage: 'Limitation of debate',
  date: '2026-08-19',
  house: 'senate',
  question: 'That the question be put.',
  ayes: 11,
  noes: 24,
  outcome: 'negative',
  ...extra,
});

test('consecutive divisions of one bill sit under one line for the bill', () => {
  const rows = [
    division('a', 1),
    division('a', 2),
    division('b', 1),
    division('a', 3),
  ];
  const sections = historySections(rows);
  expect(sections.map((s) => [s.billKey, s.data.length])).toEqual([
    ['a', 2],
    ['b', 1],
    ['a', 1],
  ]);
  // Keys stay unique when a bill comes back later in the list.
  expect(new Set(sections.map((s) => s.key)).size).toBe(sections.length);
});

test('a division is spoken by its stage, where, outcome and count, then its bill', () => {
  expect(divisionLabel(division('a', 1))).toBe(
    'Limitation of debate, Senate · 19 Aug 2026, Not agreed, 11 ayes, 24 noes, Bill a',
  );
  expect(divisionLabel(division('a', 1, { stage: null }))).toMatch(/^Vote, /);
});

const record: DirectoryRecord = {
  people: [],
  parties: [
    {
      key: 'Labor',
      name: 'Labor',
      speeches: 1,
      members: 1,
      money: {},
      total: 0,
    },
    {
      key: 'Greens',
      name: 'Greens',
      speeches: 1,
      members: 1,
      money: {},
      total: 0,
    },
  ],
  electorates: [],
  facets: [],
  stale: true,
  staleReason: 'unavailable',
  savedAt: Date.UTC(2026, 9, 3),
  partial: false,
  sources: [
    { label: 'OPAX parliamentary roster', asAt: '2026-09-04' },
    { label: 'Party speech totals', asAt: '2026-10-09' },
  ],
} as unknown as DirectoryRecord;

async function directory(kind: string) {
  mockParams.kind = kind;
  jest.mocked(loadDirectory).mockResolvedValue(record);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<DirectoryScreen />);
  });
  return renderer;
}

test('iPad opens the first row in landscape and portrait; a cleared selection stays cleared', async () => {
  setPad(true);
  delete mockParams.open;
  let renderer = await directory('party');
  // The first row as the list sorts it (by name), not the export's order.
  expect(router.setParams).toHaveBeenCalledWith({ open: 'party:Greens' });
  await act(async () => renderer.unmount());
  jest.mocked(router.setParams).mockClear();
  mockParams.open = '';
  renderer = await directory('party');
  expect(router.setParams).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
  // Portrait opens the first row too (people.md 2.3, P2-21).
  delete mockParams.open;
  mockWindow.width = 1024;
  mockWindow.height = 1366;
  renderer = await directory('party');
  expect(router.setParams).toHaveBeenCalledWith({ open: 'party:Greens' });
  await act(async () => renderer.unmount());
  mockWindow.width = 1366;
  mockWindow.height = 1024;
  setPad(false);
});

test('the directory: one source line with the notes, each source dated, a saved copy as its state', async () => {
  setPad(false);
  const renderer = await directory('party');
  const line = renderer.root.findByType(SourceLine);
  expect(line.props.testID).toBe('directory-source');
  expect(line.props.citation).toEqual([
    { label: 'OPAX parliamentary roster', asOf: '2026-09-04' },
    { label: 'Party speech totals', asOf: '2026-10-09' },
  ]);
  expect(line.props.savedAt).toBe(record.savedAt);
  expect(line.props.state).toBe('saved');
  expect(line.props.notes.join(' ')).toMatch(/Receipts are per commission/);
  expect(line.props.notes.join(' ')).toMatch(/could not be loaded/);
  await act(async () => renderer.unmount());
});

test('a catalog block dates its saved copy in its source line', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <CatalogState
        block={
          {
            status: 'ready',
            data: ['row'],
            stale: true,
            staleReason: 'unavailable',
            savedAt: Date.UTC(2026, 9, 3),
            partial: false,
            asAt: '2026-10-01',
            sources: [{ label: 'AEC disclosure returns' }],
          } as never
        }
        empty="Empty"
        onRetry={() => {}}
        testID="block"
      >
        {() => null}
      </CatalogState>,
    );
  });
  const line = renderer.root.findByType(SourceLine);
  expect(line.props).toMatchObject({
    testID: 'block-as-at',
    savedAt: Date.UTC(2026, 9, 3),
    citation: ['AEC disclosure returns'],
  });
  expect(words(renderer)).toContain('Saved 3 Oct 2026');
  act(() => renderer.unmount());
});

const words = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAllByType(NativeText)
    .map((n) => [n.props.children].flat(3).join(''))
    .join(' ');
