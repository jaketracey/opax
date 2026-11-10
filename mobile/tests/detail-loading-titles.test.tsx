import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import Electorate from '../src/features/Electorate';
import Person from '../src/features/Person';
import Party from '../src/features/Party';
import BillDetail from '../src/features/bills/BillDetail';
import LeadDetail from '../src/features/leads/LeadDetail';
import DocumentReader from '../src/features/records/DocumentReader';
import BillTextReader from '../src/features/records/BillTextReader';
import TopicPage from '../src/features/reports/TopicPage';
import { DatasetPage } from '../src/features/sources/DatasetPage';
import Program from '../src/features/money-public/Program';
import { Agency } from '../src/features/money-public/Agencies';
import MoneyItem from '../src/features/money-public/MoneyItem';
import Connection from '../src/features/money-public/Connection';
import { sharedScreens, tabRootName } from '../src/navigation/stack';
import {
  licenceScreens,
  referenceScreens,
} from '../src/navigation/stack/reference';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const Link = Object.assign(
    ({ children }: { children?: React.ReactNode }) => children,
    {
      Trigger: ({ children }: { children?: React.ReactNode }) => children,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    },
  );
  const router = { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn() };
  return {
    Stack: { Screen: () => null },
    Link,
    router,
    useRouter: () => router,
    useLocalSearchParams: () => mockParams,
    useSegments: () => [],
  };
});
jest.mock('../src/api/runtime', () => {
  const pending = () => new Promise(() => {});
  return {
    apiClient: { get: pending },
    catalogs: {
      billIndexRow: () => null,
      ...Object.fromEntries(
        [
          'directory',
          'electorateFor',
          'person',
          'partyPage',
          'billFor',
          'discovery',
          'expenses',
          'expenseCategories',
          'pay',
        ].map((name) => [name, pending]),
      ),
    },
    reports: Object.fromEntries(
      ['topic', 'tide', 'money', 'speeches'].map((name) => [name, pending]),
    ),
  };
});
jest.mock('../src/features/records/runtime', () => ({
  records: {
    document: () => new Promise(() => {}),
    billManifest: () => new Promise(() => {}),
  },
}));
jest.mock('../src/features/money-public/runtime', () => ({
  money: Object.fromEntries(
    [
      'grants',
      'agency',
      'agencies',
      'connections',
      'connection',
      'evidence',
      'contracts',
      'contract',
      'notes',
    ].map((name) => [name, () => new Promise(() => {})]),
  ),
}));
jest.mock('../src/features/sources/loader', () => ({
  useSources: () => ({ list: [], settled: false, refreshing: false }),
  useOwnDates: () => ({}),
  hasOwnDate: () => false,
  loadedAdditions: [],
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'loading' }),
  savedSeatDirectory: () => null,
}));

const details: [string, string, ReactElement, Record<string, string>][] = [
  [
    'electorate/[id]',
    'Electorate',
    <Electorate key="Electorate" />,
    { id: 'maribyrnong' },
  ],
  [
    'person/[slug]',
    'Parliamentarian',
    <Person key="Person" />,
    { slug: 'anthony-albanese' },
  ],
  ['party/[slug]', 'Party', <Party key="Party" />, { slug: 'labor' }],
  [
    'bill/[key]',
    'Bill',
    <BillDetail key="BillDetail" />,
    { key: 'au-federal-r7520' },
  ],
  ['lead/[id]', 'Lead', <LeadDetail key="LeadDetail" />, { id: 'lead-1' }],
  [
    'topic/[slug]',
    'Topic',
    <TopicPage key="TopicPage" />,
    { slug: 'gambling' },
  ],
  [
    'doc/[slug]',
    'Record',
    <DocumentReader key="DocumentReader" />,
    { slug: 'speech-1205524' },
  ],
  [
    'bill-text/[key]',
    'Bill text',
    <BillTextReader key="BillTextReader" />,
    { key: 'au-federal-r7520' },
  ],
  [
    'sources/dataset/[id]',
    'Dataset',
    <DatasetPage key="DatasetPage" id="release" />,
    { id: 'release' },
  ],
  [
    '[id]',
    'Dataset',
    <DatasetPage key="DatasetPage" id="release" licenceRoot />,
    { id: 'release' },
  ],
  [
    'grant-program',
    'Grant program',
    <Program key="Program" />,
    { id: 'program-1' },
  ],
  ['agency', 'Government agency', <Agency key="Agency" />, { id: 'agency-1' }],
  [
    'money-item',
    'Money record',
    <MoneyItem key="MoneyItem" />,
    { kind: 'contract', agency: 'agency-1', id: 'contract-1' },
  ],
  [
    'connection',
    'Programs and places',
    <Connection key="Connection" />,
    { id: 'connection-1' },
  ],
];

test.each(details)(
  '%s renders without its generic loading title %s',
  async (name, placeholder, element, params) => {
    mockParams = params;
    const screens = [
      ...sharedScreens('(today)', false),
      ...referenceScreens(),
      ...licenceScreens(),
    ];
    const screen = screens.find((screen) => screen.props.name === name)!;
    const routes = [
      { name: 'index', key: 'root' },
      { name, key: 'detail', params },
    ];
    let options: Record<string, unknown> = {};
    const history: Record<string, unknown>[] = [];
    const navigation = {
      getState: () => ({ index: 1, routes }),
      isFocused: () => true,
      addListener: () => () => {},
      setOptions: (next: object) => {
        options = { ...options, ...next };
        history.push(options);
      },
    };
    options = screen.props.options({ route: routes[1], navigation });
    history.push(options);
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={routes[1]!}>
            {element}
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    for (const state of history) {
      expect(state.title).not.toBe(placeholder);
      expect(state.headerTitle).not.toBe(placeholder);
      if (typeof state.headerTitle === 'function') {
        let header!: TestRenderer.ReactTestRenderer;
        act(() => {
          header = TestRenderer.create(
            state.headerTitle({ children: state.title }),
          );
        });
        expect(JSON.stringify(header.toJSON())).not.toContain(
          `"${placeholder}"`,
        );
        act(() => header.unmount());
      }
    }
    act(() => view.unmount());
  },
);

test.each(['(today)', '(your-mp)', '(bills)', '(search)', '(ask)'])(
  '%s has blank detail registrations and safe Back labels before data',
  (tab) => {
    const screens = sharedScreens(tab, false);
    for (const [name] of details.filter(([name]) =>
      screens.some((s) => s.props.name === name),
    )) {
      const detail = screens.find((s) => s.props.name === name)!;
      const next = screens.find((s) => s.props.name === 'person/[slug]/votes')!;
      const routes = [
        { key: 'root', name: 'index' },
        { key: 'detail', name },
        { key: 'next', name: next.props.name },
      ];
      const navigation = { getState: () => ({ index: 1, routes }) };
      expect(detail.props.options({ route: routes[1], navigation }).title).toBe(
        '',
      );
      expect(
        next.props.options({ route: routes[2], navigation }).headerBackTitle,
      ).toBe('Back');
      Object.assign(routes[1]!, { params: { name: 'Known subject' } });
      expect(
        next.props.options({ route: routes[2], navigation }).headerBackTitle,
      ).toBe('Known subject');
    }
    for (const [previous, name, label] of [
      ['grants', 'grant-program', 'Grants'],
      ['explore/index', 'grant-program', 'Tools'],
      ['explore/index', 'money-item', 'Tools'],
    ]) {
      const entry = screens.find((s) => s.props.name === name)!;
      const routes = [
        { key: 'previous', name: previous },
        { key: 'detail', name },
      ];
      expect(
        entry.props.options({
          route: routes[1],
          navigation: { getState: () => ({ index: 1, routes }) },
        }),
      ).toMatchObject({
        headerBackTitle: label,
        headerBackButtonMenuEnabled: false,
      });
    }
    const root = tabRootName(tab);
    const routes = [
      { key: 'root', name: root },
      { key: 'detail', name: 'electorate/[id]' },
    ];
    const electorate = screens.find((s) => s.props.name === 'electorate/[id]')!;
    expect(
      electorate.props.options({
        route: routes[1],
        navigation: { getState: () => ({ index: 1, routes }) },
      }).headerBackTitle,
    ).toBe(
      {
        index: 'Today',
        'your-mp': 'Your MP',
        bills: 'Bills',
        search: 'Search',
        ask: 'Ask',
      }[root],
    );
  },
);
