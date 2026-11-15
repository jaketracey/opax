import { measureBarTitle } from './bar-title-metrics';
import { act } from 'react';
import { router, type NativeStackHeaderItem } from 'expo-router';
import TestRenderer from 'react-test-renderer';
import {
  Animated,
  Dimensions,
  Platform,
  SectionList,
  View,
  ScrollView,
} from 'react-native';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import DivisionHistory from '../src/features/directories/DivisionHistory';
import Members from '../src/features/your-mp/Members';
import Agencies from '../src/features/money-public/Agencies';
import Program from '../src/features/money-public/Program';
import { MoneyList, TitleAlias } from '../src/features/money-public/parts';
import { RouteOptions } from '../src/navigation/preview';
import { rootBackTitle } from '../src/navigation/stack/screen';
import { publicMoneyScreens } from '../src/navigation/stack/public-money';
import { billsScreens } from '../src/navigation/stack/bills';
import { catalogs } from '../src/api/runtime';
import { Screen, TitleAnchor } from '../src/design/layout';
import { Heading } from '../src/design/text';
import { loadDivisionHistory } from '../src/features/directories/division-data';
import {
  useNamedBackOptions,
  useNamedBackTitle,
} from '../src/navigation/useNamedBackOptions';
import {
  BarTitle,
  barTitleWidth,
  retreatBarTitle,
  barTitleCandidates,
  useTitleOnScroll,
} from '../src/navigation/useTitleOnScroll';
import { menuTitle } from '../src/design/menu-title';

const mockParams = { seat: 'federal-senate-nsw-new-south-wales' };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useSegments: () => [],
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { directory: jest.fn(), electorateFor: jest.fn() },
}));
jest.mock('../src/features/directories/division-data', () => ({
  loadDivisionHistory: jest.fn(),
}));
jest.mock('../src/features/money-public/runtime', () => ({
  money: {
    agencies: jest.fn(() => new Promise(() => {})),
    grants: jest.fn(() => new Promise(() => {})),
  },
}));

let view: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
  if (view) act(() => view!.unmount());
  view = undefined;
});

function nativeMeasurements() {
  const pending: Parameters<View['measure']>[0][] = [];
  const measure = jest.fn((done: Parameters<View['measure']>[0]) => {
    pending.push(done);
  });
  const node = { measure } as unknown as View;
  return {
    node,
    ref: { current: node } as React.RefObject<View | null>,
    measure,
    answer: (request: number, pageY: number, height = 80, width = 300) =>
      act(async () => {
        await Promise.resolve();
        pending[request]!(0, 0, width, height, 0, pageY);
      }),
  };
}

function navigationFor(...names: string[]) {
  const routes = names.map((name, i) => ({ name, key: `route-${i}` }));
  return {
    route: routes.at(-1)!,
    navigation: {
      getState: () => ({ index: routes.length - 1, routes }),
      setOptions: jest.fn(),
      isFocused: () => true,
      addListener: () => () => {},
    },
  };
}

test.each([
  [['index', 'explore/index', 'explore/[tool]'], 'Tools'],
  [['bills', 'bill/[key]', 'bill-text/[key]', 'division-history'], 'Back'],
  [['index', 'leads', 'lead/[id]', 'money-item'], 'Back'],
  [['index', 'explore/[tool]'], 'Today'],
  [['bills', 'bill/[key]'], 'Bills'],
  [['index', 'grants', 'grant-program'], 'Grants'],
  [['your-mp', 'members'], 'Your MP'],
  [['index', 'bill/[key]', 'bill-text/[key]'], 'Back'],
  [['index'], undefined],
] as const)('%j supplies the named back options %s', (names, title) => {
  const { route, navigation } = navigationFor(...names);
  let options: ReturnType<typeof useNamedBackOptions> = {};
  let backTitle: string | undefined;
  function Probe() {
    options = useNamedBackOptions();
    backTitle = useNamedBackTitle();
    return null;
  }
  act(() => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <Probe />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  expect(backTitle).toBe(title);
  expect(options).toEqual(
    title
      ? {
          headerBackButtonDisplayMode: 'default',
          headerBackTitle: title,
          headerBackButtonMenuEnabled: true,
        }
      : {},
  );
  const first = options;
  act(() => {
    view!.update(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <Probe />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  expect(options).toBe(first);
});

test('named back options leave Android to its native header', () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  let options: ReturnType<typeof useNamedBackOptions> | undefined;
  function Probe() {
    options = useNamedBackOptions();
    return null;
  }
  try {
    act(() => {
      view = TestRenderer.create(<Probe />);
    });
    expect(options).toEqual({});
  } finally {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: original,
    });
  }
});

test.each(['grants', 'money-record', 'largest-grants'])(
  '%s pushed from Grants reserves the Commonwealth grants pill drawn by its stack',
  (destination) => {
    const { route, navigation } = navigationFor('index', 'grants', destination);
    const options: Record<string, unknown> = {};
    navigation.setOptions.mockImplementation((next) =>
      Object.assign(options, next),
    );
    function Probe() {
      useTitleOnScroll({ current: null }, 'Destination');
      return null;
    }
    act(() => {
      view = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route}>
            <Probe />
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    const inline = (options.headerTitle as () => React.ReactElement)();
    expect(rootBackTitle(navigation, route.key)).toBe('Commonwealth grants');
    expect(inline.props.backTitle).toBe('Commonwealth grants');
    expect(
      barTitleWidth(402, 2, undefined, inline.props.backTitle, 160),
    ).toBeLessThan(barTitleWidth(402, 2, undefined, 'Grants', 50));
  },
);

test.each([
  ['grants', 'Grants'],
  ['largest-grants', 'Largest grants'],
  ['index', 'Today'],
])('Program from %s draws and reserves %s', async (previous, backTitle) => {
  const { route, navigation } = navigationFor(
    'index',
    previous,
    'grant-program',
  );
  const registration = publicMoneyScreens().find(
    (screen) => screen.props.name === 'grant-program',
  )!;
  const options: Record<string, unknown> = registration.props.options({
    route,
    navigation,
  });
  expect(options).toMatchObject({
    headerBackTitle: backTitle,
    headerBackButtonDisplayMode: 'default',
    headerBackButtonMenuEnabled: true,
  });
  navigation.setOptions.mockImplementation((next) =>
    Object.assign(options, next),
  );
  await act(async () => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <Program />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  expect(options).toMatchObject({
    headerBackTitle: backTitle,
    headerBackButtonDisplayMode: 'default',
  });
  expect(
    navigation.setOptions.mock.calls.every(
      ([next]) =>
        !Object.keys(next).some((key) => key.startsWith('headerBack')),
    ),
  ).toBe(true);
  // No subject has arrived, so the stack's empty title view remains installed.
  expect(options.title).toBe('');
  expect(typeof options.headerTitle).toBe('function');
});

test('Agencies keeps the Government agencies title in the page so it can wrap', async () => {
  await act(async () => {
    view = TestRenderer.create(<Agencies />);
  });
  const options = view!.root.findByType(RouteOptions).props.options;
  expect(options).toMatchObject({
    title: 'Government agencies',
    headerSearchBarOptions: { placement: 'stacked' },
  });
  // Sweep 2: the system large title cannot wrap, so the page draws its own.
  expect(options.headerLargeTitleEnabled).not.toBe(true);
  expect(options).not.toHaveProperty('headerTitle');
  const list = view!.root.findByType(MoneyList);
  expect(typeof list.props.onScroll).toBe('function');
  const heading = view!.root
    .findAllByType(Heading)
    .find((h) => h.props.testID === 'agencies-title')!;
  expect(heading.props).toMatchObject({
    level: 1,
    kind: 'page',
    children: 'Government agencies',
  });
  expect(view!.root.findAllByType(TitleAlias)).toHaveLength(0);
});

test('Votes keeps Filters before More, its named back button and its scrolling title', async () => {
  jest.mocked(loadDivisionHistory).mockResolvedValue({
    rows: [],
    loaded: 0,
    total: 0,
    failed: 0,
    asAt: '2026-11-10',
    stale: false,
    savedAt: 1,
    partial: false,
  });
  const { route, navigation } = navigationFor(
    'bills',
    'bill/[key]',
    'bill-text/[key]',
    'division-history',
  );
  const registration = billsScreens().find(
    (screen) => screen.props.name === 'division-history',
  )!;
  const options: Record<string, unknown> = registration.props.options({
    route,
    navigation,
  });
  expect(options).toMatchObject({
    headerBackTitle: 'Back',
    headerBackButtonDisplayMode: 'default',
    headerBackButtonMenuEnabled: true,
  });
  navigation.setOptions.mockImplementation((next) =>
    Object.assign(options, next),
  );
  await act(async () => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <DivisionHistory />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  expect(options).toMatchObject({
    title: 'Votes in parliament',
    headerBackTitle: 'Back',
    headerBackButtonDisplayMode: 'default',
  });
  const items = (
    options.unstable_headerRightItems as () => NativeStackHeaderItem[]
  )();
  expect(items.map((item) => 'label' in item && item.label)).toEqual([
    'Filters',
    'More',
  ]);
  const filters = items[0] as Extract<
    NativeStackHeaderItem,
    { type: 'button' }
  >;
  expect(filters).toMatchObject({
    accessibilityLabel: 'Filters',
    disabled: false,
    identifier: 'division-history-filters',
  });
  act(() => filters.onPress?.());
  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: '/filters/[list]',
      params: expect.objectContaining({ list: 'divisions' }),
    }),
  );
  expect(items[1]).toMatchObject({
    type: 'menu',
    accessibilityLabel: 'More for Votes in parliament',
    menu: {
      items: [
        expect.objectContaining({ label: 'Copy link' }),
        expect.objectContaining({ label: menuTitle('Open on opax.com.au') }),
      ],
    },
  });
  const inline = () => (options.headerTitle as () => React.ReactElement)();
  expect(inline().type).toBe(BarTitle);
  expect(inline().props.shown).toBe(false);
  expect(inline().props.backTitle).toBe('Back');
  const list = view!.root.findByType(SectionList);
  const heading = list.props.ListHeaderComponent.props.children[0];
  expect(heading.props.collapsable).toBe(false);
  const native = nativeMeasurements();
  heading.props.ref.current.measure = native.measure;
  act(() =>
    heading.props.onLayout({ nativeEvent: { layout: { y: 0, height: 60 } } }),
  );
  expect(native.measure).not.toHaveBeenCalled();
  expect(inline().props.shown).toBe(false);
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: -44 } } }),
  );
  await native.answer(0, 140, 60);
  expect(inline().props.shown).toBe(false);
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: -800 } } }),
  );
  // Window coordinates already include the native scroll, even though the
  // JS offset still looks like a negative resting inset.
  await native.answer(1, -20, 60);
  expect(inline().props.shown).toBe(true);
  expect(inline().props.backTitle).toBe('Back');
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: 9000 } } }),
  );
  await native.answer(2, 140, 60);
  expect(inline().props.shown).toBe(false);
});

test('the NSW Members route reveals Senators from asynchronous window coordinates', async () => {
  jest.mocked(catalogs.directory).mockResolvedValue({
    electorates: {
      data: {
        electorates: [
          {
            electorate_id: mockParams.seat,
            slug: mockParams.seat,
            name: 'New South Wales',
            state_code: 'NSW',
            jurisdiction: 'federal',
            chamber: 'senate',
            representatives: [],
            detail_url: '/electorates/nsw.json',
            url: 'https://www.aph.gov.au/Senators_and_Members/Senators',
          },
        ],
      },
      stale: false,
    },
  } as never);
  jest
    .mocked(catalogs.electorateFor)
    .mockResolvedValue({ data: { terms: [] } } as never);
  const { route, navigation } = navigationFor('your-mp', 'members');
  const options: Record<string, unknown> = {};
  navigation.setOptions.mockImplementation((next) =>
    Object.assign(options, next),
  );
  await act(async () => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <HeaderHeightContext.Provider value={100}>
            <Members />
          </HeaderHeightContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  const screen = view!.root.findByType(Screen);
  const heading = screen.props.children[0].props.children[0];
  const native = nativeMeasurements();
  heading.props.ref.current.measure = native.measure;
  const inline = () => (options.headerTitle as () => React.ReactElement)();
  expect(inline().props).toMatchObject({
    title: 'Senators',
    shown: false,
    backTitle: 'Your MP',
  });
  act(() => heading.props.onLayout(headingLayout));
  expect(native.measure).not.toHaveBeenCalled();
  act(() => screen.props.onScroll(10000));
  await native.answer(0, 120);
  expect(inline().props.shown).toBe(false);
  act(() => screen.props.onScroll(-1000));
  await native.answer(1, 10);
  expect(inline().props).toMatchObject({ title: 'Senators', shown: true });
  act(() => screen.props.onScroll(20000));
  await native.answer(2, 200);
  expect(inline().props.shown).toBe(false);
});

function scrollTitle(ref: React.RefObject<View | null> | null) {
  let hook!: ReturnType<typeof useTitleOnScroll>;
  const options: Record<string, unknown> = {};
  const setOptions = jest.fn((next) => Object.assign(options, next));
  function Probe() {
    hook = useTitleOnScroll(ref, 'Votes in parliament');
    return null;
  }
  act(() => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={{ setOptions } as never}>
        <HeaderHeightContext.Provider value={100}>
          <Probe />
        </HeaderHeightContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  return {
    hook: {
      onTitleLayout: (...args: Parameters<typeof hook.onTitleLayout>) =>
        hook.onTitleLayout(...args),
      onScroll: (...args: Parameters<typeof hook.onScroll>) =>
        hook.onScroll(...args),
      setAnchorBottom: (...args: Parameters<typeof hook.setAnchorBottom>) =>
        hook.setAnchorBottom(...args),
    },
    inline: () => (options.headerTitle as () => React.ReactElement)(),
    header: () => options.headerTitle,
    setOptions,
  };
}

const headingLayout = {
  nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 80 } },
} as never;

test('Screen.barTitle measures an anchored heading, including when it is inside a custom component', async () => {
  const native = nativeMeasurements();
  const { route, navigation } = navigationFor('index', 'person/[slug]');
  const options: Record<string, unknown> = {};
  navigation.setOptions.mockImplementation((next) =>
    Object.assign(options, next),
  );
  function ProfileName() {
    return (
      <TitleAnchor>
        <Heading level={1}>Anthony Albanese</Heading>
      </TitleAnchor>
    );
  }
  act(() => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <HeaderHeightContext.Provider value={100}>
            <Screen barTitle="Anthony Albanese">
              <ProfileName />
            </Screen>
          </HeaderHeightContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  const anchor = view!.root.findByType(TitleAnchor).findByType(View);
  expect(anchor.props.collapsable).toBe(false);
  act(() => anchor.props.ref(native.node));
  const inline = () => (options.headerTitle as () => React.ReactElement)();
  expect(inline().props).toMatchObject({ shown: false, backTitle: 'Today' });
  expect(native.measure).not.toHaveBeenCalled();
  const scroll = (y: number) =>
    act(() =>
      view!.root
        .findByType(ScrollView)
        .props.onScroll({ nativeEvent: { contentOffset: { y } } }),
    );
  scroll(9000);
  await native.answer(0, 150);
  expect(inline().props.shown).toBe(false);
  scroll(-900);
  // The first half is under the bar; the bottom line remains visible.
  await native.answer(1, 50, 100);
  expect(inline().props.shown).toBe(true);
  scroll(9000);
  await native.answer(2, 150);
  expect(inline().props.shown).toBe(false);
});

test.each([
  [
    'Short title',
    90,
    200,
    { 'Short title': 80 },
    false,
    'Short title',
    'default',
  ],
  [
    'Whole subject',
    90,
    200,
    { 'Whole subject': 150 },
    false,
    'Whole subject',
    'minimal',
  ],
  [
    'Interactive Games Amendment Bill',
    90,
    200,
    {
      'Interactive Games Amendment Bill': 330,
      'Interactive Games Amendment…': 260,
      'Interactive Games…': 180,
    },
    false,
    'Interactive Games…',
    'minimal',
  ],
  [
    'A very long subject',
    40,
    80,
    { 'A very long subject': 200, 'A very long…': 120, 'A very…': 90 },
    false,
    null,
    'minimal',
  ],
  [
    'Alexandra Sample',
    40,
    80,
    { 'Alexandra Sample': 200, Sample: 70 },
    true,
    'Sample',
    'minimal',
  ],
  [
    'Alexandra Sample',
    40,
    60,
    { 'Alexandra Sample': 200, Sample: 70 },
    true,
    null,
    'minimal',
  ],
] as const)(
  'title-first retreat for %s',
  (title, named, minimal, widths, person, text, mode) => {
    expect(
      retreatBarTitle(
        title,
        named,
        minimal,
        (text) => (widths as Record<string, number>)[text],
        person,
      ),
    ).toMatchObject({ text, mode });
  },
);

test('cuts keep two words and people offer only their family name', () => {
  expect(barTitleCandidates('Interactive Games Amendment Bill')).toEqual([
    'Interactive Games Amendment Bill',
    'Interactive Games Amendment…',
    'Interactive Games…',
  ]);
  expect(barTitleCandidates('Alexandra Sample', true)).toEqual([
    'Alexandra Sample',
    'Sample',
  ]);
});

test.each([
  ['Alexandra Sample', true, { 'Alexandra Sample': 300, Sample: 70 }, 'Sample'],
  [
    'Interactive Games Amendment Bill',
    false,
    {
      'Interactive Games Amendment Bill': 330,
      'Interactive Games Amendment…': 280,
      'Interactive Games…': 180,
    },
    'Interactive Games…',
  ],
])(
  'native measurements retain the full VoiceOver title: %s',
  (title, person, widths, expected) => {
    const original = Dimensions.get('window');
    act(() =>
      Dimensions.set({ window: { ...original, width: 402, fontScale: 1 } }),
    );
    const navigation = { setOptions: jest.fn() };
    act(() => {
      view = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <BarTitle title={title} person={person} shown backTitle="Today" />
        </NavigationContext.Provider>,
      );
    });
    measureBarTitle(view!, widths);
    expect(view!.root.findByType(Animated.Text).props).toMatchObject({
      children: expected,
      accessibilityLabel: title,
      accessibilityElementsHidden: false,
    });
    expect(navigation.setOptions).toHaveBeenLastCalledWith({
      headerBackButtonDisplayMode: 'minimal',
    });
    act(() => Dimensions.set({ window: original }));
  },
);

test('iOS compares asynchronous window measurements without using the JS scroll offset', async () => {
  const native = nativeMeasurements();
  const { hook, inline, setOptions } = scrollTitle(native.ref);
  const restingTitle = setOptions.mock.calls.at(-1)![0]
    .headerTitle as () => React.ReactElement;
  setOptions.mockClear();
  act(() => hook.onTitleLayout(headingLayout));
  expect(native.measure).not.toHaveBeenCalled();
  expect(inline().props.shown).toBe(false);
  expect(setOptions).not.toHaveBeenCalled();

  act(() => hook.onScroll(5000));
  expect(inline().props.shown).toBe(false);
  await native.answer(0, 120);
  expect(inline().props.shown).toBe(false);
  expect(setOptions).not.toHaveBeenCalled();

  act(() => hook.onScroll(-900));
  await native.answer(1, 20);
  expect(inline().props.shown).toBe(true);
  expect(restingTitle().props.shown).toBe(false);
  expect(setOptions).toHaveBeenCalledTimes(1);

  act(() => hook.onScroll(-1000));
  await native.answer(2, -400);
  expect(native.measure).toHaveBeenCalledTimes(3);
  expect(setOptions).toHaveBeenCalledTimes(1);

  act(() => hook.onScroll(9000));
  await native.answer(3, 120);
  expect(inline().props.shown).toBe(false);
  expect(setOptions).toHaveBeenCalledTimes(2);
});

test('only the newest asynchronous measurement can change visibility', async () => {
  const native = nativeMeasurements();
  const { hook, inline } = scrollTitle(native.ref);
  act(() => {
    hook.onScroll(-100);
    hook.onScroll(-200);
  });
  expect(native.measure).toHaveBeenCalledTimes(2);
  await native.answer(1, 10);
  expect(inline().props.shown).toBe(true);
  await native.answer(0, 200);
  expect(inline().props.shown).toBe(true);

  act(() => {
    hook.onScroll(10000);
    hook.onScroll(-4000);
  });
  await native.answer(3, 200);
  expect(inline().props.shown).toBe(false);
  await native.answer(2, -400);
  expect(inline().props.shown).toBe(false);
});

test.each([
  [NaN, 80, 300],
  [Infinity, 80, 300],
  [20, NaN, 300],
  [20, Infinity, 300],
  [20, 0, 300],
  [20, -1, 300],
  [20, 80, NaN],
])(
  'invalid window measurement (%j, %j, %j) preserves visibility',
  async (pageY, height, width) => {
    const native = nativeMeasurements();
    const { hook, inline, setOptions } = scrollTitle(native.ref);
    setOptions.mockClear();
    act(() => hook.onScroll(5000));
    await native.answer(0, pageY, height, width);
    expect(inline().props.shown).toBe(false);
    expect(setOptions).not.toHaveBeenCalled();

    act(() => hook.onScroll(-500));
    await native.answer(1, 10);
    expect(inline().props.shown).toBe(true);
    setOptions.mockClear();
    act(() => hook.onScroll(9000));
    await native.answer(2, pageY, height, width);
    expect(inline().props.shown).toBe(true);
    expect(setOptions).not.toHaveBeenCalled();
  },
);

test.each([
  [61, true],
  [61.1, false],
])(
  'a mostly hidden heading has 1 pt tolerance at pageY %s',
  async (pageY, expected) => {
    const native = nativeMeasurements();
    const { hook, inline } = scrollTitle(native.ref);
    act(() => hook.onScroll(-1000));
    await native.answer(0, pageY);
    expect(inline().props.shown).toBe(expected);
  },
);

test('relayout mid-scroll keeps the shown title while a fresh window measurement is pending', async () => {
  const native = nativeMeasurements();
  const { hook, inline, setOptions } = scrollTitle(native.ref);
  act(() => hook.onScroll(-900));
  await native.answer(0, 10);
  expect(inline().props.shown).toBe(true);
  setOptions.mockClear();

  act(() => hook.onTitleLayout(headingLayout));
  expect(native.measure).toHaveBeenCalledTimes(2);
  expect(inline().props.shown).toBe(true);
  expect(setOptions).not.toHaveBeenCalled();
  await native.answer(1, -20);
  expect(inline().props.shown).toBe(true);
  expect(setOptions).not.toHaveBeenCalled();

  act(() => hook.onTitleLayout(headingLayout));
  expect(inline().props.shown).toBe(true);
  await native.answer(2, 200);
  expect(inline().props.shown).toBe(false);
});

test('a virtualised heading keeps its revealed title and invalidates the old node’s response', async () => {
  const native = nativeMeasurements();
  const { hook, inline } = scrollTitle(native.ref);
  act(() => hook.onScroll(-1000));
  await native.answer(0, 10);
  expect(inline().props.shown).toBe(true);

  act(() => hook.onScroll(9000));
  native.ref.current = null;
  act(() => hook.onScroll(-2000));
  await native.answer(1, 200);
  expect(inline().props.shown).toBe(true);

  const replacement = nativeMeasurements();
  native.ref.current = replacement.node;
  act(() => hook.onTitleLayout(headingLayout));
  await replacement.answer(0, 200);
  expect(inline().props.shown).toBe(false);
});

test('a replaced heading cannot block later measurements, even if its old request never answers', async () => {
  const native = nativeMeasurements();
  const { hook, inline } = scrollTitle(native.ref);
  act(() => hook.onScroll(-100));
  const replacement = nativeMeasurements();
  native.ref.current = replacement.node;
  act(() => hook.onTitleLayout(headingLayout));
  expect(replacement.measure).toHaveBeenCalledTimes(1);
  await replacement.answer(0, 10);
  expect(inline().props.shown).toBe(true);
  await native.answer(0, 200);
  expect(inline().props.shown).toBe(true);
  act(() => hook.onScroll(5000));
  await replacement.answer(1, 200);
  expect(inline().props.shown).toBe(false);
});

test('an unmounted heading cannot install a late title', async () => {
  const native = nativeMeasurements();
  const { hook, setOptions } = scrollTitle(native.ref);
  act(() => hook.onScroll(-1000));
  act(() => view!.unmount());
  view = undefined;
  setOptions.mockClear();
  await native.answer(0, 10);
  expect(setOptions).not.toHaveBeenCalled();
});

test('Screen-provided content anchors keep the baseline threshold', () => {
  const { hook, inline } = scrollTitle(null);
  act(() => hook.setAnchorBottom(200));
  act(() => hook.onScroll(99));
  expect(inline().props.shown).toBe(false);
  act(() => hook.onScroll(101));
  expect(inline().props.shown).toBe(true);
  act(() => hook.onScroll(0));
  expect(inline().props.shown).toBe(false);
});

test('Android pushed bars keep a small title visible across scroll positions', async () => {
  const original = Platform.OS;
  try {
    Platform.OS = 'android';
    const native = nativeMeasurements();
    const { hook, header } = scrollTitle(native.ref);
    act(() => hook.onTitleLayout(headingLayout));
    expect(native.measure).toHaveBeenCalledTimes(1);
    await native.answer(0, 200);
    act(() => hook.onScroll(179));
    expect(header()).toBe('Votes in parliament');
    act(() => hook.onScroll(181));
    expect(header()).toBe('Votes in parliament');
    act(() => hook.onScroll(0));
    expect(header()).toBe('Votes in parliament');
    act(() => view!.unmount());
    view = undefined;
  } finally {
    Platform.OS = original;
  }
});

test('Android Screen.barTitle stays visible while its content anchor scrolls', () => {
  const original = Platform.OS;
  Platform.OS = 'android';
  const options: Record<string, unknown> = {};
  const navigation = {
    setOptions: (next: object) => Object.assign(options, next),
    isFocused: () => true,
    addListener: () => () => {},
  };
  try {
    act(() => {
      view = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <HeaderHeightContext.Provider value={100}>
            <Screen barTitle="Members">
              <Heading level={1}>Members</Heading>
            </Screen>
          </HeaderHeightContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    const anchor = view!.root.findByType(TitleAnchor).findByType(View);
    act(() => {
      anchor.props.ref({
        measureLayout: (
          _parent: unknown,
          done: (...values: number[]) => void,
        ) => done(0, 160, 300, 80),
      });
      anchor.props.onLayout(headingLayout);
    });
    expect(options.headerTitle).toBe('Members');
    const scroll = (y: number) =>
      act(() =>
        view!.root
          .findByType(ScrollView)
          .props.onScroll({ nativeEvent: { contentOffset: { y } } }),
      );
    scroll(155);
    expect(options.headerTitle).toBe('Members');
    scroll(157);
    expect(options.headerTitle).toBe('Members');
    scroll(0);
    expect(options.headerTitle).toBe('Members');
    act(() => view!.unmount());
    view = undefined;
  } finally {
    Platform.OS = original;
  }
});

test.each([
  [402, 1, 266],
  [402, 2, 146],
  [402, 3, 26],
  [375, 1, 239],
  [375, 2, 119],
  [1024, 1, 512],
])(
  'existing bar widths stay unchanged at %i pt with %i items',
  (width, trailing, expected) => {
    expect(barTitleWidth(width, trailing)).toBe(expected);
    expect(barTitleWidth(width, trailing, undefined)).toBe(expected);
    expect(barTitleWidth(width, trailing, undefined, undefined)).toBe(expected);
  },
);

test('named back space uses the supplied native font advance', () => {
  expect(barTitleWidth(402, 2, undefined, 'Subject', 40)).toBe(138);
  expect(barTitleWidth(402, 2, undefined, 'Subject', 90)).toBe(88);
  expect(barTitleWidth(402, 2, undefined, '')).toBe(206);
});

test('the Version pill is measured independently of the back name', () => {
  expect(barTitleWidth(402, 2, 164, 'Bills', 36)).toBe(82);
  expect(barTitleWidth(200, 2, 164, 'Bills', 36)).toBe(0);
  expect(barTitleWidth(1024, 2, 164, 'Bills', 36)).toBe(512);
});

test.each([
  [
    'Short subject',
    false,
    { 'Short subject': 100 },
    'Short subject',
    'default',
  ],
  [
    'Whole subject',
    false,
    { 'Whole subject': 170 },
    'Whole subject',
    'minimal',
  ],
  [
    'Long subject with clause',
    false,
    {
      'Long subject with clause': 300,
      'Long subject with…': 260,
      'Long subject…': 180,
    },
    'Long subject…',
    'minimal',
  ],
  [
    'First Second Third',
    false,
    { 'First Second Third': 400, 'First Second…': 300 },
    null,
    'minimal',
  ],
  [
    'Alexandra Sample',
    true,
    { 'Alexandra Sample': 300, Sample: 70 },
    'Sample',
    'minimal',
  ],
] as const)(
  'native title retreat installs the back mode for %s',
  (title, person, widths, expected, mode) => {
    const original = Dimensions.get('window');
    act(() =>
      Dimensions.set({ window: { ...original, width: 402, fontScale: 1 } }),
    );
    const navigation = { setOptions: jest.fn() };
    act(() => {
      view = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <BarTitle title={title} person={person} shown backTitle="Today" />
        </NavigationContext.Provider>,
      );
    });
    measureBarTitle(view!, { Today: 35, ...widths });
    const text = view!.root.findByType(Animated.Text);
    expect(text.props.accessibilityLabel).toBe(title);
    expect(text.props.accessibilityElementsHidden).toBe(expected === null);
    if (expected) expect(text.props.children).toBe(expected);
    expect(navigation.setOptions).toHaveBeenLastCalledWith({
      headerBackButtonDisplayMode: mode,
    });
    act(() =>
      view!.update(
        <NavigationContext.Provider value={navigation as never}>
          <BarTitle
            title={title}
            person={person}
            shown={false}
            backTitle="Today"
          />
        </NavigationContext.Provider>,
      ),
    );
    expect(navigation.setOptions).toHaveBeenLastCalledWith({
      headerBackButtonDisplayMode: 'default',
    });
    act(() => Dimensions.set({ window: original }));
  },
);
