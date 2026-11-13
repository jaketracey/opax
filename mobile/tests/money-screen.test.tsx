import { withNavigationOptions } from './navigation-options';
import { act } from 'react';
import { FlatList } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { apiClient } from '../src/api/runtime';
import MoneyScreen, {
  donorCaption,
  moneySummary,
} from '../src/features/money/MoneyScreen';
import MoneyDonors from '../src/features/money/MoneyDonors';
import { MoneyMap } from '../src/features/money/map/MoneyMap';
import { decodeMoneyGraph } from '../src/features/money/data';
import {
  defaultMoneyFilters,
  moneyView,
  rankedDonors,
} from '../src/features/money/view';
import { filtersFromParams } from '../src/features/money/records';
import { filterStore } from '../src/features/sheets/filter-model';
import {
  Button,
  LinkRow,
  MoneyRow,
  OfflineLine,
  PopUpButton,
  SegmentedPicker,
  SourceLine,
  Text,
} from '../src/design/primitives';
import { pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/features/money/map/MoneyMap', () => ({
  MoneyMap: jest.fn(() => null),
}));
let mockReader: boolean | null = true;
jest.mock('../src/features/money/hooks', () => ({
  ...jest.requireActual('../src/features/money/hooks'),
  useFirstScreenReader: () => mockReader,
}));
jest.mock('react-native-gesture-handler', () =>
  jest.requireActual('./gesture-mock'),
);
const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn(),
};
const mockNavigation = { setParams: jest.fn(), isFocused: () => true };
let mockOptions: Record<string, unknown> = {};
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Wrap = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(Native.View, props, children);
  const Link = Object.assign(Wrap, {
    Trigger: Wrap,
    Preview: () => null,
    Menu: Wrap,
    MenuAction: Wrap,
  });
  return {
    Link,
    get router() {
      return mockRouter;
    },
    useLocalSearchParams: () => mockParams,
    useRouter: () => mockRouter,
    useNavigation: () => mockNavigation,
    useFocusEffect: () => undefined,
    useSegments: () => [],
    Stack: {
      Screen: ({ options }: { options: Record<string, unknown> }) => {
        mockOptions = options;
        return null;
      },
    },
  };
});

const graph = decodeMoneyGraph(pinned('/graph/money.json'));
async function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<MoneyScreen />, (options) => {
        mockOptions = options;
      }),
    );
  });
  return renderer;
}
const byTestID = <T,>(
  r: TestRenderer.ReactTestRenderer,
  type: React.ComponentType<T>,
  id: string,
) => r.root.findAllByType(type).find((x) => x.props.testID === id);
beforeEach(() => {
  jest.clearAllMocks();
  mockReader = true;
  mockOptions = {};
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});

test('VoiceOver opens on the List view; without it the map draws', async () => {
  let r = await render();
  expect(r.root.findByType(SegmentedPicker).props.value).toBe('list');
  expect(
    r.root
      .findByType(SegmentedPicker)
      .props.options.map((o: { label: string }) => o.label),
  ).toEqual(['List', 'Map']);
  expect(MoneyMap).not.toHaveBeenCalled();
  await act(async () => r.unmount());
  mockReader = false;
  r = await render();
  expect(r.root.findByType(SegmentedPicker).props.value).toBe('map');
  expect(MoneyMap).toHaveBeenCalled();
  await act(async () => r.unmount());
});

test('the List view: donors first with the cut stated, parties in the money order, then public money', async () => {
  const r = await render();
  const sections = r.root
    .findAll((x) =>
      ['money-donors', 'money-parties', 'money-public'].includes(
        x.props.testID,
      ),
    )
    .map((x) => x.props.testID);
  expect([...new Set(sections)]).toEqual([
    'money-donors',
    'money-parties',
    'money-public',
  ]);
  expect(byTestID(r, Text, 'money-donor-caption')!.props.children).toBe(
    'The 250 largest donors since 1998–99, largest first',
  );
  const donors = r.root
    .findAllByType(MoneyRow)
    .filter((x) => /^money-donor-\d+$/.test(x.props.testID));
  expect(donors).toHaveLength(20);
  // No rank numbers; the detail says the years and how many parties.
  expect(donors[0]!.props.name).not.toMatch(/^\d+\. /);
  expect(donors[0]!.props.detail).toMatch(
    /^\d{4}–\d{2} to \d{4}–\d{2} · \d+ part/,
  );
  expect(donors[0]!.props.href).toEqual(
    expect.objectContaining({
      pathname: '/money-record',
      params: expect.objectContaining({
        node: expect.stringMatching(/^donor:/),
      }),
    }),
  );
  // Every donor is a row under its own name: no footnote, no aggregate.
  expect(byTestID(r, Text, 'money-individual-donors')).toBeUndefined();
  expect(donors.some((x) => /individual donors/i.test(x.props.name))).toBe(
    false,
  );
  // Parties: Labor, the Coalition, then "Other parties" alphabetically.
  const parties = r.root
    .findAllByType(LinkRow)
    .filter((x) => /^money-party-\d+$/.test(x.props.testID))
    .map((x) => x.props.title as string);
  expect(parties[0]).toMatch(/Labor/);
  const otherAt = r.root.findAll(
    (x) => x.props.title === 'Other parties' && x.props.level === 3,
  ).length;
  expect(otherAt).toBeGreaterThan(0);
  // Every party and both public-money hubs open their money record.
  const targets = graph.nodes.filter(
    (n) => n.kind === 'party' || n.kind === 'grantor',
  );
  const hrefs = [
    ...r.root.findAllByType(LinkRow),
    ...r.root.findAllByType(MoneyRow),
  ]
    .map((x) => x.props.href?.params?.node)
    .filter(Boolean);
  for (const node of targets) expect(hrefs).toContain(node.id);
  // See all carries the window to the donors page.
  const all = r.root.findAll(
    (x) => x.props.action?.testID === 'money-donors-all',
  )[0]!;
  expect(all.props.action.href).toEqual(
    expect.objectContaining({
      pathname: '/money-donors',
      params: expect.objectContaining({ jurisdiction: 'federal' }),
    }),
  );
  const named = graph.nodes.filter((n) => n.kind === 'donor');
  expect(all.props.action.accessibilityLabel).toBe(
    `See all ${named.length} donors`,
  );
  const source = byTestID(r, SourceLine, 'money-list-source')!;
  expect(source.props.originals).toContainEqual(
    expect.objectContaining({ url: 'https://transparency.aec.gov.au/' }),
  );
  await act(async () => r.unmount());
});

test('Filters open /filters/money and apply live through the params', async () => {
  const r = await render();
  const items = (
    mockOptions.unstable_headerRightItems as () => {
      label?: string;
      onPress?: () => void;
    }[]
  )();
  const filters = items.find((item) => item.label === 'Filters')!;
  await act(async () => filters.onPress!());
  const href = mockRouter.push.mock.calls.at(-1)![0];
  expect(href).toEqual(
    expect.objectContaining({
      pathname: '/filters/[list]',
      params: expect.objectContaining({ list: 'money' }),
    }),
  );
  const owner = href.params.owner as string;
  const store = filterStore('money', owner)!;
  expect(store).toBeDefined();
  await act(async () =>
    store.set({ ...store.get(), from: 2024, to: 2024 } as never),
  );
  expect(mockNavigation.setParams).toHaveBeenLastCalledWith(
    expect.objectContaining({ from: '2024', to: '2024' }),
  );
  await act(async () => r.unmount());
});

test('the jurisdiction pop-up writes the jurisdiction and clears the window', async () => {
  const r = await render();
  const popup = r.root.findByType(PopUpButton);
  expect(popup.props.testID).toBe('money-jurisdiction');
  await act(async () => popup.props.onChange('qld'));
  expect(mockNavigation.setParams).toHaveBeenLastCalledWith(
    expect.objectContaining({
      jurisdiction: 'qld',
      from: undefined,
      to: undefined,
    }),
  );
  await act(async () => r.unmount());
});

test('test hooks write the year and push a party record with the window', async () => {
  Object.assign(mockParams, { from: '2024', to: '2024' });
  const r = await render();
  const button = (id: string) => byTestID(r, Button, id)!;
  await act(async () => button('money-test-year').props.onPress());
  expect(mockNavigation.setParams).toHaveBeenCalled();
  await act(async () => button('money-test-focus').props.onPress());
  expect(mockRouter.push).toHaveBeenLastCalledWith(
    expect.objectContaining({
      pathname: '/money-record',
      params: expect.objectContaining({
        node: 'party:Labor',
        from: '2024',
        to: '2024',
      }),
    }),
  );
  await act(async () => r.unmount());
});

test('focus= pushes the party record once the graph loads', async () => {
  Object.assign(mockParams, { focus: 'party:Labor' });
  const r = await render();
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(mockRouter.push).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: '/money-record',
      params: expect.objectContaining({ node: 'party:Labor' }),
    }),
  );
  await act(async () => r.unmount());
});

test('summary, caption and footnote helpers state the cut in plain words', () => {
  const all = defaultMoneyFilters(graph);
  // All years states the returns' span, not the later public-money years.
  expect(moneySummary(graph, all)).toBe(
    'Money to parties, 1998–99 to 2025–26, and public money to donors on the map',
  );
  expect(donorCaption(graph, { ...all, from: 2024, to: 2024 })).toBe(
    'Largest in 2024–25 among the 250 largest donors since 1998–99',
  );
  expect(
    moneySummary(graph, { ...all, from: 2024, to: 2024, industry: 'unions' }),
  ).toBe('Money to parties in 2024–25, union donors only');
});

test('every push from the map carries via=map', async () => {
  const r = await render();
  const rows = [
    ...r.root.findAllByType(MoneyRow),
    ...r.root.findAllByType(LinkRow),
  ].filter((x) => x.props.href?.pathname === '/money-record');
  expect(rows.length).toBeGreaterThan(20);
  for (const row of rows) expect(row.props.href.params.via).toBe('map');
  const all = r.root.findAll(
    (x) => x.props.action?.testID === 'money-donors-all',
  )[0]!;
  expect(all.props.action.href.params.via).toBe('map');
  await act(async () => r.unmount());
});

test('a donors search with no match keeps its caption over one plain line', async () => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(<MoneyDonors />, (options) => {
        mockOptions = options;
      }),
    );
  });
  const named = graph.nodes.filter((n) => n.kind === 'donor');
  await act(async () =>
    (
      mockOptions.headerSearchBarOptions as {
        onChangeText: (event: { nativeEvent: { text: string } }) => void;
      }
    ).onChangeText({ nativeEvent: { text: 'zzzz' } }),
  );
  expect(byTestID(r, Text, 'money-donors-caption')!.props.children).toBe(
    `0 of ${named.length} donors`,
  );
  const none = byTestID(r, Text, 'money-donors-none')!;
  expect(none.props).toMatchObject({ variant: 'body', tone: 'inkSoft' });
  expect(none.props.children).toBe('No donors match “zzzz”.');
  await act(async () => r.unmount());
});

test('the complete donors list virtualises rows while retaining every named donor', async () => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<MoneyDonors />);
  });
  const list = r.root.findByType(FlatList);
  const named = graph.nodes.filter((n) => n.kind === 'donor');
  expect(list.props.data).toHaveLength(named.length);
  const mounted = r.root.findAllByType(MoneyRow);
  expect(mounted.length).toBeGreaterThan(0);
  expect(mounted.length).toBeLessThan(named.length);
  expect(byTestID(r, SourceLine, 'money-donors-source')).toBeDefined();
});

test.each([
  ['industry', { industry: 'unions' }],
  ['minimum flow', { min: '1000000000000000' }],
  ['layers', { layers: 'contracts' }],
] as const)(
  'the donors page respects the carried %s filter',
  async (_name, params) => {
    Object.assign(mockParams, params);
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<MoneyDonors />);
    });
    const expected = rankedDonors(
      moneyView(graph, filtersFromParams(graph, mockParams)),
    );
    const actual: { id: string }[] = r.root.findByType(FlatList).props.data;
    expect(actual.length).toBe(expected.length);
    expect(actual.every((node, i) => node.id === expected[i]?.id)).toBe(true);
  },
);

test('the donors page states an industry window in plain words', async () => {
  Object.assign(mockParams, { industry: 'unions' });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(<MoneyDonors />, (options) => {
        mockOptions = options;
      }),
    );
  });
  expect(byTestID(r, Text, 'money-donors-window')!.props.children).toBe(
    'union donors',
  );
  await act(async () => r.unmount());
});

test('the List view counts one receipt and one donor in the singular', async () => {
  const raw = structuredClone(pinned('/graph/money.json')) as {
    nodes: { id: string; kind: string; count: number }[];
    edges: { source: string; target: string }[];
  };
  const keep = raw.nodes.find((n) => n.kind === 'donor')!;
  const dropped = new Set(
    raw.nodes
      .filter((n) => n.kind === 'donor' && n.id !== keep.id)
      .map((n) => n.id),
  );
  raw.nodes = raw.nodes.filter((n) => !dropped.has(n.id));
  raw.edges = raw.edges.filter(
    (e) => !dropped.has(e.source) && !dropped.has(e.target),
  );
  for (const n of raw.nodes) if (n.kind === 'party') n.count = 1;
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(path === '/graph/money.json' ? raw : pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
  const r = await render();
  const party = r.root.findAll(
    (x) => x.props.testID === 'money-party-0' && 'detail' in x.props,
  )[0]!;
  expect(party.props.detail).toMatch(/^1 receipt · /);
  const all = r.root.findAll(
    (x) => x.props.action?.testID === 'money-donors-all',
  )[0]!;
  expect(all.props.action.accessibilityLabel).toBe('See all 1 donor');
  await act(async () => r.unmount());
});

test.each([
  ['offline', undefined, 1],
  ['the server was unavailable', 'unavailable', 0],
  ['the latest copy was unreadable', 'unreadable', 0],
] as const)(
  'a saved donors list says offline only when %s calls for it',
  async (_name, staleReason, lines) => {
    jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
      data: decode(pinned(path)),
      stale: true,
      asOf: '2026-09-21',
      savedAt: 1,
      ...(staleReason ? { staleReason } : {}),
    }));
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<MoneyDonors />);
    });
    expect(r.root.findAllByType(OfflineLine)).toHaveLength(lines);
    await act(async () => r.unmount());
  },
);

test('the List view gives the public money rows and their totals distinct IDs', async () => {
  const { StatStrip } = jest.requireActual('../src/design/primitives');
  const r = await render();
  const rows = r.root
    .findAllByType(MoneyRow)
    .map((x) => x.props.testID as string)
    .filter((id) => id.startsWith('money-public-'));
  expect(rows.length).toBeGreaterThan(0);
  const tiles = r.root
    .findAllByType(StatStrip)
    .flatMap((x) => x.props.tiles.map((t: { testID: string }) => t.testID));
  expect(tiles.length).toBeGreaterThan(0);
  for (const id of tiles) expect(rows).not.toContain(id);
  await act(async () => r.unmount());
});
