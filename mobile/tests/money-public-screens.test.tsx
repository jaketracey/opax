import { measureBarTitle } from './bar-title-metrics';
import { SkeletonCrossfade } from '../src/design/states';
import { act } from 'react';
import { Heading } from '../src/design/text';
import TestRenderer from 'react-test-renderer';
import { Redirect } from 'expo-router';
import { Animated, Dimensions, Platform, StyleSheet } from 'react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import { ApiError } from '../src/api/errors';
import type { ApiClient, RecordResult } from '../src/api/client';
import { assertAllowedPath } from '../src/api/policy';
import { decodeDiscovery } from '../src/api/catalog-decoders';
import { catalogs } from '../src/api/runtime';
import { money } from '../src/features/money-public/runtime';
import Hub from '../src/features/money-public/Hub';
import { grantsFigure } from '../src/features/money-public/HubCards';
import Grants from '../src/features/money-public/Grants';
import Program from '../src/features/money-public/Program';
import Largest from '../src/features/money-public/Largest';
import Agencies, { Agency } from '../src/features/money-public/Agencies';
import MoneyRecord from '../src/features/money/MoneyRecord';
import Allocation from '../src/features/money-public/Allocation';
import FundingBySeatType from '../src/features/money-public/FundingBySeatType';
import Connections from '../src/features/money-public/Connections';
import Connection from '../src/features/money-public/Connection';
import MoneyItem, {
  loadMoneyItem,
} from '../src/features/money-public/MoneyItem';
import { leadsFor, plainCaveat } from '../src/features/leads/model';
import { evidenceRecord } from '../src/features/leads/evidence';
import { RouteOptions } from '../src/navigation/preview';
import { publicMoneyScreens } from '../src/navigation/stack/public-money';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { unnamedRecipient } from '../src/features/money-public/privacy';
import { organisationHref } from '../src/features/money-public/routes';
import { LinkRow, MoneyRow, ValueRow } from '../src/design/rows';
import { Screen as PageScreen } from '../src/design/layout';
import { MoneyList, MoneyStatus } from '../src/features/money-public/parts';
import { FigureBlock } from '../src/design/record';
import { BarTitle } from '../src/navigation/useTitleOnScroll';
import {
  decodeGrantIndex,
  decodeProgram,
} from '../src/features/money-public/data';
import {
  agencyRoute,
  grantProgramRoute,
} from '../src/navigation/routes/public-money';
import {
  formatCount,
  formatMoney,
  formatMoneyCompact,
} from '../src/design/format';
import { decodeSeatGrants } from '../src/features/money-public/seat-grants-data';
import seatIndexFixture from './fixtures/money/seat-index.json';
import seatFirstFixture from './fixtures/money/seat-maribyrnong.json';
import seatSecondFixture from './fixtures/money/seat-maribyrnong-2.json';

const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const Wrap = (props: object) => React.createElement(View, props);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    Redirect: () => null,
    useRouter: () => ({ push: jest.fn() }),
    useNavigation: () => ({ setParams: jest.fn() }),
    useSegments: () => [],
    useLocalSearchParams: () => mockParams,
    router: { push: jest.fn(), setParams: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
  };
});
jest.mock('@shopify/react-native-skia', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Canvas: require('react-native').View,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { discovery: jest.fn(), directory: jest.fn() },
  apiClient: { get: jest.fn() },
}));
jest.mock('../src/features/money-public/runtime', () => ({ money: {} }));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
const raw = (path: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../portal/public' + path), 'utf8'),
  );
const calls: string[] = [];
const client: Pick<ApiClient, 'get'> = {
  async get<T>(
    path: string,
    decode: (v: unknown) => T,
  ): Promise<RecordResult<T>> {
    assertAllowedPath(path);
    calls.push(path);
    return { data: decode(raw(path)), stale: false, savedAt: 10, asOf: null };
  },
};
const fixture = new MoneyCatalogs(client);
const runtime = jest.requireMock('../src/api/runtime');
beforeEach(() => {
  calls.length = 0;
  Object.keys(mockParams).forEach((k) => delete mockParams[k]);
  for (const name of [
    'grants',
    'notes',
    'program',
    'seat',
    'largest',
    'agencies',
    'agency',
    'report',
    'allocation',
    'history',
    'locations',
    'connections',
    'evidence',
  ] as const)
    money[name] = fixture[name].bind(fixture) as never;
  (catalogs.discovery as jest.Mock).mockImplementation(() =>
    client.get('/discovery.json', decodeDiscovery),
  );
  (catalogs.directory as jest.Mock).mockRejectedValue(new Error('offline'));
  runtime.apiClient.get.mockImplementation(client.get);
});

const agencyId = 'a-7431f054588d4251c0b4';
const connectionId = () =>
  (raw('/evidence/index.json').entities as { id: string }[])[0]!.id;
const program = raw('/grants/federal/programs/go3141.json');

test('a grant program fact opens that program using its decoded id', async () => {
  const params = {
    kind: 'grant' as const,
    jur: 'federal',
    program: 'go3141',
    id: program.grants[0].id,
  };
  const data = (await loadMoneyItem(params, false)).data;
  const expected = grantProgramRoute(
    program.id,
    'federal',
    data.facts.find((f) => f.label === 'Program')!.value,
  );
  expect(data.facts.find((f) => f.label === 'Program')?.href).toEqual(expected);
  Object.assign(mockParams, params);
  const view = await mount(MoneyItem);
  expect(view.root.findByType(SkeletonCrossfade).props).toMatchObject({
    loading: false,
    ready: true,
    sectioned: true,
  });
  expect(
    view.root
      .findAllByType(ValueRow)
      .find((node) => node.props.label === 'Program')?.props.href,
  ).toEqual(expected);
});

test('a contract agency fact opens its actual agency id', async () => {
  const record = await fixture.agency(agencyId);
  const contract = record.data.profile.contracts[0]!;
  const params = {
    kind: 'contract' as const,
    agency: agencyId,
    id: contract.id,
  };
  const data = (await loadMoneyItem(params, false)).data;
  const expected = agencyRoute(agencyId, record.data.profile.name);
  expect(data.facts.find((f) => f.label === 'Agency')?.href).toEqual(expected);
  Object.assign(mockParams, params);
  const view = await mount(MoneyItem);
  expect(
    view.root
      .findAllByType(ValueRow)
      .find((node) => node.props.label === 'Agency')?.props.href,
  ).toEqual(expected);
});

test('largest-grant program facts link only when the grants index resolves the published name', async () => {
  const largest = await fixture.largest();
  const index = await fixture.grants('federal');
  for (const award of largest.data.months[largest.data.latest] ?? []) {
    const data = (
      await loadMoneyItem(
        { kind: 'largest', month: largest.data.latest, id: award.id },
        false,
      )
    ).data;
    const program = index.data.programs.find(
      (p) => p.listedAs === award.program,
    );
    expect(data.facts.find((f) => f.label === 'Program')?.href).toEqual(
      program
        ? grantProgramRoute(program.id, 'federal', program.name)
        : undefined,
    );
  }
});

async function mount(Screen: () => React.ReactElement | null) {
  let rendered!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    rendered = TestRenderer.create(<Screen />);
  });
  // Let chained catalog reads settle.
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  return rendered;
}
const ids = (r: TestRenderer.ReactTestRenderer) =>
  new Set(
    r.root
      .findAll((n) => typeof n.props.testID === 'string')
      .map((n) => n.props.testID as string),
  );

async function supplierAgencyFixture() {
  const record = await fixture.agency('a-aaa167b0097858604254');
  const suppliers = record.data.profile.suppliers
    .filter((supplier) => supplier.organisation)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  const supplierIds = new Set(suppliers.map((supplier) => supplier.id));
  const result = {
    ...record,
    data: {
      ...record.data,
      profile: {
        ...record.data.profile,
        suppliers,
        contracts: record.data.profile.contracts.filter((contract) =>
          supplierIds.has(contract.supplierId),
        ),
      },
    },
  };
  money.agency = jest.fn(async () => result);
  return result;
}

test('every supplier row in a fixture agency profile opens its supplier record', async () => {
  const record = await supplierAgencyFixture();
  const { profile } = record.data;
  expect(profile.suppliers[0]!.name).toBe(
    'FMS Account Reserve Bank of Australia',
  );
  Object.assign(mockParams, { id: profile.id, section: 'suppliers' });
  const agency = await mount(Agency);
  const list = agency.root.findByType(MoneyList);
  const routes = profile.suppliers.map((supplier, index) => {
    const row = list.props.render(list.props.rows[index], index);
    expect(row.props.name).toBe(supplier.name);
    expect(row.props.amount).toBe(supplier.total);
    expect(row.props.href.params).toMatchObject({
      rid: supplier.id,
      agency: profile.id,
    });
    return row.props.href;
  });
  await act(async () => agency.unmount());
  for (const [index, route] of routes.entries()) {
    Object.keys(mockParams).forEach((key) => delete mockParams[key]);
    Object.assign(mockParams, route.params);
    const supplier = await mount(MoneyRecord);
    expect(ids(supplier)).not.toContain('money-node-missing');
    expect(ids(supplier)).toContain('money-focus-contracts');
    expect(
      supplier.root
        .findAllByType(FigureBlock)
        .find((figure) => figure.props.testID === 'money-focus-contracts')!
        .props.label,
    ).toContain(profile.suppliers[index]!.count.toLocaleString('en-AU'));
    await act(async () => supplier.unmount());
  }
});

test('a supplier without a record opens only its agency contracts, with a way to clear the filter', async () => {
  const record = await supplierAgencyFixture();
  const { profile } = record.data;
  const supplier = profile.suppliers[0]!;
  const own = profile.contracts.filter((c) => c.supplierId === supplier.id);
  const other = profile.contracts.find((c) => c.supplierId !== supplier.id)!;
  const contracts = [
    { ...own[0]!, supplier: 'Former supplier name' },
    { ...own[1]!, supplierId: '' },
    { ...other, supplier: supplier.name },
  ];
  money.agency = jest.fn(async () => ({
    ...record,
    data: {
      ...record.data,
      profile: {
        ...profile,
        suppliers: profile.suppliers.filter((s) => s.id !== supplier.id),
        contracts,
      },
    },
  }));
  Object.assign(mockParams, {
    rid: supplier.id,
    name: supplier.name,
    agency: profile.id,
  });
  const missing = await mount(MoneyRecord);
  expect(ids(missing)).not.toContain('money-node-missing');
  const destination = missing.root.findByType(Redirect).props.href;
  expect(destination).toMatchObject({
    pathname: '/agency',
    params: {
      id: profile.id,
      section: 'contracts',
      supplier: supplier.id,
      supplierName: supplier.name,
    },
  });
  await act(async () => missing.unmount());
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  Object.assign(mockParams, destination.params);
  const agency = await mount(Agency);
  const rows = () => agency.root.findByType(MoneyList).props.rows;
  expect(
    rows()
      .map((c: { id: string }) => c.id)
      .sort(),
  ).toEqual([own[0]!.id, own[1]!.id].sort());
  const clear = agency.root
    .findAllByType(LinkRow)
    .find((row) => row.props.testID === 'agency-clear-supplier')!;
  await act(async () => clear.props.onPress());
  expect(rows()).toHaveLength(contracts.length);
  await act(async () => agency.unmount());
});

test.each([
  ['latest', 'No grant agreements to show.'],
  ['2026-00', 'No grant agreements to show.'],
  ['2026-13', 'No grant agreements to show.'],
  ['2026-1', 'No grant agreements to show.'],
  ['2026-10', 'No grant agreements started in October 2026.'],
])(
  'Largest grants has a complete empty-state title for latest=%s',
  async (latest, title) => {
    money.largest = jest.fn(async () => ({
      data: { asOf: '2026-11-10', latest, basis: [], months: {} },
      stale: false,
      savedAt: 10,
      asOf: null,
    }));
    const r = await mount(Largest);
    expect(r.root.findByType(MoneyList).props.empty.props.title).toBe(title);
    await act(async () => r.unmount());
  },
);

test('the all-years grant figure names the full recorded range, including future agreements', () => {
  const index = decodeGrantIndex(raw('/graph/grants.federal.json'));
  index.meta.years = ['2023-24', '2024-25', '2026-27'];
  index.meta.latestCompleteYear = '2024-25';
  index.byYear = { '2024-25': { total: 20, count: 2 } };
  index.counts.dollars = 60;
  expect(grantsFigure(index)).toMatchObject({
    value: 20,
    line: 'in 2 Commonwealth grants in 2024–25',
    allYears: { label: 'All years, 2023–24 to 2026–27', value: 60 },
  });
});

test.each([
  [
    'grant',
    {
      kind: 'grant',
      jur: 'federal',
      program: 'go3141',
      id: program.grants[0].id,
    },
  ],
  [
    'recipient',
    {
      kind: 'recipient',
      jur: 'federal',
      program: 'go3141',
      recipient: program.grants[0].rid,
    },
  ],
  ['award', { kind: 'award', id: raw('/research/mlci.json').awards[0].ga_id }],
] as const)(
  '%s details distinguish award values from payments',
  async (_name, params) => {
    const item = (await loadMoneyItem(params, false)).data;
    expect(item.notes.join(' ')).toMatch(
      /award value.*not payments|award values.*not amounts paid/i,
    );
  },
);

test('program sources retain the source caveats and explain award values', async () => {
  Object.assign(mockParams, { jur: 'federal', id: 'GO3141' });
  const rendered = await mount(Program);
  const source = rendered.root.findByType(FigureBlock).props.citation;
  expect(source.notes).toEqual(
    expect.arrayContaining(
      decodeGrantIndex(raw('/graph/grants.federal.json')).meta.caveats,
    ),
  );
  expect(source.notes.join(' ')).toMatch(
    /award value.*not payments|award values.*not amounts paid/i,
  );
});

test('Queensland expenditure records do not acquire a federal award-value caveat', async () => {
  const index = raw('/graph/grants.qld.json');
  const entry = index.programs[0];
  const first = raw(`/grants/qld/programs/${entry.key}.json`).grants[0];
  const item = (
    await loadMoneyItem(
      {
        kind: 'grant',
        jur: 'qld',
        program: entry.key,
        id: first.id,
      },
      false,
    )
  ).data;
  expect(item.notes.join(' ')).not.toMatch(/award values.*not amounts paid/i);
});

test('a venue overlay cannot re-identify an individual recipient in community funding or its record', async () => {
  const allocation = await fixture.allocation();
  const privateAward = {
    ...allocation.data.awards[0]!,
    title: 'Grant project',
    recipient: unnamedRecipient,
  };
  money.allocation = jest.fn().mockResolvedValue({
    ...allocation,
    data: { ...allocation.data, awards: [privateAward] },
  });
  money.locations = jest.fn().mockResolvedValue({
    stale: false,
    savedAt: 10,
    asOf: null,
    data: {
      asOf: allocation.data.asOf,
      methodology: [],
      records: [
        {
          id: privateAward.id,
          kind: 'award',
          verified: true,
          title: 'Fixture Private Recipient venue',
          sites: [
            {
              name: 'Fixture Private Recipient site',
              address: '1 Fixture Street',
              verified: true,
              sourceUrl: 'https://example.org/fixture',
            },
          ],
        },
      ],
    },
  });
  const record = await loadMoneyItem(
    { kind: 'award', id: privateAward.id },
    false,
  );
  expect(record.data.name).toBe('Grant project');
  expect(record.data.facts.some((fact) => fact.label === 'Sites')).toBe(false);
  const rendered = await mount(Allocation);
  const list = rendered.root.findByType(MoneyList);
  const row = list.props.render(list.props.rows[0], 0);
  expect(row.props.name).toBe('Grant project');
  expect(JSON.stringify(record.data)).not.toContain(
    'Fixture Private Recipient',
  );
});

test.each([
  [
    'Program',
    Program,
    { jur: 'federal', id: 'GO3141' },
    'program-total',
    'grants',
  ],
  ['Agency', Agency, { id: agencyId }, 'agency-total', 'agency'],
  [
    'Money item',
    MoneyItem,
    {
      kind: 'grant',
      jur: 'federal',
      program: 'go3141',
      id: program.grants[0].id,
    },
    'money-item-amount',
    'program',
  ],
] as const)(
  '%s clears the previous record while another identity loads or fails',
  async (_name, Page, params, oldFigure, loader) => {
    Object.assign(mockParams, params);
    const rendered = await mount(Page);
    expect(ids(rendered).has(oldFigure)).toBe(true);
    let reject!: (error: Error) => void;
    money[loader] = jest.fn(
      () => new Promise((_resolve, fail) => (reject = fail)),
    ) as never;
    mockParams.id = 'fixture-missing-record';
    await act(async () => rendered.update(<Page />));
    expect(ids(rendered).has(oldFigure)).toBe(false);
    await act(async () =>
      reject(new Error('Fixture record could not be loaded')),
    );
    expect(ids(rendered).has(oldFigure)).toBe(false);
    expect(
      rendered.root.findAllByType(MoneyStatus)[0]!.props.status.error,
    ).toBeInstanceOf(Error);
  },
);

test('a lead example names its back destination and has no lead methodology in Notes', async () => {
  const lead = leadsFor(decodeDiscovery(raw('/discovery.json'))).find(
    (lead) => lead.caveats.length && lead.evidence.some(evidenceRecord),
  )!;
  const params = {
    kind: 'evidence' as const,
    lead: lead.id,
    i: String(lead.evidence.findIndex((item) => !!evidenceRecord(item))),
  };
  Object.assign(mockParams, params);
  const record = await loadMoneyItem(params, false);
  // The evidence export has no record notes. Caveats belong to the lead.
  expect(record.data.notes).toEqual([]);
  const route = { key: 'item', name: 'money-item' };
  const navigation = {
    getState: () => ({
      routes: [
        { key: 'today', name: 'index' },
        { key: 'lead', name: 'lead/[id]' },
        route,
      ],
    }),
    setOptions: jest.fn(),
    isFocused: () => true,
    addListener: () => () => {},
  };
  const r = await mount(() => (
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={route}>
        <MoneyItem />
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>
  ));
  const registration = publicMoneyScreens().find(
    (screen) => screen.props.name === 'money-item',
  )!;
  expect(registration.props.options({ route, navigation })).toMatchObject({
    headerBackTitle: 'Back',
    headerBackButtonDisplayMode: 'default',
    headerBackButtonMenuEnabled: true,
  });
  expect(r.root.findByType(RouteOptions).props.options).not.toHaveProperty(
    'headerBackTitle',
  );
  const shown = r.root
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children);
  expect(shown).not.toContain('Notes');
  for (const caveat of lead.caveats)
    expect(shown).not.toContain(plainCaveat(caveat));
  await act(async () => r.unmount());
});

test.each([
  ['Public money', Hub, {}, 'money-hub-title'],
  ['Grants', Grants, { jur: 'federal' }, 'grants-total'],
  ['Program', Program, { jur: 'federal', id: 'GO3141' }, 'program-title'],
  ['Largest', Largest, {}, 'largest-title'],
  ['Agencies', Agencies, {}, 'agencies-total'],
  ['Agency', Agency, { id: agencyId }, 'agency-total'],
  ['Community funding', Allocation, {}, 'allocation-figure'],
  ['Funding by seat type', FundingBySeatType, {}, 'seat-type-0'],
  ['Programs and places', Connections, {}, 'connections-caption'],
  [
    'Connection',
    Connection,
    () => ({ id: connectionId() }),
    'connection-title',
  ],
  [
    'Money item',
    MoneyItem,
    () => ({
      kind: 'grant',
      jur: 'federal',
      program: program.key,
      id: program.grants[0].id,
    }),
    'money-item-title',
  ],
] as const)(
  '%s mounts with only static catalog calls and no paid request',
  async (_name, Screen, params, loaded) => {
    Object.assign(mockParams, typeof params === 'function' ? params() : params);
    const rendered = await mount(Screen as () => React.ReactElement);
    expect(calls.every((path) => !path.startsWith('/api/'))).toBe(true);
    expect(rendered.toJSON()).not.toBeNull();
    if (loaded) expect(ids(rendered)).toContain(loaded);
    await act(async () => rendered.unmount());
  },
);

test.each([
  [
    'Program',
    Program,
    { jur: 'federal', id: 'GO3141' },
    'grant-program',
    'grants',
  ],
  ['Agency', Agency, { id: agencyId }, 'agency', 'agencies'],
] as const)(
  '%s reveals from its retained native heading, including a partly hidden heading',
  async (_label, Page, params, name, previous) => {
    Object.assign(mockParams, params);
    const route = { key: 'subject', name };
    const options: Record<string, unknown> = {};
    const navigation = {
      getState: () => ({
        routes: [{ key: 'previous', name: previous }, route],
      }),
      setOptions: jest.fn((next) => Object.assign(options, next)),
      isFocused: () => true,
      addListener: () => () => {},
    };
    const registration = publicMoneyScreens().find(
      (screen) => screen.props.name === name,
    )!;
    Object.assign(options, registration.props.options({ route, navigation }));
    const rendered = await mount(() => (
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <HeaderHeightContext.Provider value={100}>
            <Page />
          </HeaderHeightContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    ));
    const list = rendered.root.findByType(MoneyList);
    const heading = list.props.header.props.children[0];
    const pending: ((...values: number[]) => void)[] = [];
    const measure = jest.fn((done) => pending.push(done));
    heading.props.ref.current = { measure };
    const inline = () => (options.headerTitle as () => React.ReactElement)();
    expect(inline().type).toBe(BarTitle);
    expect(inline().props.shown).toBe(false);
    expect(heading.props.collapsable).toBe(false);
    if (name === 'grant-program') {
      expect(options.headerBackTitle).toBe('Grants');
      expect(options.headerBackButtonMenuEnabled).toBe(true);
      expect(inline().props.backTitle).toBe('Grants');
      expect(inline().props.trailing).toBe(1);
      expect(options.headerSearchBarOptions).toMatchObject({
        placement: 'integratedButton',
        allowToolbarIntegration: false,
      });
      const items = (
        options.unstable_headerRightItems as () => {
          label: string;
          menu?: { items: { label: string }[] };
        }[]
      )();
      expect(items).toHaveLength(1);
      expect(items[0]!.label).toBe('More');
      expect(items[0]!.menu!.items.map((item) => item.label)).toContain(
        'Share',
      );
    }
    act(() =>
      heading.props.onLayout({
        nativeEvent: { layout: { y: 0, height: 120 } },
      }),
    );
    expect(measure).not.toHaveBeenCalled();
    const scroll = (y: number, pageY: number) =>
      act(async () => {
        list.props.onScroll({ nativeEvent: { contentOffset: { y } } });
        await Promise.resolve();
        pending.shift()!(0, 0, 300, 120, 0, pageY);
      });
    await scroll(9000, 140);
    expect(inline().props.shown).toBe(false);
    await scroll(-900, 40);
    expect(inline().props.shown).toBe(true);
    await scroll(9000, 140);
    expect(inline().props.shown).toBe(false);
    await act(async () => rendered.unmount());
  },
);

test('Agencies titles itself in the page, as its sibling pages do, with stacked search', async () => {
  const rendered = await mount(Agencies);
  const options = rendered.root.findByType(RouteOptions).props.options;
  expect(options).toMatchObject({
    title: 'Government agencies',
    headerSearchBarOptions: { placement: 'stacked' },
  });
  // A system large title cut "Commonwealth grants" at AX3 (sweep 2 item 11).
  expect(options).not.toHaveProperty('headerLargeTitleEnabled');
  expect(options).not.toHaveProperty('headerTitle');
  const list = rendered.root.findByType(MoneyList);
  expect(typeof list.props.onScroll).toBe('function');
  const anchor = list.props.header.props.children[0];
  expect(anchor.props.children.type).toBe(Heading);
  expect(anchor.props.children.props).toMatchObject({
    level: 1,
    kind: 'page',
    testID: 'agencies-title',
    children: 'Government agencies',
  });
  await act(async () => rendered.unmount());
});

test('Program has a search button at rest that filters and restores its recipients', async () => {
  Object.assign(mockParams, { jur: 'federal', id: 'GO3141' });
  const rendered = await mount(Program);
  const options = () => rendered.root.findByType(RouteOptions).props.options;
  const list = () => rendered.root.findByType(MoneyList);
  const search = options().headerSearchBarOptions;
  expect(search).toMatchObject({
    placement: 'integratedButton',
    allowToolbarIntegration: false,
    placeholder: 'Recipients',
  });
  const heading = list().props.header.props.children[0].props.children;
  expect(heading.props.children).toBe(decodeProgram(program).name);
  expect(heading.props.numberOfLines).toBeUndefined();
  const count = list().props.rows.length;
  expect(count).toBeGreaterThan(0);
  await act(async () => search.onChangeText({ nativeEvent: { text: 'zzzz' } }));
  expect(list().props.rows).toHaveLength(0);
  await act(async () => search.onCancelButtonPress());
  expect(list().props.rows).toHaveLength(count);
  const items = options().unstable_headerRightItems();
  const share = items[0].menu.items.find(
    (item: { label: string }) => item.label === 'Share',
  );
  expect(typeof share.onPress).toBe('function');
  await act(async () => rendered.unmount());
});

test.each([
  ['Grants', Grants, 'grants', 'Commonwealth grants'],
  ['Agencies', Agencies, 'agencies', 'Government agencies'],
] as const)(
  '%s keeps its collapsed title and leaves back names in the stack registration',
  async (_label, Page, name, title) => {
    const original = Platform.OS;
    for (const [os, previous, backTitle] of [
      ['ios', 'index', 'Today'],
      ['ios', 'public-money', 'Public money'],
      ['ios', 'person/[slug]', 'Back'],
      ['android', 'index', undefined],
    ] as const) {
      let rendered: TestRenderer.ReactTestRenderer | undefined;
      try {
        Platform.OS = os;
        const route = { key: 'subject', name };
        const navigation = {
          getState: () => ({
            index: 1,
            routes: [{ key: 'previous', name: previous }, route],
          }),
          setOptions: jest.fn(),
          isFocused: () => true,
          addListener: () => () => {},
        };
        rendered = await mount(() => (
          <NavigationContext.Provider value={navigation as never}>
            <NavigationRouteContext.Provider value={route}>
              <Page />
            </NavigationRouteContext.Provider>
          </NavigationContext.Provider>
        ));
        const options = rendered.root.findByType(RouteOptions).props.options;
        expect(options).toMatchObject({ title });
        expect(options).not.toHaveProperty('headerLargeTitleEnabled');
        expect(options).not.toHaveProperty('headerTitle');
        expect(options).not.toHaveProperty('headerBackTitle');
        expect(options).not.toHaveProperty('headerBackButtonMenuEnabled');
        const registration = publicMoneyScreens().find(
          (screen) => screen.props.name === name,
        )!;
        const initial = registration.props.options({ route, navigation });
        if (backTitle) {
          expect(initial).toMatchObject({
            headerBackTitle: backTitle,
            headerBackButtonMenuEnabled: true,
            headerBackButtonDisplayMode: 'default',
          });
        } else {
          expect(initial).not.toHaveProperty('headerBackTitle');
          expect(initial).not.toHaveProperty('headerBackButtonMenuEnabled');
        }
      } finally {
        if (rendered) await act(async () => rendered!.unmount());
        Platform.OS = original;
      }
    }
  },
);

test.each([
  ['Commonwealth grants', Grants, {}, 'grants'],
  ['Queensland grants', Grants, { jur: 'qld' }, 'grants'],
  ['Government agencies', Agencies, {}, 'agencies'],
] as const)(
  '%s reveals a capped title from its page title and keeps its back name',
  async (title, Page, params, name) => {
    Object.assign(mockParams, params);
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    let rendered: TestRenderer.ReactTestRenderer | undefined;
    try {
      act(() =>
        Dimensions.set({
          window: { ...originalWindow, width: 402, fontScale: 1 },
          screen: { ...originalScreen, width: 402 },
        }),
      );
      for (const [previous, backTitle] of [
        ['index', 'Today'],
        ['public-money', 'Public money'],
      ] as const) {
        const route = { key: 'subject', name };
        const options: Record<string, unknown> = {};
        const navigation = {
          getState: () => ({
            index: 1,
            routes: [{ key: 'previous', name: previous }, route],
          }),
          setOptions: jest.fn((next) => Object.assign(options, next)),
          isFocused: () => true,
          addListener: () => () => {},
        };
        const registration = publicMoneyScreens().find(
          (screen) => screen.props.name === name,
        )!;
        Object.assign(
          options,
          registration.props.options({ route, navigation }),
        );
        rendered = await mount(() => (
          <NavigationContext.Provider value={navigation as never}>
            <NavigationRouteContext.Provider value={route}>
              <HeaderHeightContext.Provider value={100}>
                <Page />
              </HeaderHeightContext.Provider>
            </NavigationRouteContext.Provider>
          </NavigationContext.Provider>
        ));
        expect(options.headerLargeTitleEnabled).not.toBe(true);
        expect(options).toMatchObject({
          title,
          headerBackTitle: backTitle,
          headerBackButtonMenuEnabled: true,
          headerBackButtonDisplayMode: 'default',
          headerSearchBarOptions: { placement: 'stacked' },
        });
        expect(
          rendered.root.findByType(RouteOptions).props.options,
        ).not.toHaveProperty('headerTitle');
        expect(typeof options.headerTitle).toBe('function');
        const inline = () =>
          (options.headerTitle as () => React.ReactElement)();
        expect(inline().type).toBe(BarTitle);
        expect(inline().props).toMatchObject({
          title,
          shown: false,
          backTitle: options.headerBackTitle,
        });
        const expectVisible = (visible: boolean) => {
          let titleView!: TestRenderer.ReactTestRenderer;
          act(() => {
            titleView = TestRenderer.create(inline());
          });
          try {
            measureBarTitle(titleView, { [title]: 100, [backTitle]: 40 });
            const text = titleView.root.findByType(Animated.Text);
            const style = StyleSheet.flatten(text.props.style);
            expect(style.maxWidth).toBeGreaterThanOrEqual(100);
            expect(style.width).toBeUndefined();
            if (!visible)
              expect(
                typeof style.opacity === 'number'
                  ? style.opacity
                  : style.opacity.__getValue(),
              ).toBe(visible ? 1 : 0);
            expect(text.props).toMatchObject({
              accessibilityLabel: title,
              accessibilityElementsHidden: !visible,
              importantForAccessibility: visible
                ? 'auto'
                : 'no-hide-descendants',
            });
          } finally {
            act(() => titleView.unmount());
          }
        };
        expectVisible(false);
        const list = rendered.root.findByType(MoneyList);
        // The page's own title is the anchor; the status and the figure
        // follow it.
        const [anchor, block] = list.props.header.props.children;
        expect(anchor.props.collapsable).toBe(false);
        expect(anchor.props.children.type).toBe(Heading);
        expect(anchor.props.children.props.children).toBe(title);
        expect(block.props.children[0].type).toBe(MoneyStatus);
        expect(block.props.children[1].type).toBe(FigureBlock);
        const pending: ((...values: number[]) => void)[] = [];
        const measure = jest.fn((done) => pending.push(done));
        anchor.props.ref.current = { measure };
        act(() =>
          anchor.props.onLayout({
            nativeEvent: { layout: { y: 0, height: 120 } },
          }),
        );
        expect(measure).not.toHaveBeenCalled();
        const scroll = (y: number, pageY: number) =>
          act(async () => {
            list.props.onScroll({ nativeEvent: { contentOffset: { y } } });
            await Promise.resolve();
            pending.shift()!(0, 0, 300, 120, 0, pageY);
          });
        await scroll(9000, 140);
        expect(inline().props.shown).toBe(false);
        // The block's midpoint reaches the bar while its lower half is visible.
        await scroll(-900, 40);
        expect(inline().props.shown).toBe(true);
        expect(inline().props.backTitle).toBe(options.headerBackTitle);
        expectVisible(true);
        await scroll(9000, 140);
        expect(inline().props.shown).toBe(false);
        expectVisible(false);
        await act(async () => rendered!.unmount());
        rendered = undefined;
      }
    } finally {
      if (rendered) await act(async () => rendered!.unmount());
      act(() =>
        Dimensions.set({ window: originalWindow, screen: originalScreen }),
      );
    }
  },
);

test.each([
  ['Public money', Hub, {}, 'money-hub-title'],
  ['Funding by seat type', FundingBySeatType, {}, 'seat-type-title'],
  [
    'Connection',
    Connection,
    () => ({ id: connectionId() }),
    'connection-title',
  ],
] as const)(
  '%s puts its title in the bar by scroll with the shared bar title, not a full-width one',
  async (_name, Screen, params, heading) => {
    Object.assign(mockParams, typeof params === 'function' ? params() : params);
    const rendered = await mount(Screen as () => React.ReactElement);
    // The layout's own title view keeps its full width while hidden, which
    // left the back button a bare chevron (money-03 to 18).
    const page = rendered.root.findAllByType(PageScreen)[0]!;
    expect(page.props.barTitle).toBeUndefined();
    expect(typeof page.props.onScroll).toBe('function');
    let node = rendered.root.find(
      (n) => n.props.testID === heading && typeof n.type === 'string',
    ).parent;
    while (node && typeof node.props.onLayout !== 'function')
      node = node.parent;
    expect(node).not.toBeNull();
    await act(async () => rendered.unmount());
  },
);

test('a money item that is no longer in the data says so', async () => {
  Object.assign(mockParams, { kind: 'contract', agency: agencyId, id: 'CN0' });
  const rendered = await mount(MoneyItem);
  expect(ids(rendered)).toContain('money-item-missing');
  await act(async () => rendered.unmount());
});

test('private recipient names are absent from visible and accessibility props', async () => {
  Object.assign(mockParams, { jur: 'federal', id: 'GO3141' });
  const privateClient: Pick<ApiClient, 'get'> = {
    async get<T>(
      path: string,
      decode: (v: unknown) => T,
    ): Promise<RecordResult<T>> {
      const input = raw(path);
      if (path.includes('/programs/'))
        input.grants[0] = {
          ...input.grants[0],
          rn: 'Ada Privacy Example',
          k: 'individual',
          rid: 'person:ada',
          n: 'Grant for Ada Privacy Example',
        };
      return { data: decode(input), stale: false, savedAt: 10, asOf: null };
    },
  };
  const catalog = new MoneyCatalogs(privateClient);
  money.program = catalog.program.bind(catalog);
  const rendered = await mount(Program);
  const drawn = rendered.root
    .findAll(() => true)
    .flatMap((n) =>
      [
        n.props.accessibilityLabel,
        n.props.name,
        n.props.title,
        ...(Array.isArray(n.props.children)
          ? n.props.children
          : [n.props.children]),
      ].filter((v) => typeof v === 'string'),
    )
    .join(' ');
  expect(drawn).not.toContain('Ada Privacy Example');
  // Recipients lists organisations; individuals are a footnote, unnamed.
  expect(drawn).not.toContain(unnamedRecipient);
  expect(drawn).toMatch(
    /1 grant to individual recipients, \$[\d,]+, not named\./,
  );
  await act(async () => rendered.unmount());
});

// A seat view draws only the seat (journeys/money.md 7): nothing national
// on screen until the per-seat slice ships. The national total may stay in
// the source sheet's notes, which are not drawn until the sheet opens.
describe('a seat view draws nothing national', () => {
  const drawnText = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll((n) => typeof n.type === 'string')
      .flatMap((n) => [
        n.props.accessibilityLabel,
        ...(Array.isArray(n.props.children)
          ? n.props.children
          : [n.props.children]),
      ])
      .filter((v) => typeof v === 'string' || typeof v === 'number')
      .map(String)
      .join('\n');
  const byID = (r: TestRenderer.ReactTestRenderer, testID: string) =>
    r.root.findAll(
      (n) => n.props.testID === testID && typeof n.type !== 'string',
    );

  test('Grants for a seat: the seat figure only', async () => {
    const index = decodeGrantIndex(raw('/graph/grants.federal.json'));
    const seat = [...index.seats].sort((a, b) => b.total - a.total)[0]!;
    Object.assign(mockParams, {
      jur: 'federal',
      seat: seat.name,
      state: seat.state,
    });
    const r = await mount(Grants);
    const testIDs = [...ids(r)];
    expect(testIDs.filter((id) => id.startsWith('grants-row-'))).toEqual([]);
    for (const id of ['grants-view', 'grants-caption', 'grants-largest'])
      expect([id, testIDs.includes(id)]).toEqual([id, false]);
    expect(byID(r, 'grants-seat-total')[0]!.props.value).toBe(
      formatMoneyCompact(seat.total),
    );
    const text = drawnText(r);
    expect(text).toContain(formatMoneyCompact(seat.total));
    expect(text).not.toContain(formatMoneyCompact(index.counts.dollars));
    expect(text).not.toContain(formatMoney(index.counts.dollars));
    expect(text).not.toContain(formatCount(index.counts.grants));
    await act(async () => r.unmount());
  });

  test('a program for a seat: the seat’s electorates total, not the program’s', async () => {
    const row = (
      [...program.electorates] as { n: string; st: string; t: number }[]
    ).sort((a, b) => b.t - a.t)[0]!;
    Object.assign(mockParams, {
      jur: 'federal',
      id: 'GO3141',
      seat: row.n,
      state: row.st,
    });
    const r = await mount(Program);
    expect(byID(r, 'program-total')[0]!.props.value).toBe(
      formatMoneyCompact(row.t),
    );
    const decoded = decodeProgram(program);
    const text = drawnText(r);
    expect(text).toContain(formatMoneyCompact(row.t));
    expect(text).not.toContain(formatMoneyCompact(decoded.total));
    expect(text).not.toContain(formatMoney(decoded.total));
    // The way to the whole program is a row, not a figure.
    expect(byID(r, 'program-national')[0]!.props.href).toMatchObject({
      params: { id: decoded.id, jur: 'federal' },
    });
    expect(
      byID(r, 'program-national')[0]!.props.href.params,
    ).not.toHaveProperty('seat');
    await act(async () => r.unmount());
  });
});

describe('a program, place or organisation', () => {
  test('the organisation row is its name only, and opens its money record', async () => {
    const entity = (
      raw('/evidence/index.json').entities as {
        id: string;
        kind: string;
        abn?: string;
      }[]
    ).find((e) => e.kind === 'organisation' && e.abn)!;
    Object.assign(mockParams, { id: entity.id });
    const r = await mount(Connection);
    const row = r.root.findAll(
      (n) =>
        n.props.testID === 'connection-destination-organisation' &&
        n.type === LinkRow,
    )[0]!;
    expect(row.props.detail).toBeUndefined();
    expect(row.props.href).toEqual(
      organisationHref(`abn:${entity.abn}`, row.props.title),
    );
    await act(async () => r.unmount());
  });

  test('an excerpt is three lines, and More reads the rest in place', async () => {
    Object.assign(mockParams, { id: connectionId() });
    const r = await mount(Connection);
    const more = r.root.findAll(
      (n) =>
        /^connection-excerpt-\d+-more$/.test(n.props.testID ?? '') &&
        typeof n.type !== 'string' &&
        !!n.props.onPress,
    )[0]!;
    const i = Number(more.props.testID.split('-')[2]);
    expect(more.props.accessibilityRole).toBe('button');
    expect(more.props.accessibilityLabel).toMatch(
      new RegExp(`^More, .+ excerpt ${i + 1}$`),
    );
    expect(more.props.hitSlop).toMatchObject({ top: 12, bottom: 12 });
    const passage = () =>
      r.root
        .findAll((n) => n.props.testID === `connection-excerpt-${i}`)[0]!
        .findAll(
          (n) => n.props.variant === 'recordText' && n.props.wordSafe,
        )[0]!;
    expect(passage().props.numberOfLines).toBe(3);
    await act(async () => more.props.onPress());
    expect(passage().props.numberOfLines).toBeUndefined();
    expect(
      r.root.findAll((n) => n.props.testID === `connection-excerpt-${i}-more`),
    ).toHaveLength(0);
    await act(async () => r.unmount());
  });
});

describe('the seat grant list', () => {
  const record = <T,>(data: T, stale = false): RecordResult<T> => ({
    data,
    stale,
    savedAt: 10,
    asOf: null,
  });
  const byID = (r: TestRenderer.ReactTestRenderer, testID: string) =>
    r.root.findAll(
      (n) => n.props.testID === testID && typeof n.type !== 'string',
    );
  const list = (r: TestRenderer.ReactTestRenderer) =>
    r.root.findByType(MoneyList);
  const index = decodeGrantIndex(seatIndexFixture);
  const first = decodeSeatGrants(seatFirstFixture);
  const second = decodeSeatGrants(seatSecondFixture);
  beforeEach(() => {
    Object.assign(mockParams, { seat: 'Maribyrnong', state: 'vic' });
    money.grants = jest.fn(async () => record(index));
    money.seat = jest.fn(async (_jur, _key, _refresh, options) =>
      record(options?.page ? second : first),
    );
  });

  test('lists the first 25 grants under the exact index total, with the caveats, source and Originals last', async () => {
    const r = await mount(Grants);
    const page = list(r);
    expect(page.props.rows).toHaveLength(25);
    expect(money.seat).toHaveBeenCalledTimes(1);
    const figure = byID(r, 'grants-seat-total')[0]!;
    expect(figure.props.value).toBe(formatMoneyCompact(index.seats[0]!.total));
    expect(figure.props.accessibilityLabel).toContain('28 Commonwealth grants');
    expect(figure.props.caveat).toBe(
      'Matched by postcode where one is recorded, so this is a minimum.',
    );
    expect(figure.props.citation.asOf).toBe(index.meta.asOf);
    expect(byID(r, 'grants-seat-award-note')[0]!.props.children).toBe(
      'An award is not a payment.',
    );
    expect(byID(r, 'grants-seat-caption')[0]!.props.children).toBe(
      '25 of 28 grants, largest first',
    );
    expect(byID(r, 'grants-seat-show-all')[0]!.props.label).toBe('Show all 28');
    const row = page.props.render(page.props.rows[0], 0);
    expect(row.type).toBe(MoneyRow);
    expect(row.props).toMatchObject({
      name: 'Fixture Association 1',
      detail: 'Fixture support program · 2020–21',
      amount: seatFirstFixture.grants[0]!.v,
      href: organisationHref(
        seatFirstFixture.grants[0]!.rid,
        'Fixture Association 1',
        'federal',
      ),
    });
    // Every rendered row speaks its recipient, program, year and amount.
    for (const grant of first.grants.slice(0, 10)) {
      const cell = r.root.findAll(
        (n) =>
          n.type === LinkRow &&
          n.props.testID === `grants-seat-grant-${first.grants.indexOf(grant)}`,
      )[0]!;
      expect(cell.props.accessibilityLabel).toContain(grant.name);
      expect(cell.props.accessibilityLabel).toContain(grant.program);
      expect(cell.props.accessibilityLabel).toContain('2020–21');
      expect(cell.props.accessibilityLabel).toContain('dollars');
    }
    const footer = page.props.footer.props.children.filter(Boolean);
    expect(footer.at(-1).props.testID).toBe('grants-seat-originals');
    expect(byID(r, 'grants-seat-original')[0]!.props.external.url).toBe(
      index.meta.sourceUrl,
    );
  });

  test('Show all loads continuation pages and exposes all grants once, preserving index figures', async () => {
    const r = await mount(Grants);
    await act(async () => byID(r, 'grants-seat-show-all')[0]!.props.onPress());
    expect(list(r).props.rows.map((g: { id: string }) => g.id)).toEqual(
      [...first.grants, ...second.grants].map((g) => g.id),
    );
    expect(jest.mocked(money.seat).mock.calls.at(-1)?.[3]?.page).toBe(
      'maribyrnong-2.json',
    );
    expect(byID(r, 'grants-seat-show-all')).toHaveLength(0);
    expect(byID(r, 'grants-seat-total')[0]!.props.value).toBe(
      formatMoneyCompact(index.seats[0]!.total),
    );
  });

  test('a private recipient is a plain row without exposing a private identity', async () => {
    const privatePage = decodeSeatGrants({
      ...seatFirstFixture,
      grants: [
        {
          ...seatFirstFixture.grants[0],
          rn: 'Fixture private recipient',
          rid: 'person:fixture',
          k: 'individual',
          n: 'Fixture private purpose',
        },
      ],
    });
    money.seat = jest.fn(async () => record(privatePage));
    const r = await mount(Grants);
    const page = list(r),
      row = page.props.render(page.props.rows[0], 0);
    expect(row.props.name).toBe('Individual recipient');
    expect(row.props.href).toBeUndefined();
    expect(row.props.external).toBeUndefined();
    const strings = r.root
      .findAll(() => true)
      .flatMap((n) => [...Object.values(n.props), ...[n.props.children].flat()])
      .filter((v): v is string => typeof v === 'string');
    expect(strings.join('\n')).not.toContain('Fixture private');
  });

  test.each([true, false])(
    'an unlisted recipient stays plain with an award URL=%s',
    async (sourceUrl) => {
      money.grants = jest.fn(async () => record({ ...index, recipients: [] }));
      money.seat = jest.fn(async () =>
        record({
          ...first,
          grants: first.grants.map((g) => ({
            ...g,
            sourceUrl: sourceUrl ? g.sourceUrl : null,
          })),
        }),
      );
      const r = await mount(Grants);
      const page = list(r),
        row = page.props.render(page.props.rows[0], 0);
      expect(row.props.href).toBeUndefined();
      expect(row.props.external).toBeUndefined();
      expect(row.props.name).toBe('Fixture Association 1');
      const cell = r.root
        .findAllByType(LinkRow)
        .find((n) => n.props.testID === 'grants-seat-grant-0')!;
      expect(cell.props.accessory).toBe('none');
      expect(
        cell.findAll((n) => typeof n.props.onPress === 'function'),
      ).toHaveLength(0);
    },
  );

  test.each([
    [null, 'Unnamed recipient'],
    ['', 'Unnamed recipient'],
    ['   ', 'Unnamed recipient'],
    ['Recipients not disclosed', 'Recipients not disclosed'],
  ])(
    'a nameless or undisclosed seat grant (%s) stays plain',
    async (rn, name) => {
      const page = decodeSeatGrants({
        ...seatFirstFixture,
        grants: [{ ...seatFirstFixture.grants[0], rn, k: 'undisclosed' }],
      });
      money.seat = jest.fn(async () => record(page));
      const r = await mount(Grants);
      const cell = r.root
        .findAllByType(LinkRow)
        .find((n) => n.props.testID === 'grants-seat-grant-0')!;
      expect(cell.props.title).toBe(name);
      expect(cell.props.href).toBeUndefined();
      expect(cell.props.external).toBeUndefined();
      expect(cell.props.accessory).toBe('none');
      expect(
        cell.findAll((n) => typeof n.props.onPress === 'function'),
      ).toHaveLength(0);
    },
  );

  test('an index entry without a public organisation page cannot back a seat recipient link', async () => {
    money.grants = jest.fn(async () =>
      record({
        ...index,
        recipients: index.recipients.map((r) => ({
          ...r,
          organisation: false,
          name: 'Individual recipient',
        })),
      }),
    );
    const r = await mount(Grants);
    const page = list(r);
    const row = page.props.render(page.props.rows[0], 0);
    expect(row.props.name).toBe('Fixture Association 1');
    expect(row.props.href).toBeUndefined();
    expect(row.props.external).toBeUndefined();
  });

  test.each(['no row', 'no key', '404'] as const)(
    '%s says no grants are listed without claiming a zero total',
    async (kind) => {
      if (kind === '404') money.seat = jest.fn(async () => null);
      else
        money.grants = jest.fn(async () =>
          record({
            ...index,
            seats:
              kind === 'no row'
                ? []
                : index.seats.map((s) => ({ ...s, key: '' })),
          }),
        );
      const r = await mount(Grants);
      if (kind === 'no row') {
        // The figure's own line says it once; no second empty message.
        expect(byID(r, 'grants-seat-unmatched')[0]!.props.children).toBe(
          'No grants are matched to Maribyrnong in the grant records. This is not a zero total.',
        );
        expect(byID(r, 'grants-seat-empty')).toHaveLength(0);
      } else {
        expect(byID(r, 'grants-seat-empty')[0]!.props.message).toBe(
          'The individual grants for Maribyrnong aren’t listed yet.',
        );
        expect(byID(r, 'grants-seat-total')[0]!.props.value).toBe(
          formatMoneyCompact(index.seats[0]!.total),
        );
      }
      expect(byID(r, 'grants-seat-records-error')).toHaveLength(0);
      expect(byID(r, 'grants-seat-show-all')).toHaveLength(0);
      expect(list(r).props.rows).toHaveLength(0);
      if (kind !== '404') expect(money.seat).not.toHaveBeenCalled();
      expect(
        r.root.findAllByType(FigureBlock).every((n) => n.props.value !== '$0'),
      ).toBe(true);
    },
  );

  test('a seat page loads below the still-readable index figure', async () => {
    money.seat = jest.fn(() => new Promise(() => {}));
    const r = await mount(Grants);
    expect(byID(r, 'grants-seat-records-loading').length).toBeGreaterThan(0);
    expect(byID(r, 'grants-seat-total')[0]!.props.value).toBe(
      formatMoneyCompact(index.seats[0]!.total),
    );
    expect(byID(r, 'grants-seat-empty')).toHaveLength(0);
  });

  test('an empty legacy index row never turns missing seat records into a $0 figure', async () => {
    money.grants = jest.fn(async () =>
      record({
        ...index,
        seats: index.seats.map((s) => ({ ...s, key: '', count: 0, total: 0 })),
      }),
    );
    const r = await mount(Grants);
    expect(byID(r, 'grants-seat-unmatched').length).toBeGreaterThan(0);
    // A zero count renders no stray "0" in place of an empty state.
    expect(list(r).props.empty).toBeNull();
    expect(r.root.findAllByType(FigureBlock)).toHaveLength(0);
  });

  test.each(['offline', 'server'] as const)(
    'a %s first read uses the shared money state and keeps the totals',
    async (code) => {
      money.seat = jest.fn(async () => {
        throw new ApiError(code, 'Fixture failure');
      });
      const r = await mount(Grants);
      expect(
        byID(
          r,
          code === 'offline'
            ? 'grants-seat-records-offline-uncached'
            : 'grants-seat-records-error',
        ).length,
      ).toBeGreaterThan(0);
      expect(byID(r, 'grants-seat-total').length).toBeGreaterThan(0);
      expect(byID(r, 'grants-seat-empty')).toHaveLength(0);
      if (code === 'server') {
        money.seat = jest.fn(async () => record(first));
        await act(async () =>
          byID(r, 'grants-seat-records-retry')[0]!.props.onPress(),
        );
        expect(list(r).props.rows).toHaveLength(25);
      }
    },
  );

  test('a saved offline seat page stays readable with the shared offline line', async () => {
    money.seat = jest.fn(async () => record(first, true));
    const r = await mount(Grants);
    expect(list(r).props.rows).toHaveLength(25);
    expect(byID(r, 'grants-status-offline').length).toBeGreaterThan(0);
    expect(byID(r, 'grants-seat-total')[0]!.props.citation.savedAt).toBe(10);
  });

  test('a later page failure keeps the loaded rows and Show all retries the continuation', async () => {
    let fail = true;
    money.seat = jest.fn(async (_jur, _key, _refresh, options) => {
      if (options?.page && fail)
        throw new ApiError('server', 'Fixture failure');
      return record(options?.page ? second : first);
    });
    const r = await mount(Grants);
    await act(async () => byID(r, 'grants-seat-show-all')[0]!.props.onPress());
    expect(list(r).props.rows).toHaveLength(26);
    expect(byID(r, 'grants-seat-more-error').length).toBeGreaterThan(0);
    expect(byID(r, 'grants-seat-show-all')[0]!.props.loading).toBe(false);
    fail = false;
    await act(async () =>
      byID(r, 'grants-seat-more-retry')[0]!.props.onPress(),
    );
    expect(list(r).props.rows).toHaveLength(28);
    expect(byID(r, 'grants-seat-more-error')).toHaveLength(0);
  });

  test('electorate rows with keys still open the seat screen', async () => {
    Object.assign(mockParams, { view: 'electorates' });
    const r = await mount(Grants);
    const page = list(r);
    const row = page.props.render(page.props.rows[0], 0);
    expect(row.props.href.params).toMatchObject({
      seat: 'Maribyrnong',
      state: 'vic',
    });
    expect(row.props.detail).toBe('Victoria · 28 grants');
  });
});

test('a seat seeded from the link stops filtering once the view changes', async () => {
  const { SegmentedPicker } = jest.requireActual('../src/design/controls');
  Object.assign(mockParams, {
    jur: 'federal',
    view: 'electorates',
    seat: 'Melbourne',
  });
  const r = await mount(Grants);
  const caption = () =>
    r.root.find((n) => n.props.testID === 'grants-caption').props.children;
  expect(caption()).toMatch(/^1 of /);
  await act(async () => {
    r.root
      .findAllByType(SegmentedPicker)
      .find((n) => n.props.testID === 'grants-view')!
      .props.onChange('programs');
  });
  expect(caption()).toMatch(/programs, largest first$/);
  await act(async () => {
    r.root
      .findAllByType(SegmentedPicker)
      .find((n) => n.props.testID === 'grants-view')!
      .props.onChange('electorates');
  });
  expect(caption()).toMatch(/electorates, largest first$/);
  await act(async () => r.unmount());
});

test('a largest grant states the count of the recipient’s other awards that month, as its basis says', async () => {
  const largest = raw('/social/grants-largest.json');
  const rows = largest.months[largest.latest] as { id: string; more: number }[];
  const withMore = rows.find((r) => r.more > 0)!;
  const without = rows.find((r) => r.more === 0)!;
  const fact = async (id: string) =>
    (
      await loadMoneyItem({ kind: 'largest', month: largest.latest, id }, false)
    ).data.facts.find((f) => f.label === 'Other awards that month');
  expect((await fact(withMore.id))?.value).toBe(String(withMore.more));
  expect(await fact(without.id)).toBeUndefined();
});

test('a seat with one of its grants listed says it is listed', async () => {
  Object.assign(mockParams, {
    jur: 'federal',
    id: 'GO6821',
    seat: 'Bruce',
    state: 'vic',
  });
  const { SegmentedPicker } = jest.requireActual('../src/design/controls');
  const r = await mount(Program);
  await act(async () => {
    r.root
      .findAllByType(SegmentedPicker)
      .find((n) => n.props.testID === 'program-view')!
      .props.onChange('grants');
  });
  expect(
    r.root.find((n) => n.props.testID === 'program-caption').props.children,
  ).toBe('1 of the 3 grants in Bruce is listed, largest first');
  await act(async () => r.unmount());
});

test.each([
  ['offline', undefined, 1],
  ['the server was unavailable', 'unavailable', 0],
] as const)(
  'funding by seat type says offline only when %s calls for it',
  async (_name, staleReason, lines) => {
    const { OfflineLine } = jest.requireActual('../src/design/states');
    const read = money.allocation;
    money.allocation = async (refresh?: boolean) => ({
      ...(await read(refresh)),
      stale: true,
      ...(staleReason ? { staleReason } : {}),
    });
    const r = await mount(FundingBySeatType);
    expect(r.root.findAllByType(OfflineLine)).toHaveLength(lines);
    await act(async () => r.unmount());
  },
);

test.each([
  ['Grants', Grants, { jur: 'federal' }, 'grants-view', 'recipients'],
  [
    'Program',
    Program,
    { jur: 'federal', id: 'GO3141' },
    'program-view',
    'grants',
  ],
] as const)(
  '%s clears the native search field when the view changes',
  async (_name, Page, params, picker, next) => {
    const { SegmentedPicker } = jest.requireActual('../src/design/controls');
    Object.assign(mockParams, params);
    const r = await mount(Page);
    const search =
      r.root.findByType(RouteOptions).props.options.headerSearchBarOptions;
    const clearText = jest.fn();
    search.ref.current = { clearText };
    await act(async () => search.onChangeText({ nativeEvent: { text: 'zz' } }));
    await act(async () => {
      r.root
        .findAllByType(SegmentedPicker)
        .find((n) => n.props.testID === picker)!
        .props.onChange(next);
    });
    expect(clearText).toHaveBeenCalled();
    expect(r.root.findByType(MoneyList).props.rows.length).toBeGreaterThan(0);
    await act(async () => r.unmount());
  },
);

test('the grants card keeps the register’s caveats, as the contracts card does', async () => {
  const { SourceLine } = jest.requireActual('../src/design/source');
  const r = await mount(Hub);
  const notes = r.root
    .findAllByType(SourceLine)
    .find((x) => x.props.testID === 'money-card-grants-source')!.props
    .notes as string[];
  const index = decodeGrantIndex(raw('/graph/grants.federal.json'));
  expect(index.meta.caveats.length).toBeGreaterThan(0);
  for (const caveat of index.meta.caveats) expect(notes).toContain(caveat);
  await act(async () => r.unmount());
});

test('Community funding shortens only the row title and keeps the full Purpose and exact item amount', async () => {
  const allocation = await fixture.allocation();
  const purpose =
    'The project will deliver the construction of the Sample Aquatic Centre comprising a pool, change rooms and a public forecourt.';
  const award = {
    ...allocation.data.awards[0]!,
    title: purpose,
    value: 40_000_000,
    state: 'vic',
    date: '2026-05-21',
  };
  money.allocation = jest.fn().mockResolvedValue({
    ...allocation,
    data: { ...allocation.data, awards: [award] },
  });
  money.locations = jest.fn().mockRejectedValue(new Error('not listed'));
  const r = await mount(Allocation);
  const row = r.root.findByType(MoneyRow);
  expect(row.props).toMatchObject({
    name: 'Sample Aquatic Centre',
    detail: 'Victoria · 21 May 2026',
  });
  expect(row.findByType(LinkRow).props).toMatchObject({
    titleLines: 2,
    detailLines: 2,
  });
  await act(async () => r.unmount());
  const item = await loadMoneyItem({ kind: 'award', id: award.id }, false);
  expect(item.data.amount).toBe(40_000_000);
  expect(item.data.facts).toContainEqual(
    expect.objectContaining({ label: 'Purpose', value: purpose, long: true }),
  );
  Object.assign(mockParams, { kind: 'award', id: award.id });
  const page = await mount(MoneyItem);
  expect(
    page.root.findAllByProps({ testID: 'money-item-amount' })[0]!.props
      .children,
  ).toBe('$40,000,000');
  await act(async () => page.unmount());
});

test('Community funding searches the full purpose and resolved title behind the short row name', async () => {
  const allocation = await fixture.allocation();
  const award = {
    ...allocation.data.awards[0]!,
    recipient: 'Sample Council',
    title:
      'The project will deliver the construction of the Sample Aquatic Centre comprising a pool and change rooms.',
  };
  money.allocation = jest.fn().mockResolvedValue({
    ...allocation,
    data: { ...allocation.data, awards: [award] },
  });
  money.locations = jest.fn().mockResolvedValue({
    stale: false,
    savedAt: 10,
    asOf: null,
    data: {
      asOf: allocation.data.asOf,
      methodology: [],
      records: [
        {
          id: award.id,
          kind: 'award',
          verified: true,
          title: 'Sample Aquatic Centre including a diving hall',
          sites: [],
        },
      ],
    },
  });
  const page = await mount(Allocation);
  const search =
    page.root.findByType(RouteOptions).props.options.headerSearchBarOptions;
  expect(page.root.findByType(MoneyRow).props.name).toBe(
    'Sample Aquatic Centre',
  );
  for (const query of ['pool', 'diving hall', award.id]) {
    await act(async () =>
      search.onChangeText({ nativeEvent: { text: query } }),
    );
    expect(page.root.findByType(MoneyList).props.rows).toEqual([award]);
    expect(page.root.findByType(MoneyRow).props.name).toBe(
      'Sample Aquatic Centre',
    );
  }
  await act(async () =>
    search.onChangeText({ nativeEvent: { text: 'unrelated project' } }),
  );
  expect(page.root.findByType(MoneyList).props.rows).toEqual([]);
  await act(async () => page.unmount());
});

test('Largest grants drops a program that repeats the recipient', async () => {
  const largest = await fixture.largest();
  const month = largest.data.latest;
  const index = await fixture.grants('federal');
  money.grants = jest.fn().mockResolvedValue({
    ...index,
    data: {
      ...index.data,
      recipients: [
        {
          ...index.data.recipients[0]!,
          id: 'fixture-council',
          name: 'Sample Council',
          organisation: true,
        },
      ],
    },
  });
  const award = {
    ...largest.data.months[month]![0]!,
    recipientId: 'fixture-council',
    recipient: 'Sample Council',
    program: 'Sample Council',
  };
  money.largest = jest.fn().mockResolvedValue({
    ...largest,
    data: { ...largest.data, months: { [month]: [award] } },
  });
  const page = await mount(Largest);
  const row = page.root.findByType(MoneyRow);
  expect(row.props.detail).toMatch(/^from /);
  expect(row.props.detail).not.toContain('Sample Council');
  expect(row.findByType(LinkRow).props.detailLines).toBe(2);
  await act(async () => page.unmount());
});

test('the agency chart has one published source, scale labels and a latest-value caption with no invented start date', async () => {
  const { BarSeries } = jest.requireActual('../src/design/charts');
  const { SourceLine } = jest.requireActual('../src/design/source');
  const { Text } = jest.requireActual('../src/design/text');
  const { SegmentedPicker } = jest.requireActual('../src/design/controls');
  mockParams.id = agencyId;
  const page = await mount(Agency);
  await act(async () =>
    page.root.findByType(SegmentedPicker).props.onChange('years'),
  );
  const chart = page.root.findByType(BarSeries);
  expect(chart.props.sourceLine).toBe(false);
  expect(page.root.findAllByType(SourceLine)).toHaveLength(1);
  expect(chart.props.dateRange.start).toBe(chart.props.dateRange.end);
  const texts = page.root.findAllByType(Text);
  expect(
    texts.find((text) => text.props.testID === 'bar-series-scale-1'),
  ).toBeDefined();
  expect(
    texts.find((text) => text.props.testID === 'bar-series-caption'),
  ).toBeDefined();
  expect(
    texts.some((text) =>
      String(text.props.children).includes('1 January 2015'),
    ),
  ).toBe(false);
  await act(async () => page.unmount());
});

test('sweep 2: the four public money pages set their titles at one size, and every one wraps', async () => {
  for (const [Page, testID, title] of [
    [Hub, 'money-hub-title', 'Public money'],
    [Largest, 'largest-title', 'Largest grants'],
    [Grants, 'grants-title', 'Commonwealth grants'],
    [Agencies, 'agencies-title', 'Government agencies'],
  ] as const) {
    const r = await mount(Page);
    const heading = r.root
      .findAllByType(Heading)
      .find((h) => h.props.testID === testID)!;
    expect(heading.props).toMatchObject({ level: 1, kind: 'page' });
    expect([heading.props.children].flat().join('')).toBe(title);
    // In the page, not the system's large title, which cannot wrap.
    expect(r.root.findByType(RouteOptions).props.options).not.toHaveProperty(
      'headerLargeTitleEnabled',
    );
    await act(async () => r.unmount());
  }
});
