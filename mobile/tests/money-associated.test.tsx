import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  SectionList,
  Text as NativeText,
  useWindowDimensions,
} from 'react-native';
import { Catalogs } from '../src/api/catalogs';
import { AssociatedEntityLabel } from '../src/design/AssociatedEntityLabel';
import { openSource } from '../src/navigation/external';
import MoneyDonors from '../src/features/money/MoneyDonors';
import { PartyPage } from '../src/features/Party';
import PartySources from '../src/features/people/PartySources';
import { buildModel } from '../src/features/money/map/model';
import { MoneyMapLabels } from '../src/features/money/map/MoneyMapLabels';
import {
  MoneyMapPanel,
  focusFlows,
} from '../src/features/money/map/MoneyMapPanel';
import { labelSlots, visibleLabels } from '../src/features/money/map/labels';
import {
  defaultMoneyFilters,
  moneyView,
  rankedDonors,
} from '../src/features/money/view';
import { moneyRecordRoute } from '../src/navigation/routes';
import { apiClient, catalogs } from '../src/api/runtime';
import MoneyScreen from '../src/features/money/MoneyScreen';
import MoneyRecordScreen from '../src/features/money/MoneyRecord';
import { decodeMoneyGraph } from '../src/features/money/data';
import { decodeMoney } from '../src/api/catalog-decoders';
import { partyMoney } from '../src/api/party-page';
import {
  AEC_ASSOCIATED_REGISTER,
  associatedLine,
  donorAssociated,
  donorAssociatedTo,
} from '../src/api/associated';
import {
  FigureBlock,
  IconButton,
  LinkRow,
  MoneyRow,
  Text,
} from '../src/design/primitives';
import { pinned, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn() },
  catalogs: {
    partyPage: jest.fn(),
    followSources: jest.fn(),
    discovery: jest.fn(() => Promise.reject(new Error('none'))),
  },
  peopleDepth: {
    access: jest.fn(() => Promise.reject(new Error('offline'))),
    funding: jest.fn(() => Promise.reject(new Error('offline'))),
  },
}));
jest.mock('../src/navigation/preview', () => ({
  ...jest.requireActual('../src/navigation/preview'),
  RouteOptions: () => null,
}));
jest.mock('../src/navigation/external', () => ({
  openSource: jest.fn(),
  openOnWeb: jest.fn(),
  sourceUrl: (s: string) => s,
}));
jest.mock('../src/features/money/map/MoneyMap', () => ({
  MoneyMap: () => null,
}));
jest.mock('../src/features/money/hooks', () => ({
  ...jest.requireActual('../src/features/money/hooks'),
  useFirstScreenReader: () => true,
}));
jest.mock('react-native-gesture-handler', () =>
  jest.requireActual('./gesture-mock'),
);
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
};
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Wrap = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(Native.View, props, children);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    useLocalSearchParams: () => mockParams,
    useRouter: () => mockRouter,
    get router() {
      return mockRouter;
    },
    useNavigation: () => ({ setParams: jest.fn() }),
    useFocusEffect: () => undefined,
    useIsPreview: () => false,
    useSegments: () => [],
    Stack: { Screen: () => null },
  };
});

const REGISTER =
  'https://transparency.aec.gov.au/RegisterOfEntities?clientType=associatedentity';
const VAPOLD_TAG =
  'associated entity of Liberal Party of Australia (Victorian Division), per AEC register (returns 2008-09 to 2024-25)';
const SDA_TAG =
  'associated entity of Labor, per AEC register (returns 2009-10 to 2024-25; 8 party entries)';
const tie = (party: string, register: string) => [
  {
    party,
    registerParties: [register],
    firstYear: '2008-09',
    lastYear: '2024-25',
    source: 'aec_assoc_entity',
    url: REGISTER,
  },
];
type RawNode = Record<string, unknown> & { id: string; label: string };
type RawGraph = {
  nodes: RawNode[];
  edges: { source: string; target: string; total: number }[];
};
/** The pinned graph with two reference donors among Labor's largest. */
function tagged() {
  const raw = structuredClone(pinned('/graph/money.json')) as RawGraph;
  const donorIds = raw.edges
    .filter((e) => e.target === 'party:Labor' && e.source.startsWith('donor:'))
    .sort((a, b) => b.total - a.total)
    .map((e) => e.source);
  const byId = new Map(raw.nodes.map((n) => [n.id, n]));
  const [vapold, sda] = [byId.get(donorIds[0]!)!, byId.get(donorIds[1]!)!];
  Object.assign(vapold, {
    label: 'Vapold Pty Ltd',
    associatedTag: VAPOLD_TAG,
    associatedWith: tie(
      'Liberal',
      'Liberal Party of Australia (Victorian Division)',
    ),
  });
  Object.assign(sda, {
    label: 'Shop, Distributive and Allied Employees Association',
    associatedTag: SDA_TAG,
    associatedWith: tie('Labor', 'Australian Labor Party (Victorian Branch)'),
  });
  return { raw, vapold, sda };
}
async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
let served: unknown;
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  served = undefined;
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(served ?? pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});

test('the helper shows the tag for any row of the donor and only the tied party on a party row', () => {
  const { vapold, sda } = tagged();
  expect(donorAssociated(vapold)).toEqual({ tag: VAPOLD_TAG, url: REGISTER });
  expect(associatedLine(donorAssociated(vapold))).toBe(
    `Associated${VAPOLD_TAG.slice('associated'.length)}`,
  );
  expect(donorAssociatedTo(vapold, 'Liberal')?.tag).toBe(VAPOLD_TAG);
  expect(donorAssociatedTo(vapold, 'Labor')).toBeNull();
  expect(donorAssociatedTo(sda, 'Labor')?.tag).toBe(SDA_TAG);
  expect(donorAssociatedTo(sda, 'Liberal')).toBeNull();
  // Without the fields, or with unusable ones, nothing is returned.
  expect(donorAssociated({})).toBeNull();
  expect(donorAssociated({ associatedTag: '  ' })).toBeNull();
  expect(donorAssociatedTo({}, 'Labor')).toBeNull();
  expect(donorAssociatedTo({ associatedWith: 'Labor' }, 'Labor')).toBeNull();
  // A missing or non-https url falls back to the AEC register.
  expect(
    donorAssociated({
      associatedTag: 'x',
      associatedWith: [{ party: 'Labor', url: 'javascript:alert(1)' }],
    })?.url,
  ).toBe(AEC_ASSOCIATED_REGISTER);
});

test('both decoders keep the fields and a graph without them is unchanged', () => {
  const { raw } = tagged();
  const graph = decodeMoneyGraph(raw);
  expect(
    graph.nodes.find((n) => n.label === 'Vapold Pty Ltd')?.associatedTag,
  ).toBe(VAPOLD_TAG);
  const plain = decodeMoneyGraph(pinned('/graph/money.json'));
  expect(plain.nodes.some((n) => 'associatedTag' in n)).toBe(false);
  const money = decodeMoney(raw);
  expect(
    money.nodes.find((n) => n.label === 'Vapold Pty Ltd')?.associatedWith,
  ).toEqual([expect.objectContaining({ party: 'Liberal' })]);
  // A malformed optional field is dropped, never a reason to refuse the graph.
  const bad = structuredClone(raw);
  Object.assign(bad.nodes[0]!, { associatedTag: 7, associatedWith: 'x' });
  expect(() => decodeMoney(bad)).not.toThrow();
});

test("a party page's donor rows carry the tag only for the tied party", () => {
  const { raw } = tagged();
  const labor = partyMoney('Labor', decodeMoney(raw))!;
  const row = (name: string) => labor.donors.find((d) => d.name === name);
  expect(
    row('Shop, Distributive and Allied Employees Association')?.associated,
  ).toBe(`Associated${SDA_TAG.slice('associated'.length)}`);
  // Vapold is tied to Liberal: nothing on a Labor row.
  expect(row('Vapold Pty Ltd')?.associated ?? null).toBeNull();
  const plain = partyMoney('Labor', decodeMoney(pinned('/graph/money.json')))!;
  expect(plain.donors.every((d) => d.associated === null)).toBe(true);
});

test('the ranked list shows the tag in the row detail and accessibility label', async () => {
  const { raw } = tagged();
  served = raw;
  const r = await render(<MoneyScreen />);
  const rows = r.root
    .findAllByType(LinkRow)
    .filter((x) => String(x.props.testID).startsWith('money-donor-'));
  const find = (name: string) =>
    rows.find((x) => String(x.props.title).includes(name))!;
  for (const [name, tag] of [
    ['Vapold Pty Ltd', VAPOLD_TAG],
    ['Shop, Distributive and Allied Employees Association', SDA_TAG],
  ] as const) {
    const line = `Associated${tag.slice('associated'.length)}`;
    const row = find(name);
    expect(row.props.detail).toMatch(
      new RegExp(`^${line.replace(/[()]/g, '\\$&')} · `),
    );
    expect(row.props.accessibilityLabel).toContain(line);
  }
  const untagged = rows.filter(
    (x) => !/Vapold|Shop, Distributive/.test(x.props.title),
  );
  expect(untagged.length).toBeGreaterThan(0);
  expect(untagged.every((x) => !/Associated entity/.test(x.props.detail))).toBe(
    true,
  );
  await act(async () => r.unmount());
});

test('a party record tags a donor only when tied to that party; the donor record shows and links it', async () => {
  const { raw, vapold, sda } = tagged();
  served = raw;
  mockParams.node = 'party:Labor';
  const party = await render(<MoneyRecordScreen />);
  const rows = party.root.findAllByType(LinkRow);
  const of = (label: string) => rows.find((x) => x.props.title === label)!;
  expect(of(sda.label).props.detail).toMatch(/^Associated entity of Labor/);
  expect(of(vapold.label).props.detail).not.toMatch(/Associated/);
  await act(async () => party.unmount());

  mockParams.node = vapold.id;
  const donor = await render(<MoneyRecordScreen />);
  const lines = donor.root
    .findAllByType(Text)
    .filter((x) => x.props.testID === 'money-focus-associated');
  expect(lines[0]!.props.children).toBe(
    `Associated${VAPOLD_TAG.slice('associated'.length)}`,
  );
  const source = donor.root
    .findAllByType(FigureBlock)
    .find((x) => x.props.testID === 'money-focus-amount')!;
  expect(
    donor.root
      .findAllByType(LinkRow)
      .some(
        (x) =>
          x.props.external?.url === REGISTER &&
          x.props.title === 'AEC register of associated entities',
      ),
  ).toBe(true);
  // Donations retain their own source, separately from the register attribution.
  expect(source.props.citation.originals[0].url).toBe(
    'https://transparency.aec.gov.au/',
  );
  const link = donor.root
    .findAllByType(Text)
    .find((x) => x.props.testID === 'money-focus-associated')!;
  expect(link.props.accessibilityRole).toBe('link');
  await act(async () => link.props.onPress());
  expect(openSource).toHaveBeenCalledWith(
    REGISTER,
    'AEC register of associated entities',
  );
  await act(async () => donor.unmount());
});

test('a donor without the fields renders as before', async () => {
  mockParams.node = tagged().sda.id;
  const r = await render(<MoneyRecordScreen />);
  expect(
    r.root
      .findAllByType(Text)
      .filter((x) => x.props.testID === 'money-focus-associated'),
  ).toHaveLength(0);
  expect(
    r.root
      .findAllByType(LinkRow)
      .filter((x) => x.props.external?.url === REGISTER),
  ).toHaveLength(0);
  await act(async () => r.unmount());
});

test.each(['Labor', 'Liberal', 'Nationals', 'LNP'])(
  'the same register wording and party rule applies to %s',
  (party) => {
    const record = {
      associatedTag: `associated entity of ${party}, per AEC register`,
      associatedWith: [{ party, url: REGISTER }],
    };
    expect(donorAssociatedTo(record, party)).toEqual({
      tag: record.associatedTag,
      url: REGISTER,
    });
    expect(donorAssociatedTo(record, 'Greens')).toBeNull();
  },
);

test('adding register metadata leaves every donor ranking, amount and flow unchanged', () => {
  const { raw } = tagged();
  const taggedGraph = decodeMoneyGraph(raw);
  const plain = structuredClone(raw);
  plain.nodes.forEach((node) => {
    delete node.associatedTag;
    delete node.associatedWith;
  });
  const graph = decodeMoneyGraph(plain);
  const ranks = (g: typeof graph) =>
    rankedDonors(moneyView(g, defaultMoneyFilters(g))).map((n) => [
      n.id,
      n.total,
    ]);
  expect(ranks(taggedGraph)).toEqual(ranks(graph));
  expect(taggedGraph.edges).toEqual(graph.edges);
  const bad = structuredClone(raw);
  Object.assign(bad.nodes[0]!, {
    associatedTag: 7,
    associatedWith: [null, {}, { party: 9 }],
  });
  const decoded = decodeMoneyGraph(bad);
  expect(decoded.nodes[0]!.associatedTag).toBeUndefined();
  expect(decoded.nodes[0]!.associatedWith).toBeUndefined();
  expect(decoded.nodes).toHaveLength(taggedGraph.nodes.length);
});

test('See all donors keeps the tag and opens the same native record', async () => {
  const { raw, vapold } = tagged();
  served = raw;
  const r = await render(<MoneyDonors />);
  const row = r.root
    .findAllByType(LinkRow)
    .find((x) => x.props.title === vapold.label)!;
  expect(row.props.detail).toContain(associatedLine(donorAssociated(vapold)));
  expect(row.props.accessibilityLabel).toContain(VAPOLD_TAG.slice(1));
  expect(row.props.href.params.node).toBe(vapold.id);
});

const modelFor = () => {
  const { raw, vapold, sda } = tagged();
  const graph = decodeMoneyGraph(raw);
  const model = buildModel(moneyView(graph, defaultMoneyFilters(graph)));
  return { model, vapold, sda };
};

test('the current map model carries the export tag to the full selected label', async () => {
  const { model, vapold } = modelFor();
  const slots = labelSlots(
    model,
    new Map(),
    () => ({ x: 20, y: 40 }),
    model.byId.get(vapold.id)!,
  );
  const focus = slots.find((s) => s.kind === 'focus')!;
  expect(focus.text).toBe(vapold.label);
  expect(focus.sub).toBe(associatedLine(donorAssociated(vapold)));
  expect(slots.filter((s) => s.kind !== 'focus').every((s) => !s.sub)).toBe(
    true,
  );
  const value = (n: number) => ({ value: n }) as never;
  const r = await render(
    <MoneyMapLabels
      slots={[focus]}
      tx={value(0)}
      ty={value(0)}
      k={value(1)}
      fitK={value(1)}
      allowed={{ value: { [focus.key]: 1 } } as never}
      width={390}
    />,
  );
  const texts = r.root.findAllByType(NativeText);
  expect(texts.some((t) => t.props.children === vapold.label)).toBe(true);
  expect(texts.some((t) => t.props.children === focus.sub)).toBe(true);
  expect(
    texts.every((t) => t.props.allowFontScaling && !t.props.numberOfLines),
  ).toBe(true);
  const slot = { ...focus, x: 0, y: 50, r: 0 };
  expect(
    visibleLabels(
      [slot],
      { tx: 0, ty: 0, k: 1 },
      { width: 390, height: 100 },
      { width: 120, height: 22 },
    ),
  ).toEqual({});
  expect(
    visibleLabels(
      [{ ...slot, sub: undefined }],
      { tx: 0, ty: 0, k: 1 },
      { width: 390, height: 100 },
      { width: 120, height: 22 },
    ),
  ).toEqual({ [slot.key]: 1 });
});

async function renderPanel(id: string) {
  const { model } = modelFor();
  const node = model.nodes[model.byId.get(id)!]!;
  const record = moneyRecordRoute({ node: id }, node.label);
  return render(
    <MoneyMapPanel
      focus={{
        node,
        flows: focusFlows(model, node.index),
        record,
        flowRecord: (other) =>
          moneyRecordRoute({ node: other.id }, other.label),
        previous: null,
        next: null,
      }}
      totals={{ donations: model.totals.donations, publicMoney: null }}
      caption="Recorded flows"
      legend={null}
      sourceLine={null}
      stageHeight={800}
      expanded
      onExpanded={jest.fn()}
      onClear={jest.fn()}
      onPeekHeight={jest.fn()}
    />,
  );
}

test('the map attribution links to the register separately from its entity header', async () => {
  const { vapold } = tagged();
  const r = await renderPanel(vapold.id);
  const header = r.root.findAll(
    (n) => n.props.testID === 'money-map-focus-link',
  )[0]!;
  expect(header.props.accessibilityRole).toBe('link');
  await act(async () => header.props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(
    moneyRecordRoute({ node: vapold.id }, vapold.label),
  );
  const tag = r.root
    .findAllByType(Text)
    .find((n) => n.props.testID === 'money-map-focus-associated')!;
  expect(tag.props.accessibilityLabel).toBe(
    associatedLine(donorAssociated(vapold)),
  );
  await act(async () => tag.props.onPress());
  expect(openSource).toHaveBeenCalledWith(
    REGISTER,
    'AEC register of associated entities',
  );
  expect(
    r.root
      .findAllByType(IconButton)
      .some((n) => n.props.testID === 'money-map-focus-clear'),
  ).toBe(true);
});

test('a party popover tags only donors tied to that party', async () => {
  const { vapold, sda } = tagged();
  const r = await renderPanel('party:Labor');
  const rows = r.root.findAllByType(LinkRow);
  expect(rows.find((n) => n.props.title === sda.label)!.props.detail).toContain(
    associatedLine(donorAssociated(sda)),
  );
  expect(
    rows.find((n) => n.props.title === vapold.label)!.props.detail,
  ).not.toContain('Associated entity');
});

test.each([1, 3.571])(
  'the register label scales and wraps at font scale %s with a complete VoiceOver label',
  async (fontScale) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
    const associated = donorAssociated(tagged().vapold);
    const r = await render(
      <AssociatedEntityLabel associated={associated} testID="tag" />,
    );
    const text = r.root.findByType(NativeText);
    expect(text.props.allowFontScaling).toBe(true);
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.adjustsFontSizeToFit).toBeUndefined();
    expect(text.props.accessibilityRole).toBe('link');
    expect(text.props.accessibilityLabel).toBe(associatedLine(associated));
    expect(text.props.children).toBe(associatedLine(associated));
  },
);

async function partyView(party: string) {
  const api = new Catalogs({
    get: async (path, decode) => ({
      data: decode(
        path === '/graph/money.json'
          ? served
          : path === '/api/person-slugs'
            ? slugs
            : pinned(path),
      ),
      stale: false,
      savedAt: 1,
      asOf: null,
    }),
  });
  const view = await api.partyPage(party);
  jest.mocked(catalogs.partyPage).mockResolvedValue(view);
  return view;
}

test('party receipts and largest sources by year preserve the scoped tag and donor links', async () => {
  const { raw, vapold, sda } = tagged();
  served = raw;
  await partyView('Labor');
  const r = await render(<PartyPage input="Labor" />);
  const rows = r.root.findAllByType(MoneyRow);
  expect(rows.find((n) => n.props.name === sda.label)!.props.detail).toContain(
    'Associated entity of Labor',
  );
  expect(
    rows.find((n) => n.props.name === vapold.label)!.props.detail,
  ).toBeUndefined();
  expect(rows.find((n) => n.props.name === sda.label)!.props.href).toEqual(
    moneyRecordRoute({ node: sda.id }, sda.label),
  );
  mockParams.name = 'Labor';
  const years = await render(<PartySources />);
  const list = years.root.findByType(SectionList);
  type SourceRow = {
    id: string;
    name: string;
    amount: number;
    associated: string | null;
  };
  const sections = list.props.sections as {
    title: string;
    data: SourceRow[];
  }[];
  // SectionList virtualises older years. Exercise the real row renderer for each donor.
  for (const donor of [sda, vapold]) {
    const section = sections.find((s) =>
      s.data.some((d) => d.id === donor.id),
    )!;
    const item = section.data.find((d) => d.id === donor.id)!;
    const rendered = await render(
      list.props.renderItem({ item, index: 0, section }),
    );
    const row = rendered.root.findByType(MoneyRow);
    expect(row.props.detail).toBe(
      donor.id === sda.id ? associatedLine(donorAssociated(sda)) : undefined,
    );
    expect(row.props.href).toEqual(
      moneyRecordRoute({ node: donor.id }, donor.label),
    );
  }
});

test('associated-entity rows use the export tag and retain native donor navigation', async () => {
  const { raw, vapold } = tagged();
  served = raw;
  const view = await partyView('Liberal');
  view.data!.associated.data!.rows = [
    {
      name: vapold.label,
      year: '2024-25',
      receipts: 1000,
      payments: null,
      debts: null,
    },
  ];
  const r = await render(<PartyPage input="Liberal" />);
  const row = r.root
    .findAllByType(LinkRow)
    .find((n) => n.props.testID === 'party-associated-0')!;
  expect(row.props.detail).toContain(associatedLine(donorAssociated(vapold)));
  expect(row.props.external).toBeUndefined();
  await act(async () => row.props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(
    moneyRecordRoute(
      { node: vapold.id, jurisdiction: 'federal' },
      vapold.label,
    ),
  );
});

test('large text keeps complete donor names beside the quiet row detail', async () => {
  const { raw, vapold, sda } = tagged();
  served = raw;
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  const r = await render(<MoneyDonors />);
  for (const donor of [vapold, sda]) {
    const row = r.root
      .findAllByType(LinkRow)
      .find((n) => n.props.title === donor.label)!;
    expect(row.props.accessibilityLabel).toContain(donor.label);
    expect(row.props.accessibilityLabel).toContain(
      associatedLine(donorAssociated(donor)),
    );
    const names = row
      .findAllByType(NativeText)
      .filter((n) => n.props.children === donor.label);
    expect(names.length).toBeGreaterThan(0);
    expect(
      names.every((n) => n.props.allowFontScaling && !n.props.numberOfLines),
    ).toBe(true);
  }
});

test('an optional tag read failing does not prevent a later donor lookup', async () => {
  const { raw, vapold } = tagged();
  served = raw;
  const view = await partyView('Liberal');
  view.data!.associated.data!.rows = [
    {
      name: vapold.label,
      year: '2024-25',
      receipts: 1000,
      payments: null,
      debts: null,
    },
  ];
  jest.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
  const r = await render(<PartyPage input="Liberal" />);
  const row = r.root
    .findAllByType(LinkRow)
    .find((n) => n.props.testID === 'party-associated-0')!;
  expect(row.props.detail).not.toContain('Associated entity');
  await act(async () => row.props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(
    moneyRecordRoute(
      { node: vapold.id, jurisdiction: 'federal' },
      vapold.label,
    ),
  );
});
