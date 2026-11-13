import * as WebBrowser from 'expo-web-browser';
import { act } from 'react';
import * as RN from 'react-native';
import TestRenderer from 'react-test-renderer';
import type { RecordResult } from '../src/api/client';
import { apiClient } from '../src/api/runtime';
import {
  ContentUnavailable,
  FigureBlock,
  Icon,
  LinkRow,
  MoneyRow,
  OfflineLine,
  Text,
  ValueRow,
} from '../src/design/primitives';
import { symbols } from '../src/design/symbols';
import { decodeMoneyGraph } from '../src/features/money/data';
import {
  donorNodeFor,
  forgetMoneyGraphs,
  rememberMoneyGraph,
} from '../src/features/money/lookup';
import MoneyRecordScreen, {
  contractsCaveat,
  grantsCaveat,
  individualsNote,
} from '../src/features/money/MoneyRecord';
import { bothRegistersCaveat } from '../src/features/money/records';
import {
  agencyRoute,
  moneyRecordRoute,
} from '../src/navigation/routes/public-money';
import { pinned } from './pinned';

jest.mock('../src/design/environment', () => ({
  ...jest.requireActual('../src/design/environment'),
  isE2E: false,
}));
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
const mockRouter = { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() };
const mockNavigation = { setParams: jest.fn() };
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
    useSegments: () => [],
    Stack: {
      Screen: ({ options }: { options: Record<string, unknown> }) => {
        mockOptions = options;
        return null;
      },
    },
  };
});

type RawNode = {
  id: string;
  kind: string;
  label: string;
  flow?: string;
  withheld?: boolean;
  grants?: { rid?: string };
  contracts?: { rid?: string };
};
const raw = pinned('/graph/money.json') as {
  nodes: RawNode[];
  meta: { contracts_coverage: string };
};
async function render(params: Record<string, string>) {
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  Object.assign(mockParams, params);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<MoneyRecordScreen />);
  });
  return r;
}
const figure = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAllByType(FigureBlock).find((x) => x.props.testID === id)!;
const order = (r: TestRenderer.ReactTestRenderer, ids: string[]) => {
  const all = r.root.findAll(() => true);
  return ids.map((id) => all.findIndex((x) => x.props.testID === id));
};
/** Originals follow every data row and precede the onward actions. */
function expectOriginalsLast(r: TestRenderer.ReactTestRenderer) {
  const all = r.root.findAll(() => true);
  const originals = all.findIndex(
    (x) => x.props.testID === 'money-record-originals',
  );
  expect(originals).toBeGreaterThan(-1);
  const sections = all.filter((x) =>
    /^money-record-(donations|grants|contracts)$/.test(x.props.testID),
  );
  expect(sections.length).toBeGreaterThan(0);
  for (const section of sections)
    for (const row of section.findAll(() => true))
      expect(all.indexOf(row)).toBeLessThan(originals);
  const more = all.findIndex((x) => x.props.testID === 'money-record-more');
  if (more !== -1) expect(originals).toBeLessThan(more);
}

async function renderDonor(label: string, aliases: string[] = []) {
  const figures = {
    total: 1000,
    count: 1,
    firstYear: 2024,
    lastYear: 2024,
  };
  const graph = {
    meta: { generated: '2026-11-10', coverage: '2024–25', source: 'AEC' },
    nodes: [
      {
        ...figures,
        id: 'donor:example',
        kind: 'donor',
        label,
        aliases,
        group: 'other',
        industry: 'other',
      },
      {
        ...figures,
        id: 'party:Labor',
        kind: 'party',
        label: 'Labor',
        group: 'party',
        industry: 'party',
      },
    ],
    edges: [{ ...figures, source: 'donor:example', target: 'party:Labor' }],
  };
  jest.mocked(apiClient.get).mockImplementation(async (_path, decode) => ({
    data: decode(graph),
    stale: false,
    asOf: '2026-11-10',
    savedAt: 1,
  }));
  const donor = decodeMoneyGraph(graph).nodes.find((n) => n.kind === 'donor')!;
  return render({ node: donor.id, via: 'map' });
}
beforeEach(() => {
  jest.clearAllMocks();
  forgetMoneyGraphs();
  mockOptions = {};
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});
afterEach(() => jest.restoreAllMocks());

test('a party record: originals last, the window figure, all years beside it, and donors that push their records', async () => {
  const r = await render({
    node: 'party:Labor',
    from: '2024',
    to: '2024',
    industry: 'unions',
    layers: 'donations',
  });
  const amount = figure(r, 'money-focus-amount');
  expect(amount.props.ink).toBe('money');
  expect(amount.props.label).toMatch(/^in [\d,]+ disclosure records, 2024–25$/);
  expect(amount.props.caveat).toMatch(/^Totals are a minimum/);
  expect(amount.props.citation.originals).toEqual([
    expect.objectContaining({ url: 'https://transparency.aec.gov.au/' }),
  ]);
  expect(amount.props.citation.notes).toContain(
    'The party total covers all industries. The donors listed follow the industry filter.',
  );
  // Narrowed: the All years row states the full range.
  const allYears = r.root
    .findAllByType(ValueRow)
    .find((x) => x.props.testID === 'money-record-donations-all-years')!;
  expect(allYears.props.value).toMatch(/· \d{4}–\d{2} to \d{4}–\d{2}$/);
  expectOriginalsLast(r);
  expect(
    r.root.findAll((x) => x.props.testID === 'money-record-wikipedia'),
  ).toHaveLength(0);
  const flows = r.root
    .findAllByType(MoneyRow)
    .filter((x) => /^money-focus-flow-\d+$/.test(x.props.testID));
  expect(flows.length).toBeGreaterThan(0);
  // One number style down the list.
  expect(flows.every((x) => x.props.compact)).toBe(true);
  // The heading says what the figure counts: all receipts, not donations only.
  const section = r.root.find(
    (x) => x.props.testID === 'money-record-donations' && x.type === RN.View,
  );
  expect(
    section.findAll((x) => x.props.title === 'Money received').length,
  ).toBeGreaterThan(0);
  expect(
    section.findAll((x) => x.props.title === 'Donations to parties'),
  ).toHaveLength(0);
  expect(flows[0]!.props.href).toEqual(
    expect.objectContaining({
      pathname: '/money-record',
      params: expect.objectContaining({ from: '2024', to: '2024' }),
    }),
  );
  // The party's own page, named by the party.
  const profile = r.root
    .findAllByType(LinkRow)
    .find((x) => x.props.testID === 'money-native-profile')!;
  expect(profile.props.title).toBe('Labor');
  await act(async () => r.unmount());
});

test.each([
  [1, 'disclosure record'],
  [2, 'disclosure records'],
])(
  'a party with %i receipts uses the matching count noun',
  async (count, noun) => {
    jest.mocked(apiClient.get).mockImplementation(async (_path, decode) => ({
      data: decode({
        meta: { generated: '2026-11-10', coverage: '2024–25', source: 'AEC' },
        nodes: [
          {
            id: 'party:fixture',
            kind: 'party',
            label: 'Fixture Party',
            group: 'party',
            industry: 'party',
            total: 1000,
            count,
            firstYear: 2024,
            lastYear: 2024,
          },
        ],
        edges: [],
      }),
      stale: false,
      asOf: '2026-11-10',
      savedAt: 1,
    }));
    const r = await render({ node: 'party:fixture' });
    expect(figure(r, 'money-focus-amount').props.label).toBe(
      `in ${count} ${noun}, 2024–25`,
    );
    await act(async () => r.unmount());
  },
);

test('node=party:{name} accepts the party by any of its names', async () => {
  const r = await render({ node: 'party:Labor' });
  // The figure proves the node resolved.
  expect(figure(r, 'money-focus-amount')).toBeDefined();
  // All years by default: no separate All years row.
  expect(
    r.root
      .findAllByType(ValueRow)
      .some((x) => x.props.testID === 'money-record-donations-all-years'),
  ).toBe(false);
  await act(async () => r.unmount());
});

describe.each([
  ['party', { node: 'party:Labor' }, 'money-focus-amount'],
  [
    'donor',
    { node: raw.nodes.find((n) => n.kind === 'donor' && !n.withheld)!.id },
    'money-focus-amount',
  ],
  [
    'recipient',
    {
      rid: (
        pinned('/graph/grants.federal.json') as {
          recipients: { id: string; k: string }[];
        }
      ).recipients.find((r) => r.k === 'company')!.id,
      jur: 'federal',
    },
    'money-focus-grants',
  ],
] as const)('%s saved-copy state', (_name, params, figureID) => {
  test.each<[boolean, RecordResult<unknown>['staleReason'], number]>([
    [false, undefined, 0],
    [true, undefined, 1],
    [true, 'unavailable', 0],
    [true, 'unreadable', 0],
  ])(
    'stale=%s, reason=%s has %i offline lines',
    async (stale, staleReason, lines) => {
      jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
        data: decode(pinned(path)),
        stale,
        staleReason,
        asOf: '2026-11-10',
        savedAt: 1,
      }));
      const r = await render(params);
      expect(r.root.findAllByType(OfflineLine)).toHaveLength(lines);
      expect(figure(r, figureID).props.citation.savedAt).toBe(stale ? 1 : null);
      await act(async () => r.unmount());
    },
  );
});

test('a contracts hub states the mapped-donor scope and the contracts register', async () => {
  const hub = raw.nodes.find(
    (n) => n.kind === 'grantor' && n.flow === 'contracts',
  )!;
  const r = await render({ node: hub.id });
  const amount = figure(r, 'money-focus-amount');
  expect(amount.props.label).toMatch(/^in contracts to donors on the map, /);
  expect(amount.props.ink).toBeUndefined();
  expect(amount.props.caveat).toBe(contractsCaveat);
  expect(amount.props.citation.citation).toBe('AusTender');
  expect(amount.props.citation.licence).toBeNull();
  expect(amount.props.citation.notes).toContain(
    `${raw.meta.contracts_coverage}.`,
  );
  expectOriginalsLast(r);
  expect(
    r.root.findAll((x) => x.props.testID === 'money-record-wikipedia'),
  ).toHaveLength(0);
  await act(async () => r.unmount());
});

test('a grants hub puts originals after the grants and recipients', async () => {
  const hub = raw.nodes.find(
    (n) => n.kind === 'grantor' && n.flow !== 'contracts',
  )!;
  const r = await render({ node: hub.id });
  expectOriginalsLast(r);
  await act(async () => r.unmount());
});

test('a donor in three registers: side by side, never summed, under one caveat', async () => {
  const donor = raw.nodes.find(
    (n) => n.kind === 'donor' && n.grants && n.contracts && !n.withheld,
  )!;
  const r = await render({ node: donor.id });
  expect(
    r.root
      .findAllByType(Text)
      .find((x) => x.props.testID === 'money-record-both-caveat')!.props
      .children,
  ).toBe(bothRegistersCaveat);
  expect(bothRegistersCaveat).toBe(
    "Appearing in both registers doesn't show that one led to the other.",
  );
  const [donations, grants, contracts] = order(r, [
    'money-record-donations',
    'money-record-grants',
    'money-record-contracts',
  ]);
  expect(donations).toBeLessThan(grants!);
  expect(grants).toBeLessThan(contracts!);
  expectOriginalsLast(r);
  // One money-ink figure; public money in ink, each with its own caveat.
  expect(figure(r, 'money-focus-amount').props.ink).toBe('money');
  expect(figure(r, 'money-focus-grants').props.ink).toBeUndefined();
  expect(figure(r, 'money-focus-grants').props.caveat).toBe(grantsCaveat);
  expect(figure(r, 'money-focus-contracts').props.caveat).toBe(contractsCaveat);
  // No figure adds the registers together.
  const values = r.root.findAllByType(FigureBlock).map((x) => x.props.label);
  expect(
    values.some((label: string) =>
      /combined|in total|all registers/i.test(label),
    ),
  ).toBe(false);
  const originalsRows = r.root
    .findAllByType(LinkRow)
    .filter((x) => /^money-record-original-\d+$/.test(x.props.testID))
    .map((x) => x.props.title as string);
  expect(originalsRows.map((t) => t.split(' · ')[0])).toEqual([
    'AEC Transparency Register',
    'GrantConnect',
    'AusTender',
  ]);
  await act(async () => r.unmount());
});

test.each([
  ['Queensland Nickel Pty Ltd', []],
  ['Example Union', []],
  ['Example Association', []],
  ['Example Trust', []],
  ['CFMEU', []],
  ['Example', ['Example Holdings']],
])('an organisation donor %s has a Wikipedia action', async (name, aliases) => {
  const r = await renderDonor(name, aliases);
  const row = r.root
    .findAllByType(LinkRow)
    .find((x) => x.props.testID === 'money-record-wikipedia')!;
  expect(row).toBeDefined();
  expect(row.props.title).toBe('Find on Wikipedia');
  const action = row
    .findAll((x) => x.props.accessibilityRole === 'link' && x.props.onPress)
    .at(-1)!;
  expect(action.props.accessibilityRole).toBe('link');
  expect(action.props.accessibilityLabel).toBe(`Find ${name} on Wikipedia`);
  expect(action.props.accessibilityHint).toBe('Opens in the browser');
  expect(
    row.findAllByType(Icon).some((x) => x.props.name === symbols.external),
  ).toBe(true);
  expectOriginalsLast(r);
  const more = r.root.findAll(
    (x) => x.props.testID === 'money-record-more',
  )[0]!;
  expect(more.findAllByType(LinkRow)).toContain(row);
  expect(more.findAllByProps({ testID: 'money-record-search' })).toHaveLength(
    0,
  );
  await act(async () => r.unmount());
});

test('the Wikipedia action encodes the donor name and opens the in-app browser', async () => {
  const browser = jest
    .spyOn(WebBrowser, 'openBrowserAsync')
    .mockResolvedValue({ type: WebBrowser.WebBrowserResultType.CANCEL });
  const r = await renderDonor('Müller & Co / Research? #1 Pty Ltd');
  const row = r.root
    .findAllByType(LinkRow)
    .find((x) => x.props.testID === 'money-record-wikipedia')!;
  const url =
    'https://en.wikipedia.org/w/index.php?search=M%C3%BCller%20%26%20Co%20%2F%20Research%3F%20%231%20Pty%20Ltd';
  expect(row.props.external.url).toBe(url);
  await act(async () =>
    row
      .findAll(
        (x) => x.props.testID === 'money-record-wikipedia' && x.props.onPress,
      )
      .at(-1)!
      .props.onPress(),
  );
  expect(browser).toHaveBeenCalledWith(
    url,
    expect.objectContaining({
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    }),
  );
  await act(async () => r.unmount());
});

test('an individual donor has no Wikipedia action', async () => {
  const r = await renderDonor('Alex Example');
  expect(
    r.root.findAll((x) => x.props.testID === 'money-record-wikipedia'),
  ).toHaveLength(0);
  expect(figure(r, 'money-focus-amount')).toBeDefined();
  expect(
    r.root.findAll((x) => x.props.testID === 'money-withheld-note'),
  ).not.toHaveLength(0);
  await act(async () => r.unmount());
});

test('the individual donors aggregate has no originals, no share and the privacy note', async () => {
  const withheld = raw.nodes.find((n) => n.withheld);
  if (!withheld) return;
  const r = await render({ node: withheld.id });
  expect(
    r.root
      .findAllByType(Text)
      .find((x) => x.props.testID === 'money-withheld-note')!.props.children,
  ).toBe(individualsNote);
  expect(
    r.root.findAll((x) => x.props.testID === 'money-record-originals'),
  ).toHaveLength(0);
  expect(mockOptions.unstable_headerRightItems).toBeUndefined();
  expect(
    r.root.findAll((x) => x.props.testID === 'money-record-wikipedia'),
  ).toHaveLength(0);
  await act(async () => r.unmount());
});

test('a node outside a narrowed window offers all years', async () => {
  const r = await render({
    node: 'donor:not-a-real-donor',
    name: 'Example Pty Ltd',
    from: '2024',
    to: '2024',
  });
  const missing = r.root.findByType(ContentUnavailable);
  expect(missing.props.testID).toBe('money-node-missing');
  expect(missing.props.title).toBe(
    'Example Pty Ltd isn’t on the map in this view',
  );
  await act(async () => missing.props.action.onPress());
  expect(mockNavigation.setParams).toHaveBeenCalledWith(
    expect.objectContaining({ from: undefined, to: undefined }),
  );
  await act(async () => r.unmount());
});

test('a grant recipient by rid: its grants from the index, an award is not a payment', async () => {
  const index = pinned('/graph/grants.federal.json') as {
    recipients: { id: string; n: string; k: string; c: number }[];
  };
  const recipient = index.recipients.find(
    (x) => x.id.startsWith('abn:') && x.k === 'company' && x.c > 1,
  )!;
  const r = await render({ rid: recipient.id, jur: 'federal' });
  const grants = figure(r, 'money-focus-grants');
  expect(grants.props.caveat).toBe(grantsCaveat);
  expect(grants.props.label).toMatch(/^in [\d,]+ grants, /);
  expect(grants.props.citation.citation).toBe('GrantConnect');
  expectOriginalsLast(r);
  await act(async () => r.unmount());
});

test('an unknown recipient is plainly not in the records', async () => {
  const r = await render({ rid: 'abn:00000000000', name: 'Nobody Pty Ltd' });
  const missing = r.root.findByType(ContentUnavailable);
  expect(missing.props.title).toBe('Not in the latest grant records');
  await act(async () => r.unmount());
});

test('a supplier through its agency: contract rows push money-item without "Open {organisation}"', async () => {
  const agency = pinned('/agencies/a-aaa167b0097858604254.json') as {
    id: string;
    contracts: { supplier_id: string }[];
    suppliers: { id: string; name: string; count: number }[];
  };
  const supplier = agency.suppliers.find((s) =>
    agency.contracts.some((c) => c.supplier_id === s.id),
  )!;
  const r = await render({ rid: supplier.id, agency: agency.id });
  const contracts = figure(r, 'money-focus-contracts');
  expect(contracts.props.caveat).toBe(contractsCaveat);
  const rows = r.root
    .findAllByType(MoneyRow)
    .filter((x) => /^money-record-contract-\d+$/.test(x.props.testID));
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]!.props.href).toEqual(
    expect.objectContaining({
      pathname: '/money-item',
      params: expect.objectContaining({
        kind: 'contract',
        agency: agency.id,
        org: 'self',
      }),
    }),
  );
  // Its agency opens the native agency page with the contracts symbol.
  const agencyRow = r.root
    .findAllByType(LinkRow)
    .find((x) => x.props.testID === 'money-record-agency')!;
  expect(agencyRow.props.symbol).toBe('building.2');
  expect(agencyRow.props.href).toEqual(
    agencyRoute(agency.id, agencyRow.props.title),
  );
  expectOriginalsLast(r);
  await act(async () => r.unmount());
}, 30000);

test('a recipient that also donates opens the donor’s own money record', async () => {
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const index = pinned('/graph/grants.federal.json') as {
    recipients: { id: string; n: string; k: string; c: number }[];
  };
  const recipient = index.recipients.find((x) =>
    donorNodeFor({ rid: x.id, name: x.n }, graph),
  )!;
  expect(recipient).toBeDefined();
  rememberMoneyGraph('federal', graph);
  const donor = donorNodeFor({ rid: recipient.id, name: recipient.n }, graph)!;
  const r = await render({ rid: recipient.id, jur: 'federal' });
  const row = r.root
    .findAllByType(LinkRow)
    .find((x) => x.props.testID === 'money-record-donor')!;
  expect(row.props.href).toEqual(
    moneyRecordRoute({ node: donor.id }, donor.label),
  );
  expect(row.props.href.params).not.toHaveProperty('from');
  await act(async () => r.unmount());
}, 30000);

test('a supplier without its agency cannot be found yet', async () => {
  const r = await render({ rid: 's-ac33b42b752ee1356654', name: 'Example' });
  expect(r.root.findByType(ContentUnavailable).props.title).toBe(
    'Not in the latest contract records',
  );
  await act(async () => r.unmount());
});

test('"Open in the money map" shows only when the reader did not come from the map', async () => {
  const has = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAllByType(LinkRow)
      .some((x) => x.props.testID === 'money-record-map');
  let r = await render({ node: 'party:Labor' });
  expect(has(r)).toBe(true);
  await act(async () => r.unmount());
  r = await render({ node: 'party:Labor', via: 'map' });
  expect(has(r)).toBe(false);
  // A record pushed from this one keeps the way it arrived.
  const flow = r.root
    .findAllByType(MoneyRow)
    .find((x) => x.props.testID === 'money-focus-flow-0')!;
  expect(flow.props.href.params.via).toBe('map');
  await act(async () => r.unmount());
  r = await render({ node: 'party:Labor' });
  const other = r.root
    .findAllByType(MoneyRow)
    .find((x) => x.props.testID === 'money-focus-flow-0')!;
  expect(other.props.href.params.via).toBeUndefined();
  await act(async () => r.unmount());
});
