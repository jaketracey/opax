import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Animated, Dimensions, Platform, StyleSheet } from 'react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
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
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { unnamedRecipient } from '../src/features/money-public/privacy';
import { organisationHref } from '../src/features/money-public/routes';
import { LinkRow } from '../src/design/rows';
import { Screen as PageScreen } from '../src/design/layout';
import {
  MoneyList,
  MoneyStatus,
  TitleAlias,
} from '../src/features/money-public/parts';
import { FigureBlock } from '../src/design/record';
import { BarTitle } from '../src/navigation/useTitleOnScroll';
import {
  decodeGrantIndex,
  decodeProgram,
} from '../src/features/money-public/data';
import {
  formatCount,
  formatMoney,
  formatMoneyCompact,
} from '../src/design/format';

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
  expect(r.root.findByType(RouteOptions).props.options).toMatchObject({
    headerBackTitle: 'Back',
    headerBackButtonDisplayMode: 'default',
  });
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
      expect(options.headerBackButtonMenuEnabled).toBe(false);
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

test('Agencies keeps its system large title, stacked search and zero-height title alias', async () => {
  const rendered = await mount(Agencies);
  const options = rendered.root.findByType(RouteOptions).props.options;
  expect(options).toMatchObject({
    title: 'Government agencies',
    headerLargeTitleEnabled: true,
    headerSearchBarOptions: { placement: 'stacked' },
  });
  expect(options).not.toHaveProperty('headerTitle');
  const list = rendered.root.findByType(MoneyList);
  expect(typeof list.props.onScroll).toBe('function');
  const alias = list.props.header.props.children[0];
  expect(alias.type).toBe(TitleAlias);
  expect(alias.props).toEqual({
    title: 'Government agencies',
    testID: 'agencies-title',
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
  '%s keeps its collapsed title and installs static back names only on iOS when known',
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
        expect(options).toMatchObject({
          title,
          headerLargeTitleEnabled: true,
        });
        expect(options).not.toHaveProperty('headerTitle');
        if (backTitle) {
          expect(options).toMatchObject({
            headerBackTitle: backTitle,
            headerBackButtonMenuEnabled: false,
            headerBackButtonDisplayMode: 'default',
          });
        } else {
          expect(options).not.toHaveProperty('headerBackTitle');
          expect(options).not.toHaveProperty('headerBackButtonMenuEnabled');
        }
      } finally {
        if (rendered) await act(async () => rendered!.unmount());
        Platform.OS = original;
      }
    }
  },
);

test.each([
  ['Commonwealth grants', Grants, {}, 'grants', false],
  ['Queensland grants', Grants, { jur: 'qld' }, 'grants', true],
  ['Government agencies', Agencies, {}, 'agencies', true],
] as const)(
  '%s reveals a capped title from its first header block while retaining its large title and back name',
  async (title, Page, params, name, fitsBesideToday) => {
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
      for (const [previous, backTitle, room] of [
        ['index', 'Today', 128],
        ['public-money', 'Public money', 71],
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
        rendered = await mount(() => (
          <NavigationContext.Provider value={navigation as never}>
            <NavigationRouteContext.Provider value={route}>
              <HeaderHeightContext.Provider value={100}>
                <Page />
              </HeaderHeightContext.Provider>
            </NavigationRouteContext.Provider>
          </NavigationContext.Provider>
        ));
        expect(options).toMatchObject({
          title,
          headerLargeTitleEnabled: true,
          headerBackTitle: backTitle,
          headerBackButtonMenuEnabled: false,
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
            const text = titleView.root.findByType(Animated.Text);
            const style = StyleSheet.flatten(text.props.style);
            expect(style.maxWidth).toBe(room);
            expect(style.width).toBeUndefined();
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
        const [alias, anchor] = list.props.header.props.children;
        expect(alias.type).toBe(TitleAlias);
        expect(anchor.props.collapsable).toBe(false);
        expect(anchor.props.children[0].type).toBe(MoneyStatus);
        expect(anchor.props.children[1].type).toBe(FigureBlock);
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
        expectVisible(backTitle === 'Today' && fitsBesideToday);
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
