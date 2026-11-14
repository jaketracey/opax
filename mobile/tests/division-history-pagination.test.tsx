import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { AccessibilityInfo, Platform, SectionList } from 'react-native';
import { router } from 'expo-router';
import { Button, LinkRow, Text } from '../src/design/primitives';
import { RouteOptions } from '../src/navigation/preview';
import { useCatalogRecord } from '../src/features/bills/useCatalogRecord';
import DivisionHistory, {
  type HistorySection,
} from '../src/features/directories/DivisionHistory';
import type { DivisionRecord } from '../src/features/directories/division-data';
import type { DivisionRow } from '../src/features/directories/model';
import { filterStore } from '../src/features/sheets/filter-model';

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

const vote = (n: number, extra: Partial<DivisionRow> = {}): DivisionRow => ({
  key: `au-federal-r1:d${n}`,
  billKey: 'au-federal-r1',
  title: 'First bill',
  stage: 'Second reading',
  date: `2026-11-${String(30 - n).padStart(2, '0')}`,
  house: 'house',
  question: 'That the bill be read a second time.',
  ayes: 70,
  noes: 40,
  outcome: 'agreed',
  ...extra,
});
const rows = Array.from({ length: 40 }, (_, n) =>
  vote(n, {
    date: new Date(Date.UTC(2026, 10, 30 - n)).toISOString().slice(0, 10),
    ...(n >= 20
      ? {
          billKey: 'au-federal-r2',
          title: 'Older wildlife bill',
          house: 'senate',
        }
      : {}),
  }),
);
const record = (extra: Partial<DivisionRecord> = {}): DivisionRecord => ({
  rows,
  loaded: 2,
  total: 2,
  failed: 0,
  asAt: '2026-11-11',
  stale: false,
  savedAt: 1,
  partial: false,
  ...extra,
});
const state = (value: DivisionRecord | null, refreshing = false) => ({
  record: value,
  error: null,
  refreshing,
  refresh: jest.fn(),
  retry: jest.fn(),
});
async function render(value: DivisionRecord | null) {
  jest.mocked(useCatalogRecord).mockReturnValue(state(value));
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<DivisionHistory />);
  });
  return r;
}
const list = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findByType(SectionList);
const sections = (r: TestRenderer.ReactTestRenderer): HistorySection[] =>
  list(r).props.sections;
const visible = (r: TestRenderer.ReactTestRenderer) =>
  sections(r).flatMap((section) => section.data);
const countText = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .find((node) => node.props.testID === 'division-history-count')?.props
    .children;
async function update(
  r: TestRenderer.ReactTestRenderer,
  value: DivisionRecord,
  refreshing = false,
) {
  jest.mocked(useCatalogRecord).mockReturnValue(state(value, refreshing));
  await act(async () => r.update(<DivisionHistory />));
}

test('the first page and total wait for final order, even when earlier batches contain older votes', async () => {
  const r = await render(null);
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  announce.mockClear();
  for (const batch of [rows.slice(20, 25), rows.slice(20)]) {
    await update(r, record({ rows: batch, loaded: 1 }));
    expect(visible(r)).toEqual([]);
    expect(countText(r)).toBeUndefined();
    expect(announce).not.toHaveBeenCalled();
  }
  await update(r, record());
  expect(visible(r)).toEqual(rows.slice(0, 16));
  expect(countText(r)).toBe('40 votes');
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith('40 votes available');
  announce.mockRestore();
});

test('scrolling appends only at the end, keeping section keys, header counts and VoiceOver order stable', async () => {
  const r = await render(record());
  const first = visible(r);
  const sectionKey = sections(r)[0]!.key;
  const header = () => r.root.findAllByType(LinkRow)[0]!.props;
  expect(header().detail).toBe('20 votes');
  const spokenHeader = header().accessibilityLabel;
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  announce.mockClear();
  await act(async () => {
    const append = list(r).props.onEndReached;
    append();
    append();
  });
  expect(visible(r)).toEqual(rows.slice(0, 32));
  expect(visible(r).slice(0, first.length)).toEqual(first);
  expect(sections(r)[0]!.key).toBe(sectionKey);
  expect(header().accessibilityLabel).toBe(spokenHeader);
  expect(countText(r)).toBe('40 votes');
  expect(announce).not.toHaveBeenCalled();
  await act(async () => list(r).props.onEndReached());
  expect(visible(r)).toEqual(rows);
  await act(async () => list(r).props.onEndReached());
  expect(visible(r)).toEqual(rows);
  announce.mockRestore();
});

test('refresh retains the displayed rows and total until updated votes are explicitly requested', async () => {
  const initial = record();
  const r = await render(initial);
  await act(async () => list(r).props.onEndReached());
  const first = visible(r);
  const originalSections = sections(r);
  const refreshed = record({ rows: [vote(-1), ...rows] });
  await update(r, record({ rows: [], loaded: 0 }), true);
  expect(visible(r)).toEqual(first);
  expect(countText(r)).toBe('40 votes');
  await update(
    r,
    record({ rows: refreshed.rows.slice(0, 10), loaded: 1 }),
    true,
  );
  expect(sections(r)).toBe(originalSections);
  expect(countText(r)).toBe('40 votes');
  await update(r, refreshed);
  expect(sections(r)).toBe(originalSections);
  expect(countText(r)).toBe('40 votes');
  const updates = r.root
    .findAllByType(Button)
    .find((node) => node.props.testID === 'division-history-updates')!;
  expect(updates).toBeDefined();
  await act(async () => updates.props.onPress());
  expect(visible(r)).toEqual(refreshed.rows.slice(0, 16));
  expect(countText(r)).toBe('41 votes');
});

test('an unchanged refresh keeps the page and needs no update action', async () => {
  const r = await render(record());
  await act(async () => list(r).props.onEndReached());
  await update(r, record({ rows: rows.map((row) => ({ ...row })) }));
  expect(visible(r)).toEqual(rows.slice(0, 32));
  expect(
    r.root.findAllByProps({ testID: 'division-history-updates' }),
  ).toHaveLength(0);
});

test.each(['ios', 'android'] as const)(
  '%s no-result typing announces once per episode',
  async (platform) => {
    jest.useFakeTimers();
    const originalOS = Platform.OS;
    Platform.OS = platform;
    const reader = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled');
    const readerImplementation = reader.getMockImplementation()!;
    reader.mockResolvedValue(true);
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    try {
      const r = await render(record());
      announce.mockClear();
      const options = () => r.root.findByType(RouteOptions).props.options;
      const type = async (text: string) => {
        await act(async () =>
          options().headerSearchBarOptions.onChangeText({
            nativeEvent: { text },
          }),
        );
        await act(async () => jest.advanceTimersByTime(150));
      };
      for (const query of ['z', 'zz', 'zzz', 'zzzz']) await type(query);
      expect(announce.mock.calls).toEqual([['No results']]);
      const empty = r.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === 'division-history-empty',
      );
      expect(empty.props.accessibilityLiveRegion).toBe('none');
      await type('');
      announce.mockClear();
      await type('zzzzz');
      expect(announce.mock.calls).toEqual([['No results']]);
      await act(async () => r.unmount());
    } finally {
      reader.mockImplementation(readerImplementation);
      announce.mockRestore();
      Platform.OS = originalOS;
      jest.useRealTimers();
    }
  },
);

test('search and filters match votes beyond the displayed page and reset pagination', async () => {
  jest.useFakeTimers();
  try {
    const r = await render(record());
    const options = () => r.root.findByType(RouteOptions).props.options;
    await act(async () =>
      options().headerSearchBarOptions.onChangeText({
        nativeEvent: { text: 'wildlife' },
      }),
    );
    await act(async () => jest.advanceTimersByTime(150));
    expect(visible(r)).toEqual(rows.slice(20, 36));
    expect(countText(r)).toBe('20 votes');
    await act(async () => list(r).props.onEndReached());
    expect(visible(r)).toEqual(rows.slice(20));
    await act(async () =>
      options().headerSearchBarOptions.onCancelButtonPress(),
    );
    await act(async () => jest.advanceTimersByTime(150));
    expect(visible(r)).toEqual(rows.slice(0, 16));
    const filters = (
      options().unstable_headerRightItems() as {
        identifier?: string;
        onPress: () => void;
      }[]
    ).find((item) => item.identifier === 'division-history-filters');
    // The owner is the list's public filter route, shared with its sheet.
    await act(async () => filters!.onPress());
    const route = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: { owner: string };
    };
    const owner = route.params.owner;
    const store = filterStore('divisions', owner)!;
    expect(
      store.model.resultLine?.({ ...store.get(), chamber: 'senate' }),
    ).toContain('20');
    await act(async () => store.set({ ...store.get(), chamber: 'senate' }));
    expect(visible(r)).toEqual(rows.slice(20, 36));
    expect(countText(r)).toBe('20 of 40 votes');
    await act(async () => r.unmount());
  } finally {
    jest.useRealTimers();
  }
});

test.each(['android', 'ios'] as const)(
  '%s keeps Filters reachable while a search is open',
  async (platform) => {
    jest.useFakeTimers();
    const originalOS = Platform.OS;
    Platform.OS = platform;
    try {
      const r = await render(record());
      const options = () => r.root.findByType(RouteOptions).props.options;
      const inList = () =>
        r.root
          .findAllByType(Button)
          .filter(
            (node) => node.props.testID === 'division-history-search-filters',
          );
      const barFilters = () =>
        (
          options().unstable_headerRightItems() as {
            identifier?: string;
            onPress: () => void;
          }[]
        ).find((item) => item.identifier === 'division-history-filters');
      expect(inList()).toHaveLength(0);
      if (platform === 'ios') {
        // Nothing changes on iOS here: the bar item and the native search
        // options are as they were, and no pinned Filters is drawn.
        expect(options().headerSearchBarOptions).not.toHaveProperty('onOpen');
        expect(options().headerSearchBarOptions).not.toHaveProperty('onClose');
        await act(async () =>
          options().headerSearchBarOptions.onChangeText({
            nativeEvent: { text: 'wildlife' },
          }),
        );
        await act(async () => jest.advanceTimersByTime(150));
        expect(inList()).toHaveLength(0);
        expect(barFilters()).toBeDefined();
        await act(async () => r.unmount());
        return;
      }
      // Android hides the bar's items from the search's open to its close.
      await act(async () => options().headerSearchBarOptions.onOpen());
      expect(inList()).toHaveLength(1);
      // Pinned under the search field, outside the list that scrolls.
      expect(
        list(r)
          .findAllByType(Button)
          .filter(
            (node) => node.props.testID === 'division-history-search-filters',
          ),
      ).toHaveLength(0);
      await act(async () =>
        options().headerSearchBarOptions.onChangeText({
          nativeEvent: { text: 'wildlife' },
        }),
      );
      await act(async () => jest.advanceTimersByTime(150));
      expect(countText(r)).toBe('20 votes');
      const button = inList()[0]!;
      expect(button.props).toMatchObject({
        label: 'Filters',
        accessibilityLabel: 'Filters',
      });
      // The same filter route, and so the same owner, as the bar's Filters.
      await act(async () => button.props.onPress());
      const fromList = jest.mocked(router.push).mock.calls.at(-1)![0];
      await act(async () => barFilters()!.onPress());
      expect(jest.mocked(router.push).mock.calls.at(-1)![0]).toEqual(fromList);
      const owner = (fromList as { params: { owner: string } }).params.owner;
      const store = filterStore('divisions', owner)!;
      await act(async () => store.set({ ...store.get(), chamber: 'senate' }));
      // Search and filter combine.
      expect(visible(r)).toEqual(rows.slice(20, 36));
      expect(inList()[0]!.props.accessibilityLabel).toBe('Filters, 1 on');
      await act(async () =>
        options().headerSearchBarOptions.onChangeText({
          nativeEvent: { text: '' },
        }),
      );
      await act(async () => options().headerSearchBarOptions.onClose());
      expect(inList()).toHaveLength(0);
      await act(async () => r.unmount());
    } finally {
      Platform.OS = originalOS;
      jest.useRealTimers();
    }
  },
);
