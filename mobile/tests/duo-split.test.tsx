import {
  act,
  useCallback,
  useEffect,
  useState,
  type ComponentType,
} from 'react';
import {
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Stack, Tabs, router, useLocalSearchParams } from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store } from 'expo-router/build/global-state/router-store';
import { inMemoryContext } from 'expo-router/build/testing-library/context-stubs';
import { ApiClient } from '../src/api/client';
import { CatalogCache } from '../src/api/cache';
import { catalogs } from '../src/api/runtime';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  useLayout,
  type WindowTraits,
} from '../src/design/adaptive';
import { emptyReservedRegions, type ReservedRegions } from '../src/design/fold';
import { ReservedRegionsProvider } from '../src/design/fold-area';
import {
  SplitLayout,
  useInSplitList,
  useSplitPane,
  type SplitPane,
} from '../src/design/split';
import BillsList from '../src/features/bills/BillsList';
import { useCatalogRecord } from '../src/features/bills/useCatalogRecord';
import DirectoryScreen from '../src/features/directories/DirectoryScreen';
import { loadDirectory } from '../src/features/directories/data';
import Search from '../src/features/Search';
import { RouteOptions } from '../src/navigation/preview';
import {
  billEntryFromRoute,
  decodeEntry,
  encodeEntry,
  entryFromRoute,
  entryRoute,
  useSplitSelectionParams,
  type RecordEntry,
} from '../src/features/split/entry';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, isPad: false } },
  });
});
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('../src/api/runtime', () => ({ catalogs: { bills: jest.fn() } }));
jest.mock('../src/features/directories/data', () => ({
  loadDirectory: jest.fn(),
}));
// The Search fork owns only the screen wrapper, not Search's result internals.
jest.mock('../src/features/search/SearchScreen', () => ({
  SearchScreen: function SearchScreen() {
    const React = jest.requireActual('react');
    const Native = jest.requireActual('react-native');
    React.useEffect(() => {
      mockSearchMounts++;
    }, []);
    return <Native.View testID="search-screen" />;
  },
}));

const regular: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: true,
};
const compact: WindowTraits = {
  horizontal: 'compact',
  vertical: 'regular',
  foldable: true,
};
// The unfolded Duo in landscape beside its vertical tab bar: two panes.
const SPLIT = 880;
const bill: RecordEntry = {
  kind: 'bill',
  key: 'au-federal-r7534',
  title: 'A loaded bill',
};
const text: RecordEntry = { ...bill, kind: 'text' };
let mockSearchMounts = 0;
let listMounts = 0;
let pane: SplitPane<RecordEntry> | null;
let setRegions: (regions: ReservedRegions) => void;
let serial = 0;
let client: ApiClient;
let transport: jest.Mock;
const mounted: TestRenderer.ReactTestRenderer[] = [];

function windowSize(
  width: number,
  traits = regular,
  fontScale = 1,
  height = 800,
) {
  act(() => {
    const size = { width, height, scale: 2, fontScale };
    Dimensions.set({ window: size, screen: size });
    setWindowTraitsOverride(traits);
  });
}
beforeEach(() => {
  serial++;
  listMounts = 0;
  mockSearchMounts = 0;
  pane = null;
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
  windowSize(SPLIT);
  jest
    .mocked(catalogs.bills)
    .mockReset()
    .mockImplementation(() => new Promise(() => {}));
  jest
    .mocked(loadDirectory)
    .mockReset()
    .mockImplementation(() => new Promise(() => {}));
  transport = jest.fn(
    async () =>
      new Response(JSON.stringify({ title: bill.title }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=86400',
        },
      }),
  );
  client = new ApiClient({
    origin: 'https://opax.com.au',
    version: '1',
    build: '1',
    transport,
    cache: new CatalogCache({
      readIndex: async () => [],
      writeIndex: async () => {},
      read: async () => undefined,
      write: async () => {},
      remove: async () => {},
    }),
  });
});
afterEach(async () => {
  await act(async () => mounted.splice(0).forEach((tree) => tree.unmount()));
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function renderApp(context = app, location = '/library') {
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ExpoRoot context={context} location={location} />,
    );
  });
  mounted.push(tree);
  await settle();
  return tree;
}
const host = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );
const hosts = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );
const route = () => store.getRouteInfo();
function readerStack() {
  const root = store.navigationRef.current!.getRootState().routes[0]!.state!;
  const tabs = root.routes.find((item) => item.name === '(tabs)')!.state!;
  return tabs.routes.find((item) => item.name === '(reader)')!.state!;
}
function List() {
  const split = useInSplitList();
  const layout = useLayout();
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    listMounts++;
  }, []);
  return (
    <ScrollView
      testID="reader-list"
      onScroll={(event) => setOffset(event.nativeEvent.contentOffset.y)}
    >
      <Text testID="list-state">{`${offset}:${split}:${layout.rule}`}</Text>
    </ScrollView>
  );
}
function Detail({ entry }: { entry: RecordEntry }) {
  const current = useSplitPane<RecordEntry>();
  useEffect(() => {
    if (current) pane = current;
  });
  // This is the same cache-backed loading boundary used by record screens.
  const load = useCallback(
    (refresh: boolean) =>
      client.get(`/bills/${entry.key}.json`, (value) => value, refresh),
    [entry.key],
  );
  const { record } = useCatalogRecord(load);
  return (
    <Text testID={`record-${entry.kind}`}>
      {record ? JSON.stringify(record.data) : 'Loading'}
    </Text>
  );
}
function DetailRoute() {
  const params = useLocalSearchParams<{ key?: string; slug?: string }>();
  return <Detail entry={{ kind: 'bill', key: (params.key ?? params.slug)! }} />;
}
function SplitRoot() {
  const params = useLocalSearchParams<{ open?: string }>();
  const update = useSplitSelectionParams();
  const select = useCallback(
    (entry: RecordEntry | null) =>
      update({ open: entry ? encodeEntry(entry) : '' }),
    [update],
  );
  const [regions, updateRegions] = useState(emptyReservedRegions);
  useEffect(() => {
    setRegions = updateRegions;
  }, []);
  return (
    <ReservedRegionsProvider value={regions}>
      <SplitLayout<RecordEntry>
        id={`reader-${serial}`}
        testID="reader-split"
        list={<List />}
        selected={
          params.open === encodeEntry(bill) ? bill : decodeEntry(params.open)
        }
        onSelect={select}
        entryKey={encodeEntry}
        entryRoute={entryRoute}
        entryFromRoute={entryFromRoute}
        renderDetail={(entry) => <Detail entry={entry} />}
        empty={null}
      />
    </ReservedRegionsProvider>
  );
}
const app = inMemoryContext({
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': () => <Tabs screenOptions={{ lazy: false }} />,
  '(tabs)/(reader)/_layout': {
    default: () => <Stack />,
    unstable_settings: { anchor: 'library' },
  },
  '(tabs)/(reader)/library': SplitRoot,
  '(tabs)/(reader)/bill/[key]': DetailRoute,
  '(tabs)/(reader)/bill-text/[key]': DetailRoute,
  '(tabs)/(reader)/doc/[slug]': DetailRoute,
  '(tabs)/(reader)/unrelated': () => <View testID="unrelated-screen" />,
  '(tabs)/(other)/index': () => <View testID="other-tab" />,
});

it('keeps the list mounted and its scroll state across a regular/compact/regular flip', async () => {
  const tree = await renderApp();
  act(() =>
    host(tree, 'reader-list').props.onScroll({
      nativeEvent: { contentOffset: { y: 418 } },
    }),
  );
  windowSize(390, compact);
  await settle();
  expect(hosts(tree, 'reader-split-detail')).toHaveLength(0);
  expect(host(tree, 'list-state').props.children).toBe('418:false:phone');
  windowSize(SPLIT);
  await settle();
  expect(host(tree, 'list-state').props.children).toBe(
    '418:true:phone-regular',
  );
  expect(listMounts).toBe(1);
});

it('collapses the open record to its route, then pops and selects it on expansion without refetching', async () => {
  const tree = await renderApp(app, `/library?open=${encodeEntry(bill)}`);
  const ownerKey = readerStack().routes[0]!.key;
  expect(transport).toHaveBeenCalledTimes(1);
  windowSize(390, compact);
  await settle();
  expect(route().pathname).toBe(`/bill/${bill.key}`);
  expect(route().params.name).toBe(bill.title);
  expect(readerStack().routes.map((item) => item.name)).toEqual([
    'library',
    'bill/[key]',
  ]);
  expect(readerStack().routes[0]!.key).toBe(ownerKey);
  windowSize(SPLIT);
  await settle();
  expect(route().pathname).toBe('/library');
  expect(route().params.open).toBe(encodeEntry(bill));
  expect(pane?.entries).toEqual([bill]);
  expect(hosts(tree, 'record-bill').length).toBeGreaterThan(0);
  expect(readerStack().routes).toHaveLength(1);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(listMounts).toBe(1);
});

it('hands off the whole mapped pane stack and restores Back below its open record', async () => {
  await renderApp(app, `/library?open=${encodeEntry(bill)}`);
  act(() => pane!.push(text));
  await settle();
  windowSize(390, compact);
  await settle();
  expect(route().pathname).toBe(`/bill-text/${bill.key}`);
  expect(readerStack().routes.map((item) => item.name)).toEqual([
    'library',
    'bill/[key]',
    'bill-text/[key]',
  ]);
  windowSize(SPLIT);
  await settle();
  expect(pane?.entries).toEqual([bill, text]);
  act(() => {
    pane!.back();
  });
  expect(pane?.entries).toEqual([bill]);
  expect(transport).toHaveBeenCalledTimes(1);
});

it('honours Back taken on compact and does not resurrect a dismissed pane entry', async () => {
  await renderApp(app, `/library?open=${encodeEntry(bill)}`);
  act(() => pane!.push(text));
  windowSize(390, compact);
  await settle();
  await act(async () => router.back());
  windowSize(SPLIT);
  await settle();
  expect(pane?.entries).toEqual([bill]);
});

it('discards deeper pane entries after Back all the way to the compact list', async () => {
  await renderApp(app, `/library?open=${encodeEntry(bill)}`);
  act(() => pane!.push(text));
  windowSize(390, compact);
  await settle();
  await act(async () => router.back());
  await act(async () => router.back());
  windowSize(SPLIT);
  await settle();
  expect(pane?.entries).toEqual([bill]);
});

it('restores the latest cited passage changed on a compact document route', async () => {
  await renderApp(app, `/library?open=${encodeEntry(bill)}`);
  act(() =>
    pane!.push({ kind: 'doc', key: 'hansard-1', passage: 'First passage' }),
  );
  windowSize(390, compact);
  await settle();
  await act(async () => router.setParams({ passage: 'Second passage' }));
  windowSize(SPLIT);
  await settle();
  expect(pane?.entries.at(-1)).toEqual({
    kind: 'doc',
    key: 'hansard-1',
    passage: 'Second passage',
  });
});

it('expands a record opened on compact into this split and updates the list route params', async () => {
  windowSize(390, compact);
  await renderApp();
  await act(async () =>
    router.push(entryRoute(bill) as Parameters<typeof router.push>[0]),
  );
  await settle();
  windowSize(SPLIT);
  await settle();
  expect(route().pathname).toBe('/library');
  expect(route().params.open).toBe(encodeEntry(bill));
  expect(pane?.entries).toEqual([bill]);
  expect(listMounts).toBe(1);
});

it('leaves unrelated routes on top and does not mutate an inactive tab during collapse', async () => {
  await renderApp(app, `/library?open=${encodeEntry(bill)}`);
  await act(async () => router.push('/unrelated'));
  windowSize(390, compact);
  windowSize(SPLIT);
  await settle();
  expect(route().pathname).toBe('/unrelated');
  await act(async () => router.back());
  await act(async () =>
    store.navigationRef.current?.dispatch({
      type: 'JUMP_TO',
      payload: { name: '(other)/index' },
    }),
  );
  windowSize(390, compact);
  await settle();
  expect(readerStack().routes).toHaveLength(1);
});

it('keeps ordinary full-screen route pushes unchanged while the window stays regular', async () => {
  await renderApp(app, `/library?open=${encodeEntry(bill)}`);
  await act(async () =>
    router.push(entryRoute(bill) as Parameters<typeof router.push>[0]),
  );
  await settle();
  expect(route().pathname).toBe(`/bill/${bill.key}`);
  expect(readerStack().routes).toHaveLength(2);
});

it('waits for the owning tab to focus before expanding its compact detail route', async () => {
  windowSize(390, compact);
  await renderApp();
  await act(async () =>
    router.push(entryRoute(bill) as Parameters<typeof router.push>[0]),
  );
  await act(async () =>
    store.navigationRef.current?.dispatch({
      type: 'JUMP_TO',
      payload: { name: '(other)/index' },
    }),
  );
  windowSize(SPLIT);
  await settle();
  expect(readerStack().routes).toHaveLength(2);
  await act(async () =>
    store.navigationRef.current?.dispatch({
      type: 'JUMP_TO',
      payload: { name: '(reader)' },
    }),
  );
  await settle();
  expect(route().pathname).toBe('/library');
  expect(route().params.open).toBe(encodeEntry(bill));
  expect(pane?.entries).toEqual([bill]);
});

const vertical = { x: 428, y: 0, width: 24, height: 800, active: true };
it('snaps to an active vertical fold, leaves its frame empty and pauses resizing without overwriting the saved width', async () => {
  const responder = jest.spyOn(PanResponder, 'create');
  const tree = await renderApp();
  const drag = responder.mock.calls.at(-1)![0];
  const width = () =>
    StyleSheet.flatten(host(tree, 'reader-split-list').props.style).width;
  act(() =>
    host(tree, 'split-divider').props.onAccessibilityAction({
      nativeEvent: { actionName: 'increment' },
    }),
  );
  expect(width()).toBe(410);
  act(() => drag.onPanResponderGrant?.({} as never, {} as never));
  act(() => setRegions({ divisions: [vertical], occlusions: [] }));
  expect(drag.onStartShouldSetPanResponder?.({} as never, {} as never)).toBe(
    false,
  );
  act(() => drag.onPanResponderMove?.({} as never, { dx: 100 } as never));
  expect(width()).toBe(428);
  const divider = host(tree, 'split-divider');
  expect(StyleSheet.flatten(divider.props.style).width).toBe(24);
  expect(divider.props.children).toBeUndefined();
  expect(divider.props.pointerEvents).toBe('none');
  expect(divider.props.accessibilityState).toEqual({ disabled: true });
  expect(divider.props.accessibilityHint).toContain('Unfold to resize');
  expect(divider.props.onAccessibilityAction).toBeUndefined();
  expect(divider.props.onStartShouldSetResponder).toBeUndefined();
  // The row layout puts the detail at the fold's trailing edge: 428 + 24.
  expect(428 + StyleSheet.flatten(divider.props.style).width).toBe(452);
  act(() => setRegions(emptyReservedRegions));
  expect(width()).toBe(410);
  expect(listMounts).toBe(1);
  responder.mockRestore();
});
it.each([
  { ...vertical, active: false },
  { x: 0, y: 390, width: SPLIT, height: 20, active: true },
])('ignores an inactive or horizontal fold: %j', async (fold) => {
  const tree = await renderApp();
  act(() => setRegions({ divisions: [fold], occlusions: [] }));
  expect(
    StyleSheet.flatten(host(tree, 'reader-split-list').props.style).width,
  ).toBe(370);
  expect(host(tree, 'split-divider').props.accessibilityState).toBeUndefined();
});
it.each([
  [700, 294, 350],
  [SPLIT, 370, 440],
  [951, 399, 476],
])(
  'phone-regular width %ipt starts at %ipt and resizes within 260 to %ipt',
  async (window, initial, maximum) => {
    windowSize(window);
    const tree = await renderApp();
    const width = () =>
      StyleSheet.flatten(host(tree, 'reader-split-list').props.style).width;
    expect(width()).toBe(initial);
    for (let step = 0; step < 10; step++)
      act(() =>
        host(tree, 'split-divider').props.onAccessibilityAction({
          nativeEvent: { actionName: 'increment' },
        }),
      );
    expect(width()).toBe(maximum);
    for (let step = 0; step < 10; step++)
      act(() =>
        host(tree, 'split-divider').props.onAccessibilityAction({
          nativeEvent: { actionName: 'decrement' },
        }),
      );
    expect(width()).toBe(260);
  },
);
it('keeps the phone rule list-only even for a wide regular/compact iPhone window', async () => {
  windowSize(956, {
    horizontal: 'regular',
    vertical: 'compact',
    foldable: false,
  });
  const tree = await renderApp();
  expect(hosts(tree, 'reader-split-detail')).toHaveLength(0);
  expect(hosts(tree, 'split-divider')).toHaveLength(0);
  expect(host(tree, 'list-state').props.children).toBe('0:false:phone');
  expect(route().pathname).toBe('/library');
});

it.each([560, 626, 669, 699])(
  'draws one pane below the 700pt split breakpoint on a %ipt regular phone',
  async (width) => {
    windowSize(width);
    const tree = await renderApp();
    expect(hosts(tree, 'reader-split-detail')).toHaveLength(0);
    expect(hosts(tree, 'split-divider')).toHaveLength(0);
    expect(host(tree, 'list-state').props.children).toBe(
      '0:false:phone-regular',
    );
  },
);

it('uses the foundation accessibility width on a 720pt regular phone', async () => {
  windowSize(720, regular, 3.571);
  const tree = await renderApp();
  expect(
    StyleSheet.flatten(host(tree, 'reader-split-list').props.style).width,
  ).toBe(324);
});

it('draws the divider line between the panes off iPad, not at the leading edge', async () => {
  const tree = await renderApp();
  const split = host(tree, 'reader-split');
  const children = (split.props.children as unknown[]).filter(Boolean);
  // list, divider slot, detail: the 1pt slot holds the line in the row.
  expect(children).toHaveLength(3);
  const slot = host(tree, 'split-divider-slot');
  expect(StyleSheet.flatten(slot.props.style)).toMatchObject({ width: 1 });
  expect(
    slot.findAll(
      (node) =>
        typeof node.type === 'string' && node.props.testID === 'split-divider',
    ),
  ).toHaveLength(1);
});

it.each<RecordEntry>([
  bill,
  text,
  { kind: 'person', key: 'mary-aldred' },
  { kind: 'party', key: 'The Greens' },
  { kind: 'electorate', key: 'el_1' },
  { kind: 'doc', key: 'hansard-1', passage: 'A cited passage' },
])('maps $kind to its native route and back without loading data', (entry) => {
  const route = entryRoute(entry)!;
  expect(entryFromRoute(route)).toEqual(entry);
});
it('keeps unresolved people and routes with extra reader state out of the Bills split', () => {
  expect(entryRoute({ kind: 'person-name', key: 'Mary Aldred' })).toBeNull();
  expect(entryRoute({ kind: 'search-person', key: 'catalog-1' })).toBeNull();
  expect(
    billEntryFromRoute(entryRoute({ kind: 'person', key: 'mary-aldred' })!),
  ).toBeNull();
  expect(
    billEntryFromRoute({
      pathname: '/bill-text/[key]',
      params: { key: bill.key, version: 'v2' },
    }),
  ).toBeNull();
});

const surfaceApp = (Screen: ComponentType) =>
  inMemoryContext({
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    index: Screen,
  });

it('expands a compact directory choice before the default first-row selection', async () => {
  windowSize(390, compact);
  const party = (name: string) => ({
    key: name,
    name,
    speeches: 1,
    members: 2,
    money: {},
    total: 0,
  });
  jest.mocked(loadDirectory).mockResolvedValue({
    people: [],
    parties: [party('Labor'), party('Greens')],
    electorates: [],
    facets: [],
    stale: false,
    savedAt: 1,
    partial: false,
    sources: [],
  });
  const context = inMemoryContext({
    _layout: () => <Stack />,
    directory: DirectoryScreen,
    'party/[slug]': () => <View />,
  });
  await renderApp(context, '/directory?kind=party');
  await act(async () =>
    router.push(
      entryRoute({ kind: 'party', key: 'Labor' }) as Parameters<
        typeof router.push
      >[0],
    ),
  );
  windowSize(SPLIT);
  await settle();
  expect(route().pathname).toBe('/directory');
  expect(route().params.open).toBe('party:Labor');
});
const contentIDs = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props.testID === 'string' &&
        !node.props.testID.includes('-split'),
    )
    .map((node) => node.props.testID)
    .sort();
it.each([
  ['Bills', BillsList],
  ['directories', DirectoryScreen],
  ['Search', Search],
] as const)(
  '%s keeps the phone content and testIDs on compact and mounts its split tree once across folds',
  async (_name, Screen) => {
    const context = surfaceApp(Screen);
    windowSize(390, { ...compact, foldable: false });
    act(() => resetAdaptiveDeviceForTests());
    const phone = await renderApp(context, '/?kind=person');
    const before = contentIDs(phone);
    await act(async () => phone.unmount());
    mounted.splice(mounted.indexOf(phone), 1);
    windowSize(390, compact);
    const duo = await renderApp(context, '/?kind=person');
    expect(contentIDs(duo)).toEqual(before);
    const list = duo.root.findAllByType(ScrollView).at(-1);
    const billsLoads = jest.mocked(catalogs.bills).mock.calls.length;
    const directoryLoads = jest.mocked(loadDirectory).mock.calls.length;
    const searchMounts = mockSearchMounts;
    windowSize(SPLIT);
    windowSize(390, compact);
    windowSize(SPLIT);
    await settle();
    if (list) expect(duo.root.findAllByType(ScrollView).at(-1)).toBe(list);
    expect(jest.mocked(catalogs.bills)).toHaveBeenCalledTimes(billsLoads);
    expect(jest.mocked(loadDirectory)).toHaveBeenCalledTimes(directoryLoads);
    expect(mockSearchMounts).toBe(searchMounts);
  },
);

// Sweep 2, item 10, on the Duo's inner display. Search had its large title
// turned off only on iPad, so the Duo kept one over two panes; and each
// split's empty pane said its own thing in one grey line. Splits start at
// 700 pt (a 669 pt portrait inner display is one column, like a phone), so
// the two-pane case is the inner display in landscape, 951 by 669.
it('Search in a split on the Duo has no large title; one column keeps it', async () => {
  windowSize(951, regular, 1, 669);
  const tree = await renderApp(surfaceApp(Search), '/');
  expect(hosts(tree, 'search-split-detail').length).toBeGreaterThan(0);
  const largeTitleOff = (view: TestRenderer.ReactTestRenderer) =>
    view.root
      .findAllByType(RouteOptions)
      .some(
        (node) =>
          (node.props.options as Record<string, unknown>)
            .headerLargeTitleEnabled === false,
      );
  expect(largeTitleOff(tree)).toBe(true);
  windowSize(669, regular, 1, 951);
  await settle();
  expect(hosts(tree, 'search-split-detail')).toHaveLength(0);
  expect(largeTitleOff(tree)).toBe(false);
});
it.each([
  [
    'Search',
    Search,
    '/',
    'search-split-empty',
    'Search for a person, bill or topic',
  ],
  ['Bills', BillsList, '/', 'bills-split-empty', 'Choose a bill'],
  [
    'directories',
    DirectoryScreen,
    '/?kind=person',
    'directory-split-empty',
    'Choose a parliamentarian',
  ],
] as const)(
  '%s: the empty pane shows its placeholder with a symbol',
  async (_name, Screen, location, id, words) => {
    windowSize(951, regular, 1, 669);
    const tree = await renderApp(surfaceApp(Screen), location);
    expect(host(tree, id).props.children).toBe(words);
    expect(hosts(tree, `${id}-symbol`).length).toBeGreaterThan(0);
  },
);
