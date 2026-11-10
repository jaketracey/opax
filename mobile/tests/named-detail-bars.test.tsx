import { act } from 'react';
import { router, type NativeStackHeaderItem } from 'expo-router';
import TestRenderer from 'react-test-renderer';
import {
  Animated,
  Dimensions,
  Platform,
  SectionList,
  StyleSheet,
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
  backPillWidth,
  barTitleWidth,
  minimumBarTitleWidth,
  shortenBarTitle,
  useTitleOnScroll,
} from '../src/navigation/useTitleOnScroll';

const mockParams = { seat: 'federal-senate-nsw-new-south-wales' };
jest.mock('expo-router', () => ({
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
  [['bills', 'bill/[key]', 'bill-text/[key]', 'division-history'], 'Bill text'],
  [['index', 'leads', 'lead/[id]', 'money-item'], 'Lead'],
  [['index', 'explore/[tool]'], 'Today'],
  [['bills', 'bill/[key]'], 'Bills'],
  [['index', 'grants', 'grant-program'], 'Commonwealth grants'],
  [['your-mp', 'members'], 'Your MP'],
  [['index', 'bill/[key]', 'bill-text/[key]'], undefined],
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
  expect(options).toEqual({
    headerBackButtonDisplayMode: 'default',
    ...(title ? { headerBackTitle: title } : {}),
    ...(['Tools', 'Bill text', 'Lead'].includes(title ?? '')
      ? { headerBackButtonMenuEnabled: false }
      : {}),
  });
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
      barTitleWidth(402, 2, undefined, inline.props.backTitle),
    ).toBeLessThan(barTitleWidth(402, 2, undefined, 'Grants'));
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
  const options: Record<string, unknown> = {};
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
  if (previous === 'grants')
    expect(options.headerBackButtonMenuEnabled).toBe(false);
  const inline = (options.headerTitle as () => React.ReactElement)();
  expect(inline.props).toMatchObject({
    backTitle,
    trailing: 1,
    shown: false,
  });
});

test('Agencies restores the system Government agencies title and its alias', async () => {
  await act(async () => {
    view = TestRenderer.create(<Agencies />);
  });
  expect(view!.root.findByType(RouteOptions).props.options).toMatchObject({
    title: 'Government agencies',
    headerLargeTitleEnabled: true,
    headerSearchBarOptions: { placement: 'stacked' },
  });
  expect(view!.root.findByType(RouteOptions).props.options).not.toHaveProperty(
    'headerTitle',
  );
  const list = view!.root.findByType(MoneyList);
  expect(typeof list.props.onScroll).toBe('function');
  const alias = list.props.header.props.children[0];
  expect(alias.type).toBe(TitleAlias);
  expect(alias.props).toEqual({
    title: 'Government agencies',
    testID: 'agencies-title',
  });
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
  const options: Record<string, unknown> = {};
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
    headerBackTitle: 'Bill text',
    headerBackButtonDisplayMode: 'default',
    headerBackButtonMenuEnabled: false,
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
        expect.objectContaining({ label: 'Open on opax.com.au' }),
      ],
    },
  });
  const inline = () => (options.headerTitle as () => React.ReactElement)();
  expect(inline().type).toBe(BarTitle);
  expect(inline().props.shown).toBe(false);
  expect(inline().props.backTitle).toBe('Bill text');
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
  expect(inline().props.backTitle).toBe('Bill text');
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
  ['Votes in parliament', 'A bill name', 1],
  ['Bills', 'A bill name', 3],
  ['Bills', 'Supercalifragilisticexpialidocious Act', 1],
] as const)(
  'an undersized title stays laid out and hidden beside %s at scale %s',
  (backTitle, title, fontScale) => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    try {
      act(() => {
        Dimensions.set({
          window: { ...originalWindow, width: 402, fontScale },
          screen: { ...originalScreen, width: 402 },
        });
        view = TestRenderer.create(
          <BarTitle title={title} shown backTitle={backTitle} />,
        );
      });
      const text = view!.root.findByType(Animated.Text);
      const style = StyleSheet.flatten(text.props.style);
      expect(style.maxWidth).toBeLessThan(
        minimumBarTitleWidth(title, fontScale),
      );
      expect(style.opacity).toBe(0);
      expect(text.props.children).toBe(title);
      expect(text.props.accessibilityElementsHidden).toBe(true);
      expect(text.props.importantForAccessibility).toBe('no-hide-descendants');
    } finally {
      act(() =>
        Dimensions.set({ window: originalWindow, screen: originalScreen }),
      );
    }
  },
);

test('the useful minimum includes a whole first word and the capped text scale', () => {
  expect(minimumBarTitleWidth('A bill')).toBe(60);
  expect(minimumBarTitleWidth('Commonwealth grants')).toBeGreaterThan(100);
  expect(minimumBarTitleWidth('Members', 3)).toBe(
    Math.ceil(minimumBarTitleWidth('Members') * (23 / 17)),
  );
});

test('bar title shortening keeps a whole title that fits', () => {
  expect(shortenBarTitle('Anthony Albanese', 150)).toBe('Anthony Albanese');
});

test('bar title shortening keeps the longest leading whole words with an ellipsis', () => {
  expect(shortenBarTitle('Anthony Albanese', 125)).toBe('Anthony…');
  expect(shortenBarTitle('Digital Transformation Agency', 225)).toBe(
    'Digital Transformation…',
  );
});

test('bar title shortening hides a first word that cannot fit', () => {
  expect(
    shortenBarTitle('Commonwealth Home Support Programme', 100),
  ).toBeNull();
});

test('bar title shortening reserves the full ellipsis advance', () => {
  expect(shortenBarTitle('Anthony Albanese MP', 159)).toBe('Anthony…');
  expect(shortenBarTitle('Anthony Albanese MP', 160)).toBe('Anthony Albanese…');
});

test('bar title shortening scales its advances and caps a large font scale', () => {
  expect(shortenBarTitle('Anthony Albanese', 150, 1)).toBe('Anthony Albanese');
  expect(shortenBarTitle('Anthony Albanese', 150, 3)).toBe('Anthony…');
  expect(shortenBarTitle('Anthony Albanese', 150, 3)).toBe(
    shortenBarTitle('Anthony Albanese', 150, 23 / 17),
  );
  expect(shortenBarTitle('Anthony Albanese', 100, 3)).toBeNull();
});

test('a shortened bar title exposes the full accessibility label', () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');
  try {
    act(() => {
      Dimensions.set({
        window: { ...originalWindow, width: 402, fontScale: 1 },
        screen: { ...originalScreen, width: 402 },
      });
      view = TestRenderer.create(
        <BarTitle title="Anthony Albanese" shown backTitle="Today" />,
      );
    });
    expect(view!.root.findByType(Animated.Text).props).toMatchObject({
      children: 'Anthony…',
      accessibilityLabel: 'Anthony Albanese',
      accessibilityElementsHidden: false,
      ellipsizeMode: 'clip',
    });
  } finally {
    act(() =>
      Dimensions.set({ window: originalWindow, screen: originalScreen }),
    );
  }
});

test.each([false, true])(
  'an unknown back title leaves the title at its intrinsic width, shown=%s',
  (shown) => {
    const { route, navigation } = navigationFor('index', 'leads', 'lead/[id]');
    let backTitle: string | undefined;
    function Probe() {
      backTitle = useNamedBackTitle();
      return (
        <BarTitle
          title="Lead"
          shown={shown}
          trailing={1}
          backTitle={backTitle}
        />
      );
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
    expect(backTitle).toBeUndefined();
    const text = view!.root.findByType(Animated.Text);
    const style = StyleSheet.flatten(text.props.style);
    expect(style.width).toBeUndefined();
    expect(style.textAlign).toBeUndefined();
    expect(style.maxWidth).toBeGreaterThan(0);
    expect(text.props.children).toBe('Lead');
    expect(text.props.accessibilityElementsHidden).toBe(!shown);
  },
);

test('Program has room for Commonwealth at Large with Grants and More', () => {
  const fontScale = 1.118;
  const room = barTitleWidth(402, 1, undefined, 'Grants', fontScale);
  expect(room).toBeGreaterThanOrEqual(
    minimumBarTitleWidth('Commonwealth Home Support Programme', fontScale),
  );
});

test('People fits as a whole word beside Search, Filters and More at Large', () => {
  const fontScale = 1.118;
  expect(
    barTitleWidth(402, 2, undefined, 'Search', fontScale),
  ).toBeGreaterThanOrEqual(minimumBarTitleWidth('People', fontScale));
});

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

test('Android keeps its baseline content-coordinate measurement and string title', async () => {
  const original = Platform.OS;
  try {
    Platform.OS = 'android';
    const native = nativeMeasurements();
    const { hook, header } = scrollTitle(native.ref);
    act(() => hook.onTitleLayout(headingLayout));
    expect(native.measure).toHaveBeenCalledTimes(1);
    await native.answer(0, 200);
    act(() => hook.onScroll(179));
    expect(header()).toBe('');
    act(() => hook.onScroll(181));
    expect(header()).toBe('Votes in parliament');
    act(() => hook.onScroll(0));
    expect(header()).toBe('');
    act(() => view!.unmount());
    view = undefined;
  } finally {
    Platform.OS = original;
  }
});

test('Android Screen.barTitle keeps its content anchor rather than measuring window coordinates', () => {
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
    expect(options.headerTitle).toBe('');
    const scroll = (y: number) =>
      act(() =>
        view!.root
          .findByType(ScrollView)
          .props.onScroll({ nativeEvent: { contentOffset: { y } } }),
      );
    scroll(155);
    expect(options.headerTitle).toBe('');
    scroll(157);
    expect(options.headerTitle).toBe('Members');
    scroll(0);
    expect(options.headerTitle).toBe('');
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

test.each([
  ['Bills', 84],
  ['Lead', 90],
  ['Leads', 93],
  ['Today', 94],
  ['Bill text', 110],
  ['Your MP', 117],
] as const)(
  '%s back pill rounds up from the device width of %i pt',
  (title, measured) => {
    const estimate = backPillWidth(title);
    expect(estimate).toBeGreaterThanOrEqual(measured);
    expect(estimate).toBeLessThanOrEqual(measured + 6);
    expect(Number.isInteger(estimate)).toBe(true);
  },
);

test.each([
  ['Lead', undefined, 136],
  ['Bill text', undefined, 116],
  ['Bills', 164, 82],
  ['Your MP', undefined, 109],
] as const)(
  '%s back name with %s pt trailing items leaves about %i pt on a 402 pt iPhone',
  (backTitle, trailingWidth, expected) => {
    const room = barTitleWidth(402, 2, trailingWidth, backTitle);
    expect(room).toBeGreaterThan(0);
    expect(Math.abs(room - expected)).toBeLessThanOrEqual(4);
  },
);

test.each([
  [200, 2, 164, 'Bills', 0],
  [1024, 2, 164, 'Bills', 512],
] as const)(
  '%i pt with %i items (%s pt) leaves room for back name %s',
  (width, trailing, trailingWidth, backTitle, expected) => {
    expect(barTitleWidth(width, trailing, trailingWidth, backTitle)).toBe(
      expected,
    );
  },
);

test('the Version pill and Bills back name leave the title laid out at rest and revealed on a 402 pt iPhone', () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');
  try {
    act(() => {
      Dimensions.set({
        window: { ...originalWindow, width: 402, fontScale: 1 },
        screen: { ...originalScreen, width: 402 },
      });
      view = TestRenderer.create(
        <BarTitle
          title="Bill name"
          shown
          trailing={2}
          trailingWidth={120 + 44}
          backTitle="Bills"
        />,
      );
    });
    const text = () => view!.root.findByType(Animated.Text);
    expect(StyleSheet.flatten(text().props.style).maxWidth).toBe(82);
    expect(StyleSheet.flatten(text().props.style).width).toBeUndefined();
    expect(StyleSheet.flatten(text().props.style).opacity.__getValue()).toBe(1);
    expect(text().props).toMatchObject({
      numberOfLines: 1,
      ellipsizeMode: 'clip',
    });
    act(() =>
      view!.update(
        <BarTitle
          key="rest"
          title="Bill name"
          shown={false}
          trailing={2}
          trailingWidth={120 + 44}
          backTitle="Bills"
        />,
      ),
    );
    expect(StyleSheet.flatten(text().props.style).maxWidth).toBe(82);
    expect(StyleSheet.flatten(text().props.style).width).toBeUndefined();
    expect(StyleSheet.flatten(text().props.style).opacity.__getValue()).toBe(0);
    expect(text().props).toMatchObject({
      children: 'Bill name',
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    // A caller without a known back name retains the accepted override.
    expect(barTitleWidth(402, 2, 164)).toBe(90);
    expect(barTitleWidth(200, 2, 164)).toBe(0);
    expect(barTitleWidth(1024, 2, 164)).toBe(512);
  } finally {
    act(() =>
      Dimensions.set({ window: originalWindow, screen: originalScreen }),
    );
  }
});
