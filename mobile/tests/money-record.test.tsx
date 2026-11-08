import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { apiClient } from '../src/api/runtime';
import MoneyRecordScreen, {
  contractsCaveat,
  grantsCaveat,
  individualsNote,
} from '../src/features/money/MoneyRecord';
import { bothRegistersCaveat } from '../src/features/money/records';
import { forgetMoneyGraphs } from '../src/features/money/lookup';
import {
  ContentUnavailable,
  FigureBlock,
  LinkRow,
  MoneyRow,
  Text,
  ValueRow,
} from '../src/design/primitives';
import { pinned } from './pinned';

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

test('a party record: originals first, the window figure, all years beside it, and donors that push their records', async () => {
  const r = await render({
    node: 'party:Labor',
    from: '2024',
    to: '2024',
    industry: 'unions',
    layers: 'donations',
  });
  const amount = figure(r, 'money-focus-amount');
  expect(amount.props.ink).toBe('money');
  expect(amount.props.label).toMatch(/^in [\d,]+ receipts, 2024–25$/);
  expect(amount.props.caveat).toMatch(/^Totals are a minimum/);
  expect(amount.props.source.originals).toEqual([
    expect.objectContaining({ url: 'https://transparency.aec.gov.au/' }),
  ]);
  expect(amount.props.source.notes).toContain(
    'The party total covers all industries. The donors listed follow the industry filter.',
  );
  // Narrowed: the All years row states the full range.
  const allYears = r.root
    .findAllByType(ValueRow)
    .find((x) => x.props.testID === 'money-record-donations-all-years')!;
  expect(allYears.props.value).toMatch(/· \d{4}–\d{2} to \d{4}–\d{2}$/);
  const [originals, donations] = order(r, [
    'money-record-originals',
    'money-record-donations',
  ]);
  expect(originals).toBeGreaterThan(-1);
  expect(originals).toBeLessThan(donations!);
  const flows = r.root
    .findAllByType(MoneyRow)
    .filter((x) => /^money-focus-flow-\d+$/.test(x.props.testID));
  expect(flows.length).toBeGreaterThan(0);
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

test('a contracts hub states the mapped-donor scope and the contracts register', async () => {
  const hub = raw.nodes.find(
    (n) => n.kind === 'grantor' && n.flow === 'contracts',
  )!;
  const r = await render({ node: hub.id });
  const amount = figure(r, 'money-focus-amount');
  expect(amount.props.label).toMatch(/^in contracts to donors on the map, /);
  expect(amount.props.ink).toBeUndefined();
  expect(amount.props.caveat).toBe(contractsCaveat);
  expect(amount.props.source.citation).toBe('AusTender');
  expect(amount.props.source.licence).toBeNull();
  expect(amount.props.source.notes).toContain(
    `${raw.meta.contracts_coverage}.`,
  );
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
  const [originals, donations, grants, contracts] = order(r, [
    'money-record-originals',
    'money-record-donations',
    'money-record-grants',
    'money-record-contracts',
  ]);
  expect(originals).toBeLessThan(donations!);
  expect(donations).toBeLessThan(grants!);
  expect(grants).toBeLessThan(contracts!);
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
  expect(grants.props.source.citation).toBe('GrantConnect');
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
  await act(async () => r.unmount());
}, 30000);

test('a supplier without its agency cannot be found yet', async () => {
  const r = await render({ rid: 's-ac33b42b752ee1356654', name: 'Example' });
  expect(r.root.findByType(ContentUnavailable).props.title).toBe(
    'Not in the latest contract records',
  );
  await act(async () => r.unmount());
});
