import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  DarkTheme,
  DefaultTheme,
  Redirect,
  Stack,
  ThemeProvider,
  useLocalSearchParams,
  router,
} from 'expo-router';
import SharedLayout, {
  unstable_settings,
} from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/_layout';
import RootLayout from '../src/app/_layout';
import AccountLayout from '../src/app/account/_layout';
import LicenceLayout from '../src/app/licence/_layout';
import TalkLayout from '../src/app/talk/_layout';
import SeatLayout from '../src/app/seat/_layout';
import WelcomeLayout from '../src/app/welcome/_layout';
import * as routes from '../src/navigation/routes';
import { navigationTheme } from '../src/navigation/theme';
import LegacyMoneyNode from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/money-node';
import MoneyRecord from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/money-record';
import MoneyRecordScreen from '../src/features/money/MoneyRecord';
import { publicMoneyScreens } from '../src/navigation/stack/public-money';
import {
  launchSettled,
  resetLaunchSettledForTests,
  welcomeMounted,
} from '../src/launch/settled';
import {
  installAndroidLinkCapture,
  linkDeliveryPath,
  type LinkDelivery,
} from '../src/navigation/link-readiness';

let mockRootNavigationKey: string | undefined = 'root';
let mockContainerReady = false;
let mockNativeDeliveries: LinkDelivery[] = [];
jest.mock('../modules/opax-links', () => ({
  __esModule: true,
  default: {
    pending: () => mockNativeDeliveries,
    acknowledge: jest.fn(async () => {}),
    addListener: () => ({ remove: () => {} }),
  },
}));
const mockNavigationRef = {
  isReady: () => mockContainerReady,
  getRootState: () => ({ routes: [] }),
  addListener: () => () => {},
};

// Root chrome tests keep saved-seat reads local and independent of build services.
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/features/money/MoneyRecord', () => () => null);

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Screen = () => null;
  const Protected = ({ children }: { children: React.ReactNode }) => children;
  const Stack = ({ children }: { children: React.ReactNode }) => {
    React.Children.forEach(children, (child: React.ReactElement) => {
      if (child && child.type !== Screen && child.type !== Protected)
        throw new Error('Stack children must be direct screens');
    });
    return React.createElement(React.Fragment, null, children);
  };
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return {
    Stack,
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    DarkTheme: { dark: true },
    DefaultTheme: { dark: false },
    Redirect: () => null,
    useLocalSearchParams: jest.fn(),
    useRootNavigationState: () => ({ key: mockRootNavigationKey }),
    useNavigationContainerRef: () => mockNavigationRef,
    useSegments: () => [],
    router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  };
});
jest.mock('../src/navigation/KeyboardShortcuts', () => ({
  KeyboardShortcuts: () => null,
}));
let mockSplashPhase: 'pending' | 'plain' | 'welcome' = 'plain';
let mockCoverDone: (() => void) | undefined;
jest.mock('../src/launch/splash', () => ({
  decideLaunchSequence: jest.fn(async () => undefined),
  decideSplashPlain: jest.fn(),
  holdSplashForWelcome: jest.fn(),
  splashPhase: () => mockSplashPhase,
}));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('../src/onboarding/state', () => ({
  useTourState: () => 'hidden',
  checkFirstLaunch: jest.fn(),
  hideTour: jest.fn(),
  isContentLink: () => false,
  leaveTour: jest.fn(),
}));
jest.mock('../src/launch/LaunchHandoff', () => ({
  LaunchHandoff: () => null,
  RootLaunchHandoff: ({ onDone }: { onDone: () => void }) => {
    mockCoverDone = onDone;
    return null;
  },
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: null }),
  accountSnapshot: () => ({ status: null }),
}));
jest.mock('../src/voice/linked', () => ({ voiceLinked: true }));
jest.mock('../src/design/environment', () => ({
  isProduction: false,
  hasSourcePreview: true,
  isE2E: true,
  webOrigin: 'https://opax.invalid',
}));

const app = resolve(__dirname, '../src/app');
test('Android drains warm links when the container is ready and the root snapshot is still partial', () => {
  const original = Platform.OS;
  let tree: TestRenderer.ReactTestRenderer | undefined;
  let stopCapture: (() => void) | undefined;
  const routed = router.navigate as jest.Mock;
  routed.mockClear();
  try {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    mockRootNavigationKey = undefined;
    mockContainerReady = true;
    mockNativeDeliveries = [
      { id: 'before-root', sequence: 1, url: 'opax://party/labor' },
    ];
    stopCapture = installAndroidLinkCapture();
    expect(routed).not.toHaveBeenCalled();
    act(() => {
      tree = TestRenderer.create(React.createElement(RootLayout));
    });
    expect(routed).toHaveBeenCalledTimes(1);
    expect(routed).toHaveBeenCalledWith(
      linkDeliveryPath('/(tabs)/(today)/party/labor', 'before-root'),
    );
  } finally {
    if (tree) act(() => tree!.unmount());
    stopCapture?.();
    mockNativeDeliveries = [];
    mockRootNavigationKey = 'root';
    mockContainerReady = false;
    Object.defineProperty(Platform, 'OS', {
      value: original,
      configurable: true,
    });
  }
});
test.each([
  ['ios', 'auto'],
  ['android', 'dark'],
] as const)(
  '%s root keeps the appropriate system icon appearance',
  (os, style) => {
    const original = Platform.OS;
    let tree: TestRenderer.ReactTestRenderer | undefined;
    try {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      act(() => {
        tree = TestRenderer.create(React.createElement(RootLayout));
      });
      expect(tree!.root.findByType(StatusBar).props.style).toBe(style);
    } finally {
      if (tree) act(() => tree!.unmount());
      Object.defineProperty(Platform, 'OS', {
        value: original,
        configurable: true,
      });
    }
  },
);
// The theme's `dark` flag becomes every native bar's interface style. The
// default light theme kept pushed-page bars and sheet headers cream in dark
// mode (build 61 sweep), so the root follows the system scheme; release
// builds are light-only and keep the default theme.
test('the root stack sits in a navigation theme that follows the scheme', () => {
  expect(navigationTheme('dark')).toBe(DarkTheme);
  expect(navigationTheme('light')).toBe(DefaultTheme);
  expect(navigationTheme('unspecified')).toBe(DefaultTheme);
  expect(navigationTheme(undefined)).toBe(DefaultTheme);
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(React.createElement(RootLayout));
  });
  try {
    const theme = tree.root.findByType(ThemeProvider);
    // The jest scheme is light.
    expect(theme.props.value).toBe(DefaultTheme);
    expect(theme.findAllByType(Stack).length).toBe(1);
    expect(tree.root.findAllByType(Stack).length).toBe(1);
  } finally {
    act(() => tree.unmount());
  }
});
// Sweep 3 captures, A8 (review P2): motion held for the launch starts when
// the root's cover has finished. With this wiring gone, every bill plate's
// stage line stayed undrawn for the session and no test noticed.
describe('the root tells the launch when its cover has gone', () => {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  beforeEach(() => {
    resetLaunchSettledForTests();
    mockCoverDone = undefined;
  });
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = undefined;
    mockSplashPhase = 'plain';
  });
  const launch = (phase: typeof mockSplashPhase) => {
    mockSplashPhase = phase;
    act(() => {
      tree = TestRenderer.create(React.createElement(RootLayout));
    });
  };

  test('a plain launch settles when the cover finishes, not before', () => {
    launch('plain');
    expect(launchSettled()).toBe(false);
    act(() => mockCoverDone!());
    expect(launchSettled()).toBe(true);
    // The cover is unmounted with it.
    expect(tree!.root.findAllByProps({ onDone: mockCoverDone })).toHaveLength(
      0,
    );
  });

  test('under a first launch’s welcome the cover finishing settles nothing', () => {
    const unmount = welcomeMounted();
    launch('welcome');
    act(() => mockCoverDone!());
    expect(launchSettled()).toBe(false);
    unmount();
  });
});
const sharedFolder = '(tabs)/(today,your-mp,bills,search,ask)';
const layouts = {
  shared: SharedLayout,
  root: RootLayout,
  account: AccountLayout,
  licence: LicenceLayout,
  talk: TalkLayout,
  seat: SeatLayout,
  welcome: WelcomeLayout,
};
function names(kind: keyof typeof layouts, segment = '(today)') {
  let tree!: TestRenderer.ReactTestRenderer;
  const Layout = layouts[kind];
  act(() => {
    tree = TestRenderer.create(React.createElement(Layout, { segment }));
  });
  const result = tree.root
    .findAllByType(Stack.Screen)
    .map((node) => node.props.name as string);
  expect(new Set(result).size).toBe(result.length);
  act(() => tree.unmount());
  return result;
}

// Each inventory row specifies its actual stack, registration and file.
const shared = [
  'edition',
  'members',
  'election',
  'electorate-date',
  'follows',
  'person/[slug]',
  'person/[slug]/votes',
  'person/[slug]/speeches',
  'person/[slug]/interests',
  'party-sources',
  'party/[slug]',
  'bill-list',
  'bill/[key]',
  'record-list',
  'bill-text-contents/[key]',
  'results/[kind]',
  'consent',
  'filters',
  'conversations',
  'ask-report',
  'money',
  'money-node',
  'money-record',
  'money-item',
  'money-donors',
  'funding-by-seat-type',
  'agency-list',
  'connection',
  'explore/index',
  'explore/[tool]',
  'explore/photo',
  'explore/tide-table',
  'explore/years',
];
const inventory: [keyof typeof layouts, string, string][] = [
  ...shared.map(
    (name) =>
      ['shared', name, `${sharedFolder}/${name}`] as [
        keyof typeof layouts,
        string,
        string,
      ],
  ),
  ...[
    'consent',
    'sign-in/code',
    'delete/code',
    'coverage',
    'methods',
    'sources/datasets',
    'sources/dataset/[id]',
    'sources/portraits',
    'sources/photos',
    'sources/fonts',
    'ask',
    'conversations',
  ].map(
    (name) =>
      ['account', name, `account/${name}`] as [
        keyof typeof layouts,
        string,
        string,
      ],
  ),
  ...['[id]', 'sources/[...path]'].map(
    (name) =>
      ['licence', name, `licence/${name}`] as [
        keyof typeof layouts,
        string,
        string,
      ],
  ),
  ...['index', 'consent', 'sources', 'record', 'sign-in', 'sign-in/code'].map(
    (name) =>
      ['talk', name, `talk/${name}`] as [keyof typeof layouts, string, string],
  ),
  ...['index', 'state/[code]'].map(
    (name) =>
      ['seat', name, `seat/${name}`] as [keyof typeof layouts, string, string],
  ),
  ...['index', 'seat/index', 'seat/state/[code]'].map(
    (name) =>
      ['welcome', name, `welcome/${name}`] as [
        keyof typeof layouts,
        string,
        string,
      ],
  ),
  ...[
    'source',
    'machine-note',
    'citation',
    'rule',
    'licences',
    'seat',
    'welcome',
    'talk',
    'licence',
    'account',
  ].map(
    (name) => ['root', name, name] as [keyof typeof layouts, string, string],
  ),
];
const registered = new Map<keyof typeof layouts, string[]>();
beforeAll(() => {
  for (const kind of Object.keys(layouts) as (keyof typeof layouts)[])
    registered.set(kind, names(kind));
});
test.each(inventory)(
  '%s registers %s and resolves its file',
  (kind, name, file) => {
    expect(registered.get(kind)).toContain(name);
    expect(
      [`${file}.tsx`, `${file}/index.tsx`, `${file}/_layout.tsx`].some((path) =>
        existsSync(resolve(app, path)),
      ),
    ).toBe(true);
  },
);
test.each(['(today)', '(your-mp)', '(bills)', '(search)', '(ask)'])(
  '%s has every shared detail and only its root has a large title',
  (segment) => {
    const actual = names('shared', segment);
    for (const screen of shared) expect(actual).toContain(screen);
    expect(actual).toContain('ask');
    for (const screen of ['directory', 'stats', 'methods'])
      expect(actual).toContain(screen);
    expect(actual).not.toContain('bill-filters');
  },
);
test.each([
  ['(today)', 'today', 'index'],
  ['(your-mp)', 'your-mp', 'your-mp'],
  ['(bills)', 'bills', 'bills'],
  ['(search)', 'search', 'search'],
  ['(ask)', 'ask', 'ask'],
] as const)('%s starts on its own root', (segment, group, root) => {
  expect(names('shared', segment)[0]).toBe(root);
  expect(unstable_settings[group].initialRouteName).toBe(root);
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(React.createElement(SharedLayout, { segment }));
  });
  expect(view.root.findByType(Stack).props.initialRouteName).toBe(root);
  act(() => view.unmount());
});
test('money-node exists and is registered exactly once, in the shared stack', () => {
  expect(
    [...registered.values()].flat().filter((name) => name === 'money-node'),
  ).toEqual(['money-node']);
  expect(registered.get('shared')).toContain('money-node');
  expect(existsSync(resolve(app, 'money-node.tsx'))).toBe(false);
});
test('the node redirect preserves every incoming parameter in the current tab', () => {
  const params = {
    node: 'party:Labor',
    jurisdiction: 'nsw',
    from: '2020',
    to: '2024',
    industry: 'unions',
    layers: ['receipts', 'contracts'],
    inflation: 'true',
    rid: 'org',
    jur: 'nsw',
    name: 'Money record',
  };
  jest.mocked(useLocalSearchParams).mockReturnValue(params);
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(React.createElement(LegacyMoneyNode));
  });
  expect(view.root.findByType(Redirect).props.href).toEqual({
    pathname: '/money-record',
    params,
  });
  act(() => view.unmount());
});
test('money-record keeps the working node screen as a pushed Money record page', () => {
  // The route draws the screen keyed on its record, so a link to another
  // record starts at its own top (sweep 2, item 11).
  jest.mocked(useLocalSearchParams).mockReturnValue({ node: 'party:Labor' });
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(React.createElement(MoneyRecord));
  });
  const screen = view.root.findByType(MoneyRecordScreen);
  expect(screen.parent).toBe(view.root);
  act(() => view.unmount());
  const registration = publicMoneyScreens().find(
    (screen) => screen.props.name === 'money-record',
  )!;
  const options = registration.props.options({ route: { params: {} } });
  expect(options.title).toBe('Money record');
  expect(options.presentation ?? 'card').toBe('card');
});
test('builders retain subject names and destination parameters', () => {
  expect(routes.personRoute('member', 'Member', 'changes').params).toEqual({
    slug: 'member',
    name: 'Member',
    section: 'changes',
  });
  expect(
    routes.billRoute('bill', 'Bill title', {
      division: 'vote',
      section: 'divisions',
    }).params,
  ).toEqual({
    key: 'bill',
    name: 'Bill title',
    division: 'vote',
    section: 'divisions',
  });
  expect(
    routes.resultsRoute('speech', {
      q: 'housing',
      group: 'speeches',
      scope: 'all',
      speaker: 'member',
    }).pathname,
  ).toBe('/results/[kind]');
  expect(routes.exploreQuizRoute('question').params).toMatchObject({
    tool: 'quiz',
    q: 'question',
  });
  expect(
    routes.moneyRecordRoute({ rid: 'org', jur: 'federal', node: 'party:Labor' })
      .params,
  ).toEqual({ rid: 'org', jur: 'federal', node: 'party:Labor' });
  expect(routes.todayFollowsRoute.pathname).toBe('/(tabs)/(today)/follows');
});
test('shared barrels and layouts delegate group registrations', () => {
  for (const file of ['routes.ts', 'external.ts']) {
    const source = readFileSync(
      resolve(__dirname, '../src/navigation', file),
      'utf8',
    );
    expect(source).not.toMatch(/pathname:\s*['"]|Stack.Screen/);
  }
  for (const file of ['_layout.tsx', `${sharedFolder}/_layout.tsx`])
    expect(readFileSync(resolve(app, file), 'utf8')).not.toContain(
      '<Stack.Screen',
    );
  for (const [, , file] of inventory) {
    const path = resolve(app, `${file}.tsx`);
    if (existsSync(path))
      expect(readFileSync(path, 'utf8')).not.toContain('features/ComingSoon');
  }
});

const builders = [
  ['shared', 'vic-election/index', routes.vicElectionRoute()],
  ['shared', 'vic-election/[district]', routes.vicSeatRoute('albert-park')],
  ['shared', 'edition', routes.editionRoute()],
  ['shared', 'members', routes.membersRoute('seat')],
  ['shared', 'election', routes.electionRoute('seat', 'key')],
  ['shared', 'electorate-date', routes.electorateDateRoute('seat')],
  ['shared', 'person/[slug]', routes.personRoute('member')],
  ['shared', 'person/[slug]/votes', routes.personVotesRoute('member')],
  ['shared', 'person/[slug]/speeches', routes.personSpeechesRoute('member')],
  ['shared', 'person/[slug]/interests', routes.personInterestsRoute('member')],
  ['shared', 'party-sources', routes.partySourcesRoute('party')],
  ['shared', 'party/[slug]', routes.partyRoute('Labor')],
  ['shared', 'bill-list', routes.billListRoute()],
  ['shared', 'bill/[key]', routes.billRoute('key')],
  [
    'shared',
    'record-list',
    routes.recordListRoute({ person: 'member', kind: 'speeches' }),
  ],
  ['shared', 'bill-text-contents/[key]', routes.billTextContentsRoute('key')],
  ['shared', 'results/[kind]', routes.resultsRoute('speech')],
  ['shared', 'ask', routes.askRoute({ question: '' })],
  ['shared', 'consent', routes.askConsentRoute],
  ['shared', 'conversations', routes.conversationsRoute],
  ['shared', 'ask-report', routes.askReportRoute('turn')],
  ['shared', 'money', routes.moneyRoute()],
  ['shared', 'money-node', routes.moneyNodeRoute('node')],
  ['shared', 'money-record', routes.moneyRecordRoute({ rid: 'org' })],
  ['shared', 'money-item', routes.moneyItemRoute({ id: 'record' })],
  ['shared', 'money-donors', routes.moneyDonorsRoute()],
  ['shared', 'funding-by-seat-type', routes.fundingBySeatTypeRoute],
  ['shared', 'agency-list', routes.agencyListRoute('agency', 'suppliers')],
  ['shared', 'connection', routes.connectionRoute('program')],
  ['account', 'ask', routes.askAccountRoute],
  ['account', 'consent', routes.voiceConsentRoute],
  ['account', 'sign-in/code', routes.signInCodeRoute()],
  ['account', 'delete/code', routes.deleteCodeRoute],
  ['account', 'coverage', routes.coverageRoute],
  ['account', 'methods', routes.methodsRoute],
  ['account', 'sources/datasets', routes.datasetsRoute],
  ['account', 'sources/dataset/[id]', routes.datasetRoute('dataset')],
  ['account', 'sources/portraits', routes.portraitsRoute],
  ['account', 'sources/photos', routes.photosRoute],
  ['account', 'sources/fonts', routes.fontsRoute],
  ['licence', '[id]', routes.licenceRoute('licence')],
  [
    'licence',
    'sources/[...path]',
    routes.licenceSourcesRoute(['dataset', 'id']),
  ],
  ['talk', 'index', routes.talkRoute],
  ['talk', 'consent', routes.talkConsentRoute],
  ['talk', 'sources', routes.talkSourcesRoute],
  ['talk', 'record', routes.talkRecordRoute],
  ['talk', 'sign-in', routes.talkSignInRoute],
  ['talk', 'sign-in/code', routes.talkSignInCodeRoute()],
  ['seat', 'index', routes.seatRoute()],
  ['seat', 'state/[code]', routes.seatStateRoute('vic')],
  ['welcome', 'index', routes.welcomeRoute()],
  ['welcome', 'seat/index', routes.welcomeSeatRoute()],
  ['welcome', 'seat/state/[code]', routes.welcomeSeatStateRoute('vic')],
  ['shared', 'explore/[tool]', routes.exploreQuizRoute('question')],
  ['shared', 'explore/photo', routes.explorePhotoRoute('1975', 'id')],
  ['shared', 'explore/tide-table', routes.exploreTideTableRoute()],
  ['shared', 'explore/years', routes.exploreYearsRoute()],
  ...(
    [
      'bills',
      'divisions',
      'directory',
      'declarations',
      'connections',
      'search',
      'money',
      'allocation',
    ] as const
  ).map((list) => ['shared', 'filters', routes.filtersRoute(list)] as const),
  ['root', 'source', routes.sourceRoute()],
  ['root', 'machine-note', routes.machineNoteRoute()],
  ['root', 'citation', routes.citationRoute()],
  ['root', 'rule', routes.ruleRoute()],
  ['root', 'licences', routes.licencesRoute],
] as const;
test.each(builders)(
  '%s builder for %s targets its registered screen',
  (kind, name, built) => {
    expect(registered.get(kind)).toContain(name);
    const prefix = kind === 'shared' || kind === 'root' ? '' : `/${kind}`;
    const path =
      name === 'index'
        ? prefix || '/'
        : `${prefix}/${name.replace(/\/index$/, '')}`;
    expect(built.pathname).toBe(name === 'filters' ? '/filters/[list]' : path);
    if (name === 'filters')
      expect(
        existsSync(resolve(app, `${sharedFolder}/filters/[list].tsx`)),
      ).toBe(true);
  },
);

test('sheet presentations and blank detail loading titles come from the owning modules', () => {
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(
      React.createElement(SharedLayout, { segment: '(ask)' }),
    );
  });
  const options = (name: string, params = {}) =>
    view.root
      .findAllByType(Stack.Screen)
      .find((node) => node.props.name === name)!
      .props.options({ route: { params } });
  expect(options('person/[slug]').title).toBe('');
  expect(options('person/[slug]', { name: 'Loaded name' }).title).toBe(
    'Loaded name',
  );
  expect(options('consent')).toMatchObject({
    presentation: 'formSheet',
    sheetAllowedDetents: 'fitToContents',
  });
  expect(options('ask-report')).toMatchObject({
    presentation: 'formSheet',
    sheetAllowedDetents: [0.5, 1],
  });
  expect(options('conversations')).toMatchObject({
    presentation: 'modal',
    headerShown: false,
  });
  expect(options('explore/photo')).toMatchObject({
    presentation: 'fullScreenModal',
  });
  expect(options('ask').headerLargeTitleEnabled).toBe(true);
  expect(options('money').headerLargeTitleEnabled).toBe(false);
  expect(
    options('money')
      .unstable_headerRightItems()
      .map((item: { label: string }) => item.label),
  ).toEqual(['Share', 'More']);
  expect(options('doc-cite/[slug]')).toMatchObject({
    sheetAllowedDetents: [0.5, 1],
    sheetInitialDetentIndex: 1,
    sheetExpandsWhenScrolledToEdge: true,
    headerTransparent: false,
  });
  act(() => view.unmount());
});

test('reference pages opened as the Account sheet root have Done', () => {
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(React.createElement(AccountLayout));
  });
  const options = view.root
    .findAllByType(Stack.Screen)
    .find((node) => node.props.name === 'methods')!.props.options;
  expect(
    options({
      route: {},
      navigation: { getState: () => ({ index: 0 }) },
    }).unstable_headerRightItems()[0],
  ).toMatchObject({ label: 'Done', variant: 'plain' });
  expect(
    options({ route: {}, navigation: { getState: () => ({ index: 1 }) } }),
  ).not.toHaveProperty('unstable_headerRightItems');
  act(() => view.unmount());
});
