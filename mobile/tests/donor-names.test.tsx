import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { decodeMoney } from '../src/api/catalog-decoders';
import { partyMoney } from '../src/api/party-page';
import { apiClient } from '../src/api/runtime';
import { LinkRow, MoneyRow } from '../src/design/primitives';
import { decodeMoneyGraph } from '../src/features/money/data';
import { forgetMoneyGraphs } from '../src/features/money/lookup';
import { buildModel } from '../src/features/money/map/model';
import { MoneyMapSearch } from '../src/features/money/map/MoneyMapSearch';
import MoneyRecordScreen from '../src/features/money/MoneyRecord';
import { moneySummary } from '../src/features/money/MoneyScreen';
import { partiesFigureWords } from '../src/features/money/records';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { partyDonations } from '../src/features/money-public/HubCards';

// Individual donors are public record (Jake, 12 Oct): the app names every
// donor as its graph names it, as the web does, on a party's money page, the
// party page, the map's search and the donor's own record. Invented names only.

jest.mock('../src/api/runtime', () => {
  const get = jest.fn();
  return {
    apiClient: { get },
    client: { get },
    catalogs: { discovery: jest.fn(() => Promise.reject(new Error('none'))) },
  };
});
jest.mock('@shopify/react-native-skia', () => {
  const Native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { Canvas: Native.View, Rect: Native.View };
});
const mockParams: Record<string, string> = {};
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
  const router = { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() };
  return {
    Link,
    router,
    useLocalSearchParams: () => mockParams,
    useRouter: () => router,
    useNavigation: () => ({ setParams: jest.fn() }),
    useSegments: () => [],
    Stack: { Screen: () => null },
  };
});

const cells = (total: number, count: number) => ({
  total,
  count,
  firstYear: 2023,
  lastYear: 2024,
  byYear: { '2023': [total / 2, count / 2], '2024': [total / 2, count / 2] },
});
const donor = (id: string, label: string, industry: string, total: number) => ({
  ...cells(total, 2),
  id,
  label,
  kind: 'donor',
  group: industry,
  industry,
  aliases: [],
});
// Two people (no organisation word in either name, one tagged "individual")
// and one company, all giving to one party.
const raw = {
  meta: {
    generated: '2026-11-10',
    coverage: '2023-24 to 2024-25',
    source: 'AEC',
    methodology: 'Invented fixture.',
    exclusions: [],
    party_totals_note: 'Party node totals cover all cleaned rows.',
  },
  nodes: [
    donor('donor:jane example', 'Jane Example', 'media', 600_000),
    donor('donor:sam sample', 'Sam Sample', 'individual', 400_000),
    donor(
      'donor:example holdings',
      'Example Holdings Pty Ltd',
      'property',
      200_000,
    ),
    {
      ...cells(5_000_000, 40),
      id: 'party:Labor',
      label: 'Labor',
      kind: 'party',
      group: 'party',
      industry: 'party',
    },
  ],
  edges: ['jane example', 'sam sample', 'example holdings'].map((name, i) => ({
    ...cells([600_000, 400_000, 200_000][i]!, 2),
    source: `donor:${name}`,
    target: 'party:Labor',
  })),
};
const names = ['Jane Example', 'Sam Sample', 'Example Holdings Pty Ltd'];
const hidden = /individual donors|name withheld|not named/i;

async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
beforeEach(() => {
  jest.clearAllMocks();
  forgetMoneyGraphs();
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  jest.mocked(apiClient.get).mockImplementation(async (_path, decode) => ({
    data: decode(raw),
    stale: false,
    asOf: '2026-11-10',
    savedAt: 1,
  }));
});

test('the decoder keeps every donor under its own name and id', () => {
  const graph = decodeMoneyGraph(raw);
  expect(
    graph.nodes.filter((n) => n.kind === 'donor').map((n) => [n.id, n.label]),
  ).toEqual([
    ['donor:jane example', 'Jane Example'],
    ['donor:sam sample', 'Sam Sample'],
    ['donor:example holdings', 'Example Holdings Pty Ltd'],
  ]);
});

test("a party's money page lists individual donors by name, each opening its own record", async () => {
  Object.assign(mockParams, { node: 'party:Labor', jurisdiction: 'federal' });
  const r = await render(<MoneyRecordScreen />);
  const rows = r.root
    .findAllByType(MoneyRow)
    .filter((x) => /^money-focus-flow-\d+$/.test(x.props.testID));
  expect(rows.map((x) => x.props.name)).toEqual(names);
  expect(rows.map((x) => x.props.href.params.node)).toEqual([
    'donor:jane example',
    'donor:sam sample',
    'donor:example holdings',
  ]);
  expect(
    r.root.findAll(
      (x) =>
        typeof x.props.children === 'string' && hidden.test(x.props.children),
    ),
  ).toHaveLength(0);
  await act(async () => r.unmount());
});

test("an individual donor's own record is titled with its name", async () => {
  Object.assign(mockParams, {
    node: 'donor:sam sample',
    jurisdiction: 'federal',
  });
  const r = await render(<MoneyRecordScreen />);
  expect(
    r.root.findAll((x) => x.props.children === 'Sam Sample').length,
  ).toBeGreaterThan(0);
  expect(
    r.root.findAll((x) => x.props.testID === 'money-record-originals'),
  ).not.toHaveLength(0);
  await act(async () => r.unmount());
});

test('the party page names its donors and links each one, with no aggregate row', () => {
  const money = partyMoney('Labor', decodeMoney(raw))!;
  expect(money.donors.map((d) => [d.id, d.name])).toEqual([
    ['donor:jane example', 'Jane Example'],
    ['donor:sam sample', 'Sam Sample'],
    ['donor:example holdings', 'Example Holdings Pty Ltd'],
  ]);
  for (const year of money.byYear)
    expect(year.donors.map((d) => d.name)).toEqual(names);
});

test("the map's search finds an individual donor by name", async () => {
  const graph = decodeMoneyGraph(raw);
  const model = buildModel(moneyView(graph, defaultMoneyFilters(graph)));
  const onChoose = jest.fn();
  const r = await render(
    <MoneyMapSearch model={model} onChoose={onChoose} onClose={jest.fn()} />,
  );
  const field = r.root.find(
    (x) =>
      x.props.testID === 'money-map-search-field' &&
      typeof x.props.onChangeText === 'function',
  );
  await act(async () => field.props.onChangeText('jane'));
  const results = r.root
    .findAllByType(LinkRow)
    .filter((x) => /^money-map-result-\d+$/.test(x.props.testID));
  expect(results.map((x) => x.props.title)).toEqual(['Jane Example']);
  await act(async () => results[0]!.props.onPress());
  expect(onChoose).toHaveBeenCalledWith('donor:jane example');
  await act(async () => r.unmount());
});

test('the parties figure says money to parties on a federal graph, and keeps its words on a state graph', () => {
  const federal = decodeMoneyGraph(raw);
  const all = defaultMoneyFilters(federal);
  expect(
    moneySummary(federal, { ...all, grants: false, contracts: false }),
  ).toBe('Money to parties, 2023–24 to 2024–25');
  expect(partyDonations(federal).line).toBe(
    'received by political parties, 2023–24 to 2024–25',
  );
  const state = decodeMoneyGraph({
    ...raw,
    meta: { ...raw.meta, jurisdiction: 'qld' },
  });
  expect(partiesFigureWords(state).title).toBe('Donations to parties');
  expect(partyDonations(state).line).toBe(
    'disclosed to political parties, 2023–24 to 2024–25',
  );
});
