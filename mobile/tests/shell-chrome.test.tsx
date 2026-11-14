import { measureBarTitle } from './bar-title-metrics';
import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import React, { act } from 'react';
import * as Native from 'react-native';
import {
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import TestRenderer from 'react-test-renderer';
import TalkStack from '../src/app/talk/_layout';
import AskRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/ask';
import { designFlags } from '../src/design/flags';
import { Screen } from '../src/design/layout';
import * as tokens from '../src/design/tokens';
import {
  androidHeaderBar,
  askHeaderItems,
  barScrollEdges,
  glassBar,
  headerItems,
  largeTitleBar,
  opaqueBar,
  pageItems,
  pageMenu,
  rootHeaderItems,
  scrollBar,
  shortSheet,
  tabRootGround,
  useStackChrome,
} from '../src/navigation/chrome';
import { RouteOptions } from '../src/navigation/preview';
import { RootBar } from '../modules/opax-root-bar';

import {
  ExternalURLProbe,
  recordExternalURL,
} from '../src/navigation/source-destination';
import { askScreens } from '../src/navigation/stack/ask';
import { sharedScreens } from '../src/navigation/stack';
import { billsScreens } from '../src/navigation/stack/bills';
import { exploreScreens } from '../src/navigation/stack/explore';
import { editionScreens } from '../src/navigation/stack/edition';
import { recordsScreens } from '../src/navigation/stack/records';
import {
  rootBackTitle,
  screen,
  tabRootScreen,
  sheetOptions,
  untitled,
} from '../src/navigation/stack/screen';
import {
  BarTitle,
  barItemGrowthAX,
  barTitleClearanceAX,
  barTitleWidth,
  emptyBarTitle,
  inlineTitleScaleCap,
  useTitleOnScroll,
} from '../src/navigation/useTitleOnScroll';
import { menuTitle } from '../src/design/menu-title';
import {
  useRootBarAppearance,
  useRootBarSearchOptions,
  useRootBarUnderBar,
} from '../src/navigation/useRootBarAppearance';

const { colors } = tokens;

jest.mock('../modules/opax-root-bar', () => ({
  RootBar: { setSolid: jest.fn(), remove: jest.fn() },
  useVerticalBarEdge: () => mockBarEdge,
}));
let mockBarEdge: 'unspecified' | 'leading' | 'trailing' = 'unspecified';
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: Object.assign(
    ({ children }: { children: React.ReactNode }) => children,
    { Screen: () => null },
  ),
  useSegments: () => ['(tabs)', '(ask)'],
  router: { push: jest.fn(), back: jest.fn() },
}));
jest.mock('../src/features/ask/AskScreen', () => () => null);
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: { signedIn: mockSignedIn } }),
  accountSnapshot: () => ({ status: { signedIn: mockSignedIn } }),
}));
let mockSignedIn = false;
let mockVoiceLinked = true;
jest.mock('../src/voice/linked', () => ({
  get voiceLinked() {
    return mockVoiceLinked;
  },
}));
jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 100,
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => mockReducedMotion,
  useSolidBar: () => mockSolidBar,
}));
let mockReducedMotion = false;
let mockSolidBar = false;
const mockBuild = {
  isProduction: false,
  isE2E: true,
  webOrigin: 'https://opax.invalid',
};
jest.mock('../src/design/environment', () => ({
  get isProduction() {
    return mockBuild.isProduction;
  },
  isE2E: true,
  webOrigin: 'https://opax.invalid',
}));

function tree(element: React.ReactElement) {
  let result!: TestRenderer.ReactTestRenderer;
  act(() => {
    result = TestRenderer.create(element);
  });
  measureBarTitle(result);
  return result;
}
afterEach(() => {
  mockBuild.isProduction = false;
  mockReducedMotion = false;
  mockSignedIn = false;
  mockVoiceLinked = true;
  mockBarEdge = 'unspecified';
  jest.restoreAllMocks();
});
test.each(['(today)', '(your-mp)', '(bills)', '(search)'] as const)(
  '%s has Account and no more than one feature item',
  (segment) => {
    for (const signedIn of [false, true]) {
      const items = rootHeaderItems({
        segment,
        signedIn,
        extra: [
          { type: 'button', label: 'Feature', onPress: jest.fn() },
          { type: 'button', label: 'Extra', onPress: jest.fn() },
        ],
      });
      expect(items).toHaveLength(2);
      expect(items.at(-1)).toMatchObject({
        label: 'Account',
        accessibilityLabel: 'Account',
        icon: {
          name: signedIn ? 'person.crop.circle.fill' : 'person.crop.circle',
        },
      });
    }
    expect(rootHeaderItems({ segment, signedIn: false })).toEqual([
      expect.objectContaining({ label: 'Account' }),
    ]);
  },
);
test.each([false, true])(
  'Ask registration uses the Ask bar and the route renders AskScreen alone when signed in: %s',
  (signedIn) => {
    mockSignedIn = signedIn;
    const view = tree(<AskRoute />);
    // AskScreen sets the live bar; the route adds no Stack.Screen of its own.
    expect(view.root.findAllByType(Stack.Screen)).toHaveLength(0);
    const registration = askScreens('(ask)', signedIn)
      .find((screen) => screen.props.name === 'ask')!
      .props.options({ route: { params: {} } });
    expect(registration.unstable_headerLeftItems()).toEqual([
      expect.objectContaining({ label: 'Your conversations' }),
    ]);
    // Talk lives in the composer (D5): the bar is New question and Account.
    expect(registration.unstable_headerRightItems()).toEqual([
      expect.objectContaining({ label: 'New question', disabled: true }),
      expect.objectContaining({ label: 'Account' }),
    ]);
    act(() => view.unmount());
  },
);
test('Ask has history leading and New question plus Account trailing', () => {
  const onNew = jest.fn();
  const onHistory = jest.fn();
  const options = askHeaderItems({
    canStartNew: true,
    historyEnabled: true,
    signedIn: false,
    onNew,
    onHistory,
  });
  expect(options.unstable_headerLeftItems()).toEqual([
    expect.objectContaining({
      label: 'Your conversations',
      disabled: false,
      onPress: onHistory,
    }),
  ]);
  expect(options.unstable_headerRightItems?.()).toEqual([
    expect.objectContaining({
      label: 'New question',
      disabled: false,
      onPress: onNew,
    }),
    expect.objectContaining({ label: 'Account' }),
  ]);
  expect(designFlags.talkInAsk).toBe(true);
});
test('a pushed page has More outermost and one direct action, with no menu title', () => {
  const items = pageItems({
    name: 'Member',
    share: jest.fn(),
    filters: { active: true, href: '/filters/bills' },
    menu: [
      { title: 'Copy link', onPress: jest.fn() },
      {
        title: 'Cite',
        inline: true,
        items: [{ title: 'Text', onPress: jest.fn() }],
      },
    ],
  })();
  expect(items).toHaveLength(2);
  expect(items[1]).toMatchObject({
    type: 'menu',
    accessibilityLabel: 'More for Member',
    icon: { name: 'ellipsis.circle' },
  });
  expect(items[0]).toMatchObject({
    type: 'button',
    accessibilityLabel: 'Filters, on',
  });
  const menu = pageMenu({ name: 'Member', items: [] });
  expect(menu.type === 'menu' && menu.menu).not.toHaveProperty('title');
});
test('page Share precedes More in native and Android bars', () => {
  const items = pageItems({ name: 'Money map', share: jest.fn(), menu: [] })();
  expect(items.map((item) => 'label' in item && item.label)).toEqual([
    'Share',
    'More',
  ]);
  const view = tree(androidHeaderBar(items));
  expect(
    view.root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'button',
      )
      .map((node) => node.props.accessibilityLabel),
  ).toEqual(['Share Money map', 'More for Money map']);
  act(() => view.unmount());
});
test('inline and sheet bars cover content and roots keep a native scroll edge', () => {
  let chrome!: ReturnType<typeof useStackChrome>;
  function Harness() {
    chrome = useStackChrome();
    return null;
  }
  const view = tree(<Harness />);
  expect(chrome.headerTransparent).toBe(false);
  expect(chrome.scrollEdgeEffects).toEqual({ top: 'hard', bottom: 'soft' });
  expect(shortSheet.headerTransparent).toBe(false);
  expect(shortSheet.sheetExpandsWhenScrolledToEdge).toBe(true);
  act(() => view.unmount());
});

test.each([
  ['system', 1, 34],
  ['system', 3.571, 60],
  ['serif', 1, 34],
  ['serif', 3.571, 60],
] as const)(
  '%s iOS large titles use the Dynamic Type token ramp at fontScale %s (%s pt)',
  (face, fontScale, expectedSize) => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.replaceProperty(tokens, 'headingFace', face);
    Dimensions.set({
      window: { ...window, fontScale },
      screen: { ...screen, fontScale },
    });
    let chrome!: ReturnType<typeof useStackChrome>;
    function Harness() {
      chrome = useStackChrome();
      return null;
    }
    let view: TestRenderer.ReactTestRenderer | undefined;
    const scheme = jest
      .spyOn(Native, 'useColorScheme')
      .mockReturnValue('light');
    try {
      view = tree(<Harness />);
      expect(chrome.headerLargeTitleStyle).toEqual({
        fontFamily: tokens.textStyles.largeTitle.fontFamily,
        fontWeight: tokens.textStyles.largeTitle.fontWeight,
        fontSize: expectedSize,
        color: tokens.schemeColour('ink', 'light'),
      });
    } finally {
      if (view) act(() => view!.unmount());
      Dimensions.set({ window, screen });
      scheme.mockRestore();
    }
  },
);

test('bar titles resolve ink in the app appearance, whatever the bar resolves (11b-3)', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const scheme = jest.spyOn(Native, 'useColorScheme').mockReturnValue('dark');
  let chrome!: ReturnType<typeof useStackChrome>;
  function Harness() {
    chrome = useStackChrome();
    return null;
  }
  const view = tree(<Harness />);
  try {
    // The bar takes its interface style from the navigation theme, so the
    // dynamic ink token resolved light: dark ink over the dark Ask page.
    const darkInk = (colors.ink as unknown as { dynamic: { dark: string } })
      .dynamic.dark;
    for (const style of [
      chrome.headerTitleStyle,
      chrome.headerLargeTitleStyle,
    ]) {
      const { dynamic } = (
        style as unknown as {
          color: { dynamic: Record<string, string> };
        }
      ).color;
      expect(dynamic.light).toBe(darkInk);
      expect(dynamic.dark).toBe(darkInk);
      expect(dynamic.highContrastLight).toBe(dynamic.highContrastDark);
    }
  } finally {
    act(() => view.unmount());
    scheme.mockRestore();
  }
});

test.each([
  ['xSmall', 0.823, 14, 14],
  ['small', 0.882, 15, 15],
  ['medium', 0.941, 16, 16],
  ['large', 1, 17, 17],
  ['xLarge', 1.118, 19, 19],
  ['xxLarge', 1.235, 21, 21],
  ['xxxLarge', 1.353, 23, 23],
  ['ax1', 1.786, 28, 23],
  ['ax2', 2.143, 33, 23],
  ['ax3', 2.643, 40, 23],
  ['ax4', 3.143, 47, 23],
  ['ax5', 3.571, 53, 23],
] as const)(
  '%s uses the headline ramp and caps the inline bar at xxxLarge',
  (category, fontScale, headline, inline) => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    jest.replaceProperty(tokens, 'headingFace', 'serif');
    Dimensions.set({
      window: { ...window, fontScale },
      screen: { ...screen, fontScale },
    });
    let chrome!: ReturnType<typeof useStackChrome>;
    function Harness() {
      chrome = useStackChrome();
      return null;
    }
    let view: TestRenderer.ReactTestRenderer | undefined;
    try {
      view = tree(<Harness />);
      expect(tokens.headlineSizes[category]).toBe(headline);
      expect(chrome.headerTitleStyle.fontSize).toBe(inline);
    } finally {
      if (view) act(() => view!.unmount());
      Dimensions.set({ window, screen });
    }
  },
);
test('expanded iOS 26 roots leave both appearances uncoloured; older roots remain opaque', () => {
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
  const bar = largeTitleBar(colors.sunken);
  expect(bar).not.toHaveProperty('headerBackground');
  expect(bar).toMatchObject({
    headerStyle: {},
    headerLargeStyle: {},
    contentStyle: { backgroundColor: colors.sunken },
  });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 18 });
  expect(largeTitleBar(colors.sunken)).toMatchObject({
    headerStyle: { backgroundColor: colors.sunken },
  });
  if (version) Object.defineProperty(Platform, 'Version', version);
});
test('tab roots are translucent on iOS 26 and opaque on iOS 18.4 to 25', () => {
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  const rootOptions = () =>
    [
      ...(
        [
          ['(today)', 'index', 'Today'],
          ['(your-mp)', 'your-mp', 'Your MP'],
          ['(bills)', 'bills', 'Bills'],
          ['(search)', 'search', 'Search'],
        ] as const
      ).map(
        ([segment, name, title]) =>
          tabRootScreen(segment, segment, name, title, false)[0]!,
      ),
      askScreens('(ask)', false).find((screen) => screen.props.name === 'ask')!,
    ].map((screen) =>
      screen.props.options({
        route: { params: {} },
        navigation: { getState: () => ({ index: 0 }) },
      }),
    );
  try {
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: '26.0',
    });
    expect(glassBar()).toBe(true);
    for (const options of rootOptions()) {
      expect(options.headerLargeTitleEnabled).toBe(true);
      expect(options.headerTransparent).toBe(true);
      expect(options.headerStyle).not.toHaveProperty('backgroundColor');
      expect(options).not.toHaveProperty('headerBlurEffect');
      expect(options.headerLargeStyle).not.toHaveProperty('backgroundColor');
      expect(options.headerLargeTitleShadowVisible).toBe(false);
      expect(options.scrollEdgeEffects).toEqual({
        top: 'soft',
        bottom: 'soft',
      });
      expect(options.contentStyle?.backgroundColor).toEqual(
        options.title === 'Bills' ? colors.paper : colors.sunken,
      );
      expect(options.title).toMatch(/^(Today|Your MP|Bills|Search|Ask)$/);
      expect(options.headerTitle).toBeUndefined();
    }
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: '18.4',
    });
    expect(glassBar()).toBe(false);
    for (const options of rootOptions())
      expect(options.headerTransparent ?? false).toBe(false);
  } finally {
    if (version) Object.defineProperty(Platform, 'Version', version);
  }
});

test.each([
  [26, true],
  [26, false],
  [27, true],
  [27, false],
] as const)(
  'iOS %s edition owns an opaque bar on its grouped=%s ground during overscroll',
  (version, grouped) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: version,
    });
    const previousGrouped = mockFlags.groupedSurfaces;
    mockFlags.groupedSurfaces = grouped;
    const route = { key: 'edition-detail', name: 'edition', params: {} };
    const navigation = {
      isFocused: () => true,
      addListener: () => () => {},
      getState: () => ({
        index: 1,
        routes: [{ key: 'today-root', name: 'index' }, route],
        routeNames: sharedScreens('(today)', false).map(
          (entry) => entry.props.name,
        ),
      }),
      setOptions: jest.fn(),
    };
    const entry = editionScreens()[0]!;
    const options = entry.props.options({ route, navigation });
    const ground = grouped ? colors.sunken : colors.paper;
    let title!: ReturnType<typeof useTitleOnScroll>;
    let headingY = 120;
    const heading = {
      current: {
        measure: (callback: (...values: number[]) => void) =>
          callback(0, 0, 300, 80, 0, headingY),
      },
    };
    function Page() {
      title = useTitleOnScroll(heading as never, 'Daily edition');
      return (
        <Screen grouped>
          <View />
        </Screen>
      );
    }
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    let background: TestRenderer.ReactTestRenderer | undefined;
    try {
      expect(options).toMatchObject({
        title: 'Daily edition',
        headerBackTitle: 'Today',
        headerBackButtonDisplayMode: 'default',
        headerBackButtonMenuEnabled: true,
        headerLargeTitleEnabled: false,
        headerTransparent: false,
        ...opaqueBar(ground),
        contentStyle: { backgroundColor: ground },
        scrollEdgeEffects: { top: 'hard', bottom: 'soft' },
      });
      expect(options).not.toHaveProperty('headerBlurEffect');
      background = tree(options.headerBackground!());
      const backing = background.root.findByType(View);
      expect(backing.props.pointerEvents).toBe('none');
      expect(StyleSheet.flatten(backing.props.style)).toMatchObject({
        flex: 1,
        backgroundColor: ground,
      });
      renderer = tree(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route}>
            <HeaderHeightContext.Provider value={100}>
              <Page />
            </HeaderHeightContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
      jest.mocked(RootBar!.setSolid!).mockClear();
      navigation.setOptions.mockClear();
      for (const [offset, y] of [
        [0, 120],
        [240, 40],
        [-96, 216],
        [0, 120],
      ]) {
        headingY = y!;
        act(() => title.onScroll(offset!));
        const resolved = Object.assign(
          {},
          options,
          ...navigation.setOptions.mock.calls.map(([value]) => value),
        );
        expect(resolved).toMatchObject({
          headerTransparent: false,
          headerStyle: { backgroundColor: ground },
          headerLargeStyle: { backgroundColor: ground },
          contentStyle: { backgroundColor: ground },
          headerBackground: options.headerBackground,
        });
      }
      expect(navigation.setOptions).toHaveBeenCalledTimes(2);
      for (const [update] of navigation.setOptions.mock.calls)
        expect(Object.keys(update)).toEqual(['headerTitle']);
      expect(RootBar!.setSolid).not.toHaveBeenCalled();
      expect(largeTitleBar(ground).headerTransparent).toBe(true);
    } finally {
      if (renderer) act(() => renderer!.unmount());
      if (background) act(() => background!.unmount());
      mockFlags.groupedSurfaces = previousGrouped;
      Object.defineProperty(Platform, 'Version', descriptor);
    }
  },
);
test('40 scroll events past the title anchor set options only once, then once on return', () => {
  const setOptions = jest.fn();
  let hook!: ReturnType<typeof useTitleOnScroll>;
  function Harness() {
    hook = useTitleOnScroll(null, 'Member');
    return null;
  }
  const view = tree(
    <NavigationContext.Provider value={{ setOptions } as never}>
      <Harness />
    </NavigationContext.Provider>,
  );
  expect(setOptions.mock.calls[0]![0].headerTitle().props.shown).toBe(false);
  setOptions.mockClear();
  act(() => hook.setAnchorBottom(200));
  expect(setOptions.mock.calls[0]![0].title).toBe('Member');
  setOptions.mockClear();
  act(() => {
    for (let i = 0; i < 40; i++) hook.onScroll(101 + i);
  });
  expect(setOptions).toHaveBeenCalledTimes(1);
  act(() => hook.onScroll(0));
  expect(setOptions).toHaveBeenCalledTimes(2);
  expect(setOptions.mock.calls[1]![0]).not.toHaveProperty('title');
  act(() => view.unmount());
});
test('the bar title stays hidden until the entire heading passes under the bar', () => {
  const setOptions = jest.fn();
  let hook!: ReturnType<typeof useTitleOnScroll>;
  function Harness() {
    hook = useTitleOnScroll(null, 'Digital Transformation Agency');
    return null;
  }
  const view = tree(
    <NavigationContext.Provider value={{ setOptions } as never}>
      <Harness />
    </NavigationContext.Provider>,
  );
  // A two-line heading from 120 to 200 under a bar ending at 100.
  act(() =>
    hook.onTitleLayout({
      nativeEvent: { layout: { x: 0, y: 120, width: 300, height: 80 } },
    } as never),
  );
  setOptions.mockClear();
  act(() => hook.onScroll(99));
  expect(setOptions).not.toHaveBeenCalled();
  act(() => hook.onScroll(101));
  expect(setOptions).toHaveBeenCalledTimes(1);
  act(() => view.unmount());
});
test('hidden bar titles stay out of accessibility and fade over 150 ms', () => {
  const animation = jest.spyOn(Animated, 'timing');
  const view = tree(<BarTitle title="Member" shown={false} />);
  expect(
    view.root.findByType(Animated.Text).props.accessibilityElementsHidden,
  ).toBe(true);
  expect(view.root.findByType(Animated.Text).props.maxFontSizeMultiplier).toBe(
    inlineTitleScaleCap,
  );
  act(() => view.update(<BarTitle title="Member" shown />));
  expect(animation).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 1, duration: 150 }),
  );
  act(() => view.unmount());
});
test.each([false, true])(
  'missing native metrics show the full, tail-truncated title after 300 ms (Reduce Motion: %s)',
  (reduceMotion) => {
    jest.useFakeTimers();
    mockReducedMotion = reduceMotion;
    const animation = jest.spyOn(Animated, 'timing');
    const title = 'Interactive Gambling Amendment Bill';
    let view!: TestRenderer.ReactTestRenderer;
    try {
      // Deliberately never deliver onTextLayout, including while at rest.
      act(() => {
        view = TestRenderer.create(
          <BarTitle title={title} backTitle="Bills" shown={false} />,
        );
      });
      act(() => jest.advanceTimersByTime(1000));
      act(() =>
        view.update(<BarTitle title={title} backTitle="Bills" shown />),
      );
      act(() => jest.advanceTimersByTime(299));
      expect(
        view.root.findByType(Animated.Text).props.accessibilityElementsHidden,
      ).toBe(true);
      act(() => jest.advanceTimersByTime(1));
      const text = view.root.findByType(Animated.Text);
      expect(text.props).toMatchObject({
        children: title,
        accessibilityLabel: title,
        accessibilityElementsHidden: false,
        importantForAccessibility: 'auto',
        numberOfLines: 1,
        ellipsizeMode: 'tail',
      });
      if (reduceMotion) {
        expect(animation).not.toHaveBeenCalled();
        expect(StyleSheet.flatten(text.props.style).opacity.__getValue()).toBe(
          1,
        );
      } else {
        expect(animation).toHaveBeenLastCalledWith(
          expect.anything(),
          expect.objectContaining({ toValue: 1, duration: 150 }),
        );
      }
      // A later reveal gets its own timeout, even for the same subject.
      act(() =>
        view.update(<BarTitle title={title} backTitle="Bills" shown={false} />),
      );
      // Its opacity remains animated while it fades out, rather than being
      // forced to zero when the heading returns into view.
      expect(StyleSheet.flatten(text.props.style).opacity).not.toBe(0);
      if (!reduceMotion)
        expect(animation).toHaveBeenLastCalledWith(
          expect.anything(),
          expect.objectContaining({ toValue: 0, duration: 150 }),
        );
      act(() =>
        view.update(<BarTitle title={title} backTitle="Bills" shown />),
      );
      act(() => jest.advanceTimersByTime(299));
      expect(text.props.accessibilityElementsHidden).toBe(true);
      act(() => jest.advanceTimersByTime(1));
      expect(text.props.accessibilityElementsHidden).toBe(false);
      // Late metrics apply to the next reveal, keeping this fallback stable.
      measureBarTitle(view, { [title]: 80, Bills: 30 });
      expect(text.props.ellipsizeMode).toBe('tail');
      act(() => view.update(<BarTitle title={title} shown={false} />));
      expect(text.props.accessibilityElementsHidden).toBe(true);
    } finally {
      act(() => view?.unmount());
      jest.useRealTimers();
    }
  },
);
describe.each([false, true])(
  'late title metrics (Reduce Motion: %s)',
  (reduced) => {
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
      ['Whole subject', false, { 'Whole subject': 400 }, null, 'minimal'],
      [
        'Long subject with clause',
        false,
        {
          'Long subject with clause': 400,
          'Long subject with…': 300,
          'Long subject…': 180,
        },
        'Long subject…',
        'minimal',
      ],
      [
        'Alexandra Sample',
        true,
        { 'Alexandra Sample': 400, Sample: 80 },
        'Sample',
        'minimal',
      ],
    ] as const)(
      '%s (%s, %j) stays full through late metrics and uses them on the next reveal',
      (title, person, widths, nextTitle, nextBackMode) => {
        jest.useFakeTimers();
        mockReducedMotion = reduced;
        const animation = jest.spyOn(Animated, 'timing');
        const original = Dimensions.get('window');
        const navigation = { setOptions: jest.fn() };
        const element = (shown: boolean) => (
          <NavigationContext.Provider value={navigation as never}>
            <BarTitle
              title={title}
              person={person}
              shown={shown}
              backTitle="Today"
            />
          </NavigationContext.Provider>
        );
        let view!: TestRenderer.ReactTestRenderer;
        try {
          act(() => {
            Dimensions.set({
              window: { ...original, width: 402, fontScale: 1 },
            });
            view = TestRenderer.create(element(true));
          });
          act(() => jest.advanceTimersByTime(450));
          const text = view.root.findByType(Animated.Text);
          const fallbackStyle = StyleSheet.flatten(text.props.style);
          expect(text.props).toMatchObject({
            children: title,
            accessibilityLabel: title,
            accessibilityElementsHidden: false,
            importantForAccessibility: 'auto',
            ellipsizeMode: 'tail',
          });
          const animationCount = animation.mock.calls.length;
          measureBarTitle(view, { Today: 35, ...widths });
          // Both the wording and the room remain latched, even when the
          // newly measured retreat would cut or hide this title.
          expect(text.props).toMatchObject({
            children: title,
            accessibilityLabel: title,
            accessibilityElementsHidden: false,
            importantForAccessibility: 'auto',
            ellipsizeMode: 'tail',
          });
          expect(StyleSheet.flatten(text.props.style)).toMatchObject({
            opacity: fallbackStyle.opacity,
            maxWidth: fallbackStyle.maxWidth,
          });
          expect(animation).toHaveBeenCalledTimes(animationCount);
          if (reduced) expect(fallbackStyle.opacity.__getValue()).toBe(1);
          expect(navigation.setOptions).toHaveBeenLastCalledWith({
            headerBackButtonDisplayMode: 'default',
          });
          act(() => jest.advanceTimersByTime(1000));
          expect(text.props.accessibilityElementsHidden).toBe(false);
          act(() => view.update(element(false)));
          expect(text.props.accessibilityElementsHidden).toBe(true);
          act(() => view.update(element(true)));
          expect(text.props).toMatchObject({
            children: nextTitle ?? title,
            accessibilityLabel: title,
            accessibilityElementsHidden: nextTitle === null,
            ellipsizeMode: 'clip',
          });
          expect(navigation.setOptions).toHaveBeenLastCalledWith({
            headerBackButtonDisplayMode: nextBackMode,
          });
        } finally {
          act(() => {
            view?.unmount();
            Dimensions.set({ window: original });
          });
          jest.useRealTimers();
        }
      },
    );
  },
);
test('native width probes have intrinsic height and stay hidden and untouchable', () => {
  const view = tree(<BarTitle title="Interactive Gambling Bill" shown />);
  const probes = view.root.findAllByProps({ testID: 'bar-title-probes' })[0]!;
  const style = StyleSheet.flatten(probes.props.style);
  expect(style).toMatchObject({ position: 'absolute', opacity: 0 });
  expect(style).not.toHaveProperty('height');
  expect(style).not.toHaveProperty('maxHeight');
  expect(probes.props).toMatchObject({
    pointerEvents: 'none',
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  });
  act(() => view.unmount());
});
test('debug and e2e record the opened destination in a hidden text element; release renders nothing', () => {
  const insets = { top: 59, left: 20, right: 20, bottom: 34 };
  const probe = () => (
    <SafeAreaInsetsContext.Provider value={insets}>
      <ExternalURLProbe />
    </SafeAreaInsetsContext.Provider>
  );
  const view = tree(probe());
  act(() => recordExternalURL('https://example.org/original'));
  const props = view.root.findByProps({
    testID: 'debug-last-external-url',
  }).props;
  expect(props.children).toBe('https://example.org/original');
  expect(props.accessibilityLabel).toBe('https://example.org/original');
  expect(props.accessible).toBe(true);
  expect(props.pointerEvents).toBe('none');
  expect(props).not.toHaveProperty('accessibilityElementsHidden');
  expect(props).not.toHaveProperty('importantForAccessibility');
  expect(props.style).toMatchObject({
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
  });
  expect(props.style.opacity).toBeGreaterThanOrEqual(0.02);
  expect(props.style.top).toBeGreaterThan(insets.top);
  expect(props.style.left).toBeGreaterThan(insets.left);
  mockBuild.isProduction = true;
  act(() => view.update(probe()));
  expect(view.toJSON()).toBeNull();
  act(() => view.unmount());
});

jest.mock('expo-router/unstable-native-tabs', () => {
  const React = jest.requireActual('react');
  const render = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const NativeTabs = Object.assign(render, {
    Trigger: Object.assign(
      function Trigger({ children }: { children: React.ReactNode }) {
        return React.createElement(React.Fragment, null, children);
      },
      { Label: render, Icon: () => null },
    ),
  });
  return { NativeTabs };
});
const mockFlags = { searchTab: true, talkInAsk: true, groupedSurfaces: true };
jest.mock('../src/design/flags', () => ({
  get designFlags() {
    return mockFlags;
  },
}));

test.each([
  [26, true, ['(today)', '(your-mp)', '(bills)', '(ask)', '(search)']],
  [27, true, ['(today)', '(your-mp)', '(bills)', '(ask)', '(search)']],
  [18, true, ['(today)', '(your-mp)', '(bills)', '(search)', '(ask)']],
  [26, false, ['(today)', '(your-mp)', '(bills)', '(search)', '(ask)']],
])('iOS %s honours the search role flag %s', (version, enabled, order) => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'Version');
  Object.defineProperty(Platform, 'Version', {
    configurable: true,
    value: version,
  });
  mockFlags.searchTab = enabled as boolean;
  const Tabs = jest.requireActual('../src/app/(tabs)/_layout').default;
  const { NativeTabs } = jest.requireMock('expo-router/unstable-native-tabs');
  const view = tree(<Tabs />);
  const tabs = view.root.findAllByType(NativeTabs.Trigger);
  expect(tabs.map((tab) => tab.props.name)).toEqual(order);
  const search = tabs.find((tab) => tab.props.name === '(search)')!;
  expect(search.props.role).toBe(
    (version as number) >= 26 && enabled ? 'search' : undefined,
  );
  expect(search.findByType(NativeTabs.Trigger.Label).props.children).toBe(
    'Search',
  );
  expect(view.root.findByType(NativeTabs).props.minimizeBehavior).toBe(
    'onScrollDown',
  );
  expect(view.root.findByType(NativeTabs).props).not.toHaveProperty(
    'iconColor',
  );
  act(() => view.unmount());
  mockFlags.searchTab = true;
  if (descriptor) Object.defineProperty(Platform, 'Version', descriptor);
});

test('the tab layout records the selected tab for warm Money map links', () => {
  const { selectedTab, setSelectedTab } = jest.requireActual(
    '../src/navigation/link-tab',
  );
  setSelectedTab('(today)');
  const Tabs = jest.requireActual('../src/app/(tabs)/_layout').default;
  const view = tree(<Tabs />);
  expect(selectedTab()).toBe('(ask)');
  act(() => view.unmount());
  setSelectedTab('(today)');
});

describe('bar titles keep their initial layout clear of the bar items', () => {
  const style = (view: TestRenderer.ReactTestRenderer) =>
    StyleSheet.flatten(view.root.findByType(Animated.Text).props.style);
  // Jest's window reports fontScale 2 (AX2); these cases are about Large.
  let restore: (() => void) | undefined;
  beforeEach(() => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    Dimensions.set({
      window: { ...window, fontScale: 1 },
      screen: { ...screen, fontScale: 1 },
    });
    restore = () => Dimensions.set({ window, screen });
  });
  afterEach(() => restore?.());
  test('at AX3 it keeps 8 pt clear of the larger items and shrinks to fit (sweep 1, 2.6)', () => {
    const window = Dimensions.get('window');
    Dimensions.set({
      window: { ...window, fontScale: 2.643 },
      screen: { ...Dimensions.get('screen'), fontScale: 2.643 },
    });
    const view = tree(
      <BarTitle title="Interactive Gambling Bill" shown trailing={2} />,
    );
    try {
      // The larger items and 8 pt more come off the room, and nothing is
      // added back as padding: UIKit runs a title view wider than its span
      // left over the back button (5 pt clear at AX3 with a 205 pt view).
      const room =
        barTitleWidth(
          window.width,
          2,
          undefined,
          '',
          undefined,
          barItemGrowthAX,
        ) - barTitleClearanceAX;
      expect(style(view).maxWidth).toBe(room);
      for (const node of view.root.findAll(
        (candidate) => typeof candidate.type === 'string',
      )) {
        const flat = StyleSheet.flatten(node.props.style);
        if (flat?.maxWidth !== undefined) expect(flat.maxWidth).toBe(room);
        expect(flat?.paddingHorizontal ?? 0).toBe(0);
      }
      // On a 402 pt iPhone the room is 186 pt: "Interactive Gambling…",
      // 176 pt at Large, still fits and is shown (s1-bill-02).
      expect(
        barTitleWidth(402, 2, undefined, '', undefined, barItemGrowthAX) -
          barTitleClearanceAX,
      ).toBe(186);
      // Fabric shrinks only text it sees truncated; a clipped line never is.
      expect(view.root.findByType(Animated.Text).props).toMatchObject({
        adjustsFontSizeToFit: true,
        minimumFontScale: 1 / inlineTitleScaleCap,
        ellipsizeMode: 'tail',
      });
      // The retreat is measured at the Large size, the same as every size.
      for (const probe of view.root.findAll(
        (node) =>
          node.props.testID === 'bar-title-probe' &&
          typeof node.type !== 'string',
      ))
        expect(probe.props.allowFontScaling).toBe(false);
    } finally {
      act(() => view.unmount());
    }
  });
  test('at rest the title keeps its text and width, hidden only by opacity and accessibility', () => {
    const view = tree(
      <BarTitle title="Interactive Gambling Bill" shown={false} />,
    );
    expect(style(view).maxWidth).toBeGreaterThan(0);
    expect(style(view).maxWidth).toBe(
      barTitleWidth(Dimensions.get('window').width, 2),
    );
    expect(
      typeof style(view).opacity === 'number'
        ? style(view).opacity
        : style(view).opacity.__getValue(),
    ).toBe(0);
    expect(view.root.findByType(Animated.Text).props).toMatchObject({
      children: 'Interactive Gambling Bill',
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    act(() => view.unmount());
  });
  test('shown, it truncates inside the bar items, never under them (bills-07)', () => {
    const view = tree(
      <BarTitle title="Interactive Gambling Bill" shown trailing={2} />,
    );
    const text = view.root.findByType(Animated.Text);
    expect(text.props.children).toBe('Interactive Gambling Bill');
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.ellipsizeMode).toBe('clip');
    expect(text.props.accessibilityElementsHidden).toBe(false);
    expect(text.props.importantForAccessibility).toBe('auto');
    expect(style(view).maxWidth).toBe(
      barTitleWidth(Dimensions.get('window').width, 2, undefined, ''),
    );
    act(() => view.unmount());
  });
  test('the width is the bar less a 44 pt item, 60 pt a further item, margins and gaps, each side', () => {
    // 17 Pro: ⋯ alone leaves 266 pt; Share and ⋯ leave 146 pt.
    expect(barTitleWidth(402, 1)).toBe(266);
    expect(barTitleWidth(402, 2)).toBe(146);
    expect(barTitleWidth(375, 1)).toBe(239);
    // iPad: never wider than half the window.
    expect(barTitleWidth(1024, 1)).toBe(512);
  });
  test('reveal and completed fade preserve the same text and width', () => {
    let finish: (() => void) | undefined;
    const timing = jest.spyOn(Animated, 'timing').mockImplementation(
      (value, config) =>
        ({
          start: (callback?: Animated.EndCallback) => {
            finish = () => {
              value.setValue(config.toValue as number);
              callback?.({ finished: true });
            };
          },
          stop: () => undefined,
        }) as unknown as Animated.CompositeAnimation,
    );
    const view = tree(<BarTitle title="Member" shown />);
    const width = style(view).maxWidth;
    act(() => view.update(<BarTitle title="Member" shown={false} />));
    expect(style(view).maxWidth).toBe(width);
    act(() => finish?.());
    expect(style(view).maxWidth).toBe(width);
    expect(
      typeof style(view).opacity === 'number'
        ? style(view).opacity
        : style(view).opacity.__getValue(),
    ).toBe(0);
    expect(view.root.findByType(Animated.Text).props.children).toBe('Member');
    act(() => view.update(<BarTitle title="Member" shown />));
    act(() => finish?.());
    expect(style(view).maxWidth).toBe(width);
    expect(style(view).opacity.__getValue()).toBe(1);
    expect(view.root.findByType(Animated.Text).props.children).toBe('Member');
    act(() => view.unmount());
    timing.mockRestore();
  });
  test('readers start unnamed while fixed record and edition titles stay named', () => {
    expect(untitled.headerTitle).toBe(emptyBarTitle);
    const options = (screen: React.ReactElement) =>
      (
        screen.props as {
          name: string;
          options: (p: object) => { title: string; headerTitle?: unknown };
        }
      ).options({ route: { params: {} }, navigation: undefined });
    for (const screen of [...recordsScreens(), ...editionScreens()]) {
      const resolved = options(screen);
      expect(resolved.headerTitle).not.toBe('');
      const name = (screen.props as { name: string }).name;
      if (
        name === 'doc/[slug]' ||
        name === 'bill-text/[key]' ||
        name === 'report/[slug]'
      )
        expect(resolved.title).toBe('');
      else expect(resolved.title).not.toBe('');
    }
    const empty = tree(emptyBarTitle());
    expect(StyleSheet.flatten(empty.root.findByType(View).props.style)).toEqual(
      {
        width: 0,
        height: 0,
      },
    );
    act(() => empty.unmount());
  });
});
describe('a screen pushed onto a tab root names its back button', () => {
  const stack = (...names: string[]) => ({
    getState: () => ({
      index: names.length - 1,
      routes: names.map((name, i) => ({ key: `k${i}`, name })),
    }),
  });
  test('the root title is named outright, whatever its navigation item holds', () => {
    expect(rootBackTitle(stack('index', 'grants'), 'k1')).toBe('Today');
    expect(rootBackTitle(stack('bills', 'bill/[key]'), 'k1')).toBe('Bills');
    expect(rootBackTitle(stack('your-mp', 'members'), 'k1')).toBe('Your MP');
  });
  test('a deeper push from an unnamed detail falls back to Back', () => {
    expect(
      rootBackTitle(stack('index', 'bill/[key]', 'bill-text/[key]'), 'k2'),
    ).toBe('Back');
    expect(rootBackTitle(stack('index'), 'k0')).toBeUndefined();
  });
  test('the screen helper passes it as headerBackTitle on iOS', () => {
    const options = (
      screen('agencies', 'Government agencies').props as {
        options: (p: object) => { headerBackTitle?: string };
      }
    ).options;
    expect(
      options({
        route: { key: 'k1', params: {} },
        navigation: stack('index', 'agencies'),
      }).headerBackTitle,
    ).toBe(Platform.OS === 'ios' ? 'Today' : undefined);
  });
});
test('Reduce Motion cuts the bar title instead of animating it', () => {
  mockReducedMotion = true;
  const animation = jest.spyOn(Animated, 'timing');
  const view = tree(<BarTitle title="Member" shown />);
  expect(animation).not.toHaveBeenCalled();
  act(() => view.unmount());
});

test.each([colors.paper, colors.sunken])(
  'iOS 26 roots keep ground %p beneath stable transparent appearances',
  (ground) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 26,
    });
    try {
      const options = largeTitleBar(ground);
      expect(options).toMatchObject({
        headerStyle: {},
        headerLargeStyle: {},
        contentStyle: { backgroundColor: ground },
        headerShadowVisible: false,
      });
      expect(options).not.toHaveProperty('headerBackground');
      expect(options).not.toHaveProperty('headerBlurEffect');
      expect(largeTitleBar(ground)).toEqual(options);
    } finally {
      Object.defineProperty(Platform, 'Version', descriptor);
    }
  },
);

test('quiz and division history keep named native Back buttons and centred inline titles', () => {
  const resolve = (entry: React.ReactElement, previous: string, params = {}) =>
    (
      entry.props as { options: (props: object) => Record<string, unknown> }
    ).options({
      route: { key: 'pushed', params },
      navigation: {
        getState: () => ({
          index: 1,
          routes: [
            { key: 'root', name: previous },
            { key: 'pushed', name: entry.key },
          ],
        }),
      },
    });
  const quiz = exploreScreens().find(
    (entry) => entry.props.name === 'explore/[tool]',
  )!;
  expect(resolve(quiz, 'explore/index', { tool: 'quiz' })).toMatchObject({
    title: 'The record quiz',
    headerBackTitle: 'Tools',
    headerBackButtonDisplayMode: 'default',
    headerTitleAlign: 'center',
  });
  const votes = billsScreens().find(
    (entry) => entry.props.name === 'division-history',
  )!;
  expect(resolve(votes, 'bills')).toMatchObject({
    title: 'Votes in parliament',
    headerTitle: 'Votes in parliament',
    headerTitleAlign: 'center',
    headerBackTitle: 'Bills',
  });
});

test('large-title roots leave both native shadows off and the soft edge stable', () => {
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
  try {
    expect(largeTitleBar(colors.sunken)).toEqual({
      headerStyle: {},
      headerLargeStyle: {},
      contentStyle: { backgroundColor: colors.sunken },
      headerTransparent: true,
      headerShadowVisible: false,
      headerLargeTitleShadowVisible: false,
      scrollEdgeEffects: { top: 'soft', bottom: 'soft' },
    });
  } finally {
    Object.defineProperty(Platform, 'Version', version);
  }
});

test.each([
  ['ios', '18.4'],
  ['ios', 25],
  ['android', 36],
] as const)('%s %s keeps opaque root appearances', (os, version) => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
  jest.replaceProperty(Platform, 'OS', os);
  Object.defineProperty(Platform, 'Version', {
    configurable: true,
    value: version,
  });
  try {
    expect(largeTitleBar(colors.sunken)).toEqual(opaqueBar(colors.sunken));
  } finally {
    Object.defineProperty(Platform, 'Version', descriptor);
  }
});

const tabCases = [
  ['(today)', 'index', 'Today'],
  ['(your-mp)', 'your-mp', 'Your MP'],
  ['(bills)', 'bills', 'Bills'],
  ['(search)', 'search', 'Search'],
  ['(ask)', 'ask', 'Ask'],
] as const;

// Exercise the five tab roots through their Screen and RouteOptions owners.
const fadeCases = tabCases.map(
  ([segment, name]) => [segment, name, false, false] as const,
);
function fadePage(
  name: string,
  segment: (typeof tabCases)[number][0],
  explicit = false,
  screenOwner = false,
  pinned = false,
  extraOptions?: NativeStackNavigationOptions,
) {
  const route = { key: `${name}-root`, name };
  const listeners = new Map<string, Set<() => void>>();
  const navigation = {
    isFocused: jest.fn(() => true),
    addListener: (event: string, listener: () => void) => {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(listener);
      listeners.set(event, handlers);
      return () => {
        handlers.delete(listener);
      };
    },
    getState: () => ({
      index: explicit ? 1 : 0,
      routes: explicit ? [{ key: 'tab-root', name: 'index' }, route] : [route],
      routeNames: sharedScreens(segment, false).map(
        (entry) => entry.props.name,
      ),
    }),
    setOptions: jest.fn(),
  };
  const usesScreen =
    screenOwner || (!explicit && name !== 'bills' && name !== 'ask');
  const options = {
    ...(explicit
      ? (extraOptions ?? { headerLargeTitle: true })
      : { title: name }),
    // Your MP declares its large title inside Screen, not in a sibling.
    ...(name === 'your-mp'
      ? {
          title: 'Your MP',
          headerLargeTitleEnabled: true,
          ...headerItems(() =>
            rootHeaderItems({ segment: '(your-mp)', signedIn: false }),
          ),
        }
      : {}),
    ...(pinned
      ? {
          headerSearchBarOptions: {
            hideWhenScrolling: false,
            placement: 'stacked' as const,
          },
        }
      : {}),
    ...extraOptions,
  };
  const ground = explicit
    ? screenOwner
      ? colors.sunken
      : colors.paper
    : tabRootGround(name);
  const page = (height: number, grouped = name !== 'bills') => (
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={route}>
        <SafeAreaInsetsContext.Provider
          value={{ top: 24, bottom: 0, left: 0, right: 0 }}
        >
          <HeaderHeightContext.Provider value={height}>
            {name !== 'your-mp' &&
              (!usesScreen || explicit || pinned || extraOptions) && (
                <RouteOptions options={options} />
              )}
            {usesScreen && (
              <Screen grouped={grouped}>
                {name === 'your-mp' && <RouteOptions options={options} />}
                <View />
              </Screen>
            )}
          </HeaderHeightContext.Provider>
        </SafeAreaInsetsContext.Provider>
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>
  );
  return {
    navigation,
    listeners,
    ground,
    page,
    identifier: `opax-root-bar-${route.key}`,
  };
}
function withGlass(test: () => void) {
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
  const window = Dimensions.get('window');
  act(() => Dimensions.set({ window: { ...window, fontScale: 1 } }));
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
  jest.mocked(RootBar!.setSolid!).mockClear();
  jest.mocked(RootBar!.remove).mockClear();
  try {
    test();
  } finally {
    act(() => Dimensions.set({ window }));
    Object.defineProperty(Platform, 'Version', version);
  }
}

test.each(fadeCases)(
  '%s %s keeps UIKit soft edges through collapse, overscroll and reversal',
  (segment, name, explicit, screenOwner) =>
    withGlass(() => {
      const { navigation, ground, page } = fadePage(
        name,
        segment,
        explicit,
        screenOwner,
      );
      const renderer = tree(page(68));
      try {
        expect(navigation.setOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            ...largeTitleBar(ground),
            headerLargeTitleEnabled: true,
          }),
        );
        navigation.setOptions.mockClear();
        for (const height of [
          120, 160, 120, 119.75, 119, 110, 100, 85, 68, 85, 100, 110, 120,
        ])
          act(() => renderer.update(page(height)));
        expect(navigation.setOptions).not.toHaveBeenCalled();
        expect(RootBar!.remove).not.toHaveBeenCalled();
        expect(RootBar!.setSolid).not.toHaveBeenCalled();
      } finally {
        act(() => renderer.unmount());
      }
    }),
);

// Sweep 1, item 1: soft alone blurs only the status strip, so Today's title,
// the clock and Search's field printed over page text once it scrolled
// under the bar. The edge turns hard then, and only then.
const scrollTo = (renderer: TestRenderer.ReactTestRenderer, y: number) =>
  act(() =>
    renderer.root
      .findByType(ScrollView)
      .props.onScroll({ nativeEvent: { contentOffset: { y } } }),
  );
const edgeCalls = (navigation: { setOptions: jest.Mock }) =>
  navigation.setOptions.mock.calls
    .map(([options]) => options.scrollEdgeEffects?.top)
    .filter(Boolean);
test.each([
  ['(today)', 'index'],
  ['(search)', 'search'],
  ['(today)', 'leads'],
  ['(ask)', 'ask'],
] as const)(
  '%s %s turns the top edge hard once text runs under the bar, soft again at rest',
  (segment, name) =>
    withGlass(() => {
      const { navigation, ground, page } = fadePage(
        name,
        segment,
        name === 'leads',
        true,
      );
      const expanded = 100; // useHeaderBottom's measured bar in this suite.
      const renderer = tree(page(expanded));
      try {
        navigation.setOptions.mockClear();
        // At rest UIKit insets the content to the bar's bottom edge.
        scrollTo(renderer, -expanded);
        expect(edgeCalls(navigation)).toEqual([]);
        // Under the expanded bar, before the collapse height arrives.
        scrollTo(renderer, -expanded + 2);
        expect(navigation.setOptions).toHaveBeenLastCalledWith(
          expect.objectContaining({
            ...largeTitleBar(
              name === 'leads' ? colors.paper : ground,
              false,
              true,
            ),
            headerLargeTitleEnabled: true,
          }),
        );
        expect(edgeCalls(navigation)).toEqual(['hard']);
        // Collapsed: text keeps running under the compact bar, no repeats.
        act(() => renderer.update(page(68)));
        scrollTo(renderer, 0);
        scrollTo(renderer, 400);
        expect(edgeCalls(navigation)).toEqual(['hard']);
        // Back to the top: the bar expands over clean ground.
        scrollTo(renderer, -68);
        act(() => renderer.update(page(expanded)));
        scrollTo(renderer, -expanded);
        expect(edgeCalls(navigation)).toEqual(['hard', 'soft']);
        expect(RootBar!.setSolid).not.toHaveBeenCalled();
      } finally {
        act(() => renderer.unmount());
      }
    }),
);

test.each([
  ['(your-mp)', 'your-mp'],
  ['(bills)', 'bills'],
] as const)('%s %s keeps the soft edge under scrolled text', (segment, name) =>
  withGlass(() => {
    const { navigation, page } = fadePage(name, segment);
    const renderer = tree(page(120));
    try {
      navigation.setOptions.mockClear();
      if (renderer.root.findAllByType(ScrollView).length) {
        scrollTo(renderer, 0);
        scrollTo(renderer, 400);
      }
      expect(edgeCalls(navigation)).not.toContain('hard');
    } finally {
      act(() => renderer.unmount());
    }
  }),
);

test('the accessibility backing keeps the edge hidden under scrolled text', () =>
  withGlass(() => {
    mockSolidBar = true;
    const { navigation, page } = fadePage('index', '(today)');
    const renderer = tree(page(120));
    try {
      navigation.setOptions.mockClear();
      scrollTo(renderer, 400);
      expect(edgeCalls(navigation)).not.toContain('hard');
    } finally {
      act(() => renderer.unmount());
      mockSolidBar = false;
    }
  }));

test.each([
  ['AX3', 2.643],
  ['AX5', 3.571],
])(
  'Today %s keeps a solid band across scroll, resize and focus',
  (_size, fontScale) =>
    withGlass(() => {
      const window = Dimensions.get('window');
      const { navigation, page, ground, identifier, listeners } = fadePage(
        'index',
        '(today)',
      );
      const renderer = tree(page(120));
      try {
        expect(RootBar!.setSolid).not.toHaveBeenCalled();
        act(() => Dimensions.set({ window: { ...window, fontScale } }));
        expect(RootBar!.setSolid).toHaveBeenLastCalledWith(identifier, ground);
        expect(navigation.setOptions).toHaveBeenLastCalledWith(
          expect.objectContaining(largeTitleBar(ground, true)),
        );
        navigation.setOptions.mockClear();
        scrollTo(renderer, 400);
        expect(edgeCalls(navigation)).not.toContain('hard');
        act(() => renderer.update(page(68)));
        expect(RootBar!.setSolid).toHaveBeenLastCalledWith(identifier, ground);
        act(() => listeners.get('blur')!.forEach((listener) => listener()));
        expect(RootBar!.remove).toHaveBeenLastCalledWith(identifier);
        jest.mocked(RootBar!.setSolid!).mockClear();
        act(() => listeners.get('focus')!.forEach((listener) => listener()));
        expect(RootBar!.setSolid).toHaveBeenLastCalledWith(identifier, ground);
        act(() => Dimensions.set({ window }));
        expect(RootBar!.remove).toHaveBeenLastCalledWith(identifier);
        expect(navigation.setOptions).toHaveBeenLastCalledWith(
          expect.objectContaining(largeTitleBar(ground, false, true)),
        );
        scrollTo(renderer, -120);
        expect(navigation.setOptions).toHaveBeenLastCalledWith(
          expect.objectContaining(largeTitleBar(ground)),
        );
      } finally {
        act(() => renderer.unmount());
        act(() => Dimensions.set({ window }));
      }
    }),
);

test.each(
  tabCases
    .filter(([, name]) => name !== 'index')
    .flatMap(([segment, name]) =>
      (
        [
          ['AX3', 2.643],
          ['AX5', 3.571],
        ] as const
      ).map(([size, fontScale]) => [segment, name, size, fontScale] as const),
    ),
)(
  '%s %s at %s keeps its glass header across layout',
  (segment, name, _size, fontScale) =>
    withGlass(() => {
      const window = Dimensions.get('window');
      const { navigation, page, ground } = fadePage(name, segment);
      const renderer = tree(page(120));
      try {
        act(() => Dimensions.set({ window: { ...window, fontScale } }));
        for (const height of [68, 120, 144]) {
          act(() => renderer.update(page(height)));
          const appearance = navigation.setOptions.mock.calls
            .map(([options]) => options)
            .filter((options) => 'headerTransparent' in options)
            .at(-1);
          expect(appearance).toEqual(
            expect.objectContaining({
              ...largeTitleBar(ground),
              headerLargeTitleEnabled: true,
            }),
          );
          expect(RootBar!.setSolid).not.toHaveBeenCalled();
        }
      } finally {
        act(() => renderer.unmount());
        act(() => Dimensions.set({ window }));
      }
    }),
);

test.each(['leading', 'trailing'] as const)(
  'Today on the %s Duo rail keeps its glass chrome at AX3 and AX5',
  (edge) =>
    withGlass(() => {
      mockBarEdge = edge;
      const window = Dimensions.get('window');
      const { navigation, page, ground } = fadePage('index', '(today)');
      const renderer = tree(page(100));
      try {
        for (const fontScale of [2.643, 3.571]) {
          act(() => Dimensions.set({ window: { ...window, fontScale } }));
          // The rail's top edge follows the content: soft at rest, hard
          // from the first scroll point. AX never makes it solid.
          expect(navigation.setOptions).toHaveBeenLastCalledWith(
            scrollBar(ground, false, edge, false),
          );
          scrollTo(renderer, 20);
          expect(navigation.setOptions).toHaveBeenLastCalledWith(
            scrollBar(ground, false, edge, true),
          );
          scrollTo(renderer, -100);
          expect(navigation.setOptions).toHaveBeenLastCalledWith(
            scrollBar(ground, false, edge, false),
          );
          expect(RootBar!.setSolid).not.toHaveBeenCalled();
        }
      } finally {
        act(() => renderer.unmount());
        act(() => Dimensions.set({ window }));
      }
    }),
);

test.each([false, true])(
  'Today with an inline title (iPad=%s) keeps its glass chrome at AX3 and AX5',
  (pad) =>
    withGlass(() => {
      const isPad = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(pad);
      const window = Dimensions.get('window');
      const { navigation, ground } = fadePage('index', '(today)');
      function InlineRoot() {
        useRootBarSearchOptions({ headerLargeTitleEnabled: false });
        useRootBarAppearance(navigation.setOptions, {
          ground,
          owner: 'options',
        });
        return null;
      }
      const renderer = tree(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider
            value={{ key: 'index-root', name: 'index' }}
          >
            <InlineRoot />
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
      try {
        for (const fontScale of [2.643, 3.571]) {
          act(() => Dimensions.set({ window: { ...window, fontScale } }));
          expect(navigation.setOptions).toHaveBeenLastCalledWith(
            scrollBar(ground),
          );
          expect(RootBar!.setSolid).not.toHaveBeenCalled();
        }
      } finally {
        act(() => renderer.unmount());
        act(() => Dimensions.set({ window }));
        isPad.mockRestore();
      }
    }),
);

test.each([
  ['AX3', 2.643],
  ['AX5', 3.571],
])(
  'iPad Today with a large title at %s keeps its glass chrome',
  (_size, fontScale) =>
    withGlass(() => {
      const isPad = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(true);
      const window = Dimensions.get('window');
      const { navigation, page, ground } = fadePage('index', '(today)');
      const renderer = tree(page(120));
      try {
        act(() => Dimensions.set({ window: { ...window, fontScale } }));
        expect(navigation.setOptions).toHaveBeenLastCalledWith(
          expect.objectContaining({
            ...largeTitleBar(ground),
            headerLargeTitleEnabled: true,
          }),
        );
        scrollTo(renderer, 400);
        expect(edgeCalls(navigation)).not.toContain('hidden');
        expect(RootBar!.setSolid).not.toHaveBeenCalled();
      } finally {
        act(() => renderer.unmount());
        act(() => Dimensions.set({ window }));
        isPad.mockRestore();
      }
    }),
);

test.each([41, 52, 85])(
  'a pinned search field with a %s pt title never adds a backing',
  (titleHeight) =>
    withGlass(() => {
      const { page, navigation } = fadePage(
        'bills',
        '(bills)',
        false,
        false,
        true,
      );
      const expanded = 68 + 56 + titleHeight;
      const renderer = tree(page(expanded));
      try {
        navigation.setOptions.mockClear();
        for (const height of [expanded - 15, 124, expanded])
          act(() => renderer.update(page(height)));
        expect(navigation.setOptions).not.toHaveBeenCalled();
        expect(RootBar!.setSolid).not.toHaveBeenCalled();
      } finally {
        act(() => renderer.unmount());
      }
    }),
);

test.each(tabCases)(
  '%s %s keeps a solid accessibility backing across scroll and focus',
  (segment, name) =>
    withGlass(() => {
      mockSolidBar = true;
      const { page, navigation, identifier, ground, listeners } = fadePage(
        name,
        segment,
      );
      const renderer = tree(page(120));
      try {
        expect(navigation.setOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            ...largeTitleBar(ground, true),
            headerLargeTitleEnabled: true,
          }),
        );
        expect(RootBar!.setSolid).toHaveBeenLastCalledWith(identifier, ground);
        // A Screen -> child RouteOptions ownership transfer must never clear
        // the backing while mounted, including before the first scroll.
        expect(RootBar!.remove).not.toHaveBeenCalled();
        navigation.setOptions.mockClear();
        for (const height of [100, 68, 120, 144]) {
          act(() => renderer.update(page(height)));
          expect(RootBar!.setSolid).toHaveBeenLastCalledWith(
            identifier,
            ground,
          );
        }
        expect(navigation.setOptions).not.toHaveBeenCalled();
        expect(RootBar!.remove).not.toHaveBeenCalled();
        act(() => listeners.get('blur')!.forEach((listener) => listener()));
        expect(RootBar!.remove).toHaveBeenLastCalledWith(identifier);
        navigation.isFocused.mockReturnValue(false);
        jest.mocked(RootBar!.setSolid!).mockClear();
        act(() => renderer.update(page(100)));
        expect(RootBar!.setSolid).not.toHaveBeenCalled();
        navigation.isFocused.mockReturnValue(true);
        act(() => listeners.get('focus')!.forEach((listener) => listener()));
        expect(RootBar!.setSolid).toHaveBeenLastCalledWith(identifier, ground);
        mockSolidBar = false;
        act(() => renderer.update(page(100)));
        expect(RootBar!.remove).toHaveBeenLastCalledWith(identifier);
        expect(navigation.setOptions).toHaveBeenLastCalledWith(
          expect.objectContaining(largeTitleBar(ground)),
        );
        jest.mocked(RootBar!.remove).mockClear();
        jest.mocked(RootBar!.setSolid!).mockClear();
        mockSolidBar = true;
        act(() => renderer.update(page(100)));
        expect(RootBar!.setSolid).toHaveBeenLastCalledWith(identifier, ground);
        expect(RootBar!.remove).not.toHaveBeenCalled();
      } finally {
        mockSolidBar = false;
        act(() => renderer.unmount());
      }
    }),
);

// SearchSplit disables the large title through a sibling RouteOptions. The
// scrolling Screen still owns Search's changing idle/results ground.
const searchOwnerCases = [
  ['iPhone', false],
  ['iPad split', true],
] as const;
function searchOwnerPage(split: boolean) {
  return fadePage(
    'search',
    '(search)',
    false,
    false,
    false,
    split ? { headerLargeTitleEnabled: false } : undefined,
  );
}
function expectSolidSearch(
  navigation: ReturnType<typeof searchOwnerPage>['navigation'],
  split: boolean,
  ground = colors.sunken,
) {
  expect(RootBar!.remove).not.toHaveBeenCalled();
  const resolved = Object.assign(
    {},
    ...navigation.setOptions.mock.calls.map(([options]) => options),
  );
  expect(resolved).toMatchObject(
    split
      ? {
          ...opaqueBar(ground),
          headerTransparent: false,
          headerLargeTitleEnabled: false,
        }
      : { ...largeTitleBar(ground, true), headerLargeTitleEnabled: true },
  );
  expect(resolved.scrollEdgeEffects).toEqual({ top: 'hidden', bottom: 'soft' });
  if (!split)
    expect(RootBar!.setSolid).toHaveBeenLastCalledWith(
      'opax-root-bar-search-root',
      ground,
    );
}

test.each(searchOwnerCases)(
  'Search owner shape on %s keeps a cold solid bar while mounted',
  (_device, split) =>
    withGlass(() => {
      mockSolidBar = true;
      const { page, navigation } = searchOwnerPage(split);
      const renderer = tree(page(120));
      try {
        expectSolidSearch(navigation, split);
        act(() => renderer.update(page(68)));
        expectSolidSearch(navigation, split);
      } finally {
        act(() => renderer.unmount());
        mockSolidBar = false;
      }
    }),
);

test.each(searchOwnerCases)(
  'Search owner shape on %s responds to live solid mode on then off',
  (_device, split) =>
    withGlass(() => {
      const { page, navigation } = searchOwnerPage(split);
      const renderer = tree(page(68));
      try {
        mockSolidBar = true;
        act(() => renderer.update(page(68)));
        expectSolidSearch(navigation, split);
        // Results change the ground without changing appearance ownership.
        act(() => renderer.update(page(68, false)));
        expectSolidSearch(navigation, split, colors.paper);
        mockSolidBar = false;
        act(() => renderer.update(page(68, false)));
        expect(navigation.setOptions).toHaveBeenLastCalledWith(
          expect.objectContaining({
            headerTransparent: true,
            headerStyle: {},
            scrollEdgeEffects: { top: 'soft', bottom: 'soft' },
          }),
        );
        if (!split)
          expect(RootBar!.remove).toHaveBeenLastCalledWith(
            'opax-root-bar-search-root',
          );
      } finally {
        act(() => renderer.unmount());
        mockSolidBar = false;
      }
    }),
);

test.each(searchOwnerCases)(
  'Search owner shape on %s keeps its solid bar after refocus',
  (_device, split) =>
    withGlass(() => {
      mockSolidBar = true;
      const { page, navigation, listeners } = searchOwnerPage(split);
      const renderer = tree(page(68));
      try {
        navigation.isFocused.mockReturnValue(false);
        act(() => listeners.get('blur')?.forEach((listener) => listener()));
        jest.mocked(RootBar!.remove).mockClear();
        jest.mocked(RootBar!.setSolid!).mockClear();
        navigation.isFocused.mockReturnValue(true);
        act(() => listeners.get('focus')?.forEach((listener) => listener()));
        expectSolidSearch(navigation, split);
        act(() => renderer.update(page(120)));
        expectSolidSearch(navigation, split);
      } finally {
        act(() => renderer.unmount());
        mockSolidBar = false;
      }
    }),
);

test('the solid fallback follows a resize even if header height stays the same', () =>
  withGlass(() => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    mockSolidBar = true;
    const { page, navigation, identifier, ground } = fadePage(
      'index',
      '(today)',
    );
    const renderer = tree(page(68));
    try {
      navigation.setOptions.mockClear();
      jest.mocked(RootBar!.setSolid!).mockClear();
      act(() =>
        Dimensions.set({
          window: { ...window, width: window.width + 80, fontScale: 3.571 },
          screen: { ...screen, width: screen.width + 80, fontScale: 3.571 },
        }),
      );
      expect(RootBar!.setSolid).toHaveBeenLastCalledWith(identifier, ground);
      expect(navigation.setOptions).not.toHaveBeenCalled();
    } finally {
      act(() => renderer.unmount());
      mockSolidBar = false;
      Dimensions.set({ window, screen });
    }
  }));

test.each(['pushed screen', 'sheet'])(
  '%s retains an opaque, non-translucent bar on iOS 26',
  (kind) => {
    const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 26,
    });
    const route = {
      key: 'current',
      name: kind === 'sheet' ? 'index' : 'bill/[key]',
    };
    const setOptions = jest.fn();
    const navigation = {
      isFocused: () => true,
      addListener: () => () => {},
      setOptions,
      getState: () =>
        kind === 'sheet'
          ? { index: 0, routes: [route], routeNames: ['index', 'ask'] }
          : {
              index: 1,
              routes: [{ key: 'root', name: 'index' }, route],
              routeNames: sharedScreens('(today)', false).map(
                (entry) => entry.props.name,
              ),
            },
    };
    const page = (height: number) => (
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <HeaderHeightContext.Provider value={height}>
            <Screen grouped>
              <View />
            </Screen>
          </HeaderHeightContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );
    const renderer = tree(page(120));
    try {
      for (const height of [120, 90, 44, 120]) {
        act(() => renderer.update(page(height)));
        expect(setOptions).toHaveBeenLastCalledWith(opaqueBar(colors.sunken));
      }
    } finally {
      act(() => renderer.unmount());
      Object.defineProperty(Platform, 'Version', version);
    }
  },
);

test('an older native binary without setSolid does not crash on mount or focus', () =>
  withGlass(() => {
    const method = RootBar!.setSolid;
    mockSolidBar = true;
    Object.defineProperty(RootBar, 'setSolid', {
      configurable: true,
      value: undefined,
    });
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    try {
      const { page, listeners } = fadePage('index', '(today)');
      expect(() => {
        renderer = tree(page(120));
      }).not.toThrow();
      expect(() =>
        act(() => listeners.get('focus')!.forEach((listener) => listener())),
      ).not.toThrow();
    } finally {
      if (renderer) act(() => renderer!.unmount());
      mockSolidBar = false;
      Object.defineProperty(RootBar, 'setSolid', {
        configurable: true,
        value: method,
      });
    }
  }));

test.each([26, 27])(
  'iOS %s keeps Talk and pushed bars non-translucent with a hard edge',
  (version) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: version,
    });
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    try {
      renderer = tree(<TalkStack />);
      const options = renderer.root.findByType(Stack).props.screenOptions;
      expect(options).toMatchObject({
        ...opaqueBar(colors.paper),
        headerTransparent: false,
        scrollEdgeEffects: { top: 'hard', bottom: 'soft' },
      });
      for (const entry of renderer.root.findAllByType(Stack.Screen))
        expect({ ...options, ...entry.props.options }.headerTransparent).toBe(
          false,
        );
    } finally {
      if (renderer) act(() => renderer!.unmount());
      Object.defineProperty(Platform, 'Version', descriptor);
    }
  },
);

// Grants and Agencies draw their title in the page (sweep 2 item 11), since
// the system large title cannot wrap; money-public-screens asserts that
// heading ("the four public money pages set their titles at one size").
test.each([
  ['leads', 'Leads', { headerLargeTitle: true }, true],
  ['money-donors', 'Donors', { headerLargeTitle: true }, false],
  [
    'connections',
    'Programs and places',
    { headerLargeTitleEnabled: true },
    false,
  ],
  [
    'grants-allocation',
    'Community funding',
    { headerLargeTitleEnabled: true },
    false,
  ],
] as const)(
  '%s retains a visible native large title and soft edge when pushed',
  (name, title, options, screenOwner) =>
    withGlass(() => {
      const { page, navigation } = fadePage(
        name,
        '(today)',
        true,
        screenOwner,
        false,
        { title, ...options },
      );
      const renderer = tree(page(120));
      try {
        expect(RootBar!.setSolid).not.toHaveBeenCalled();
        const resolved = Object.assign(
          {},
          ...navigation.setOptions.mock.calls.map(([options]) => options),
        );
        expect(resolved).toMatchObject({
          ...largeTitleBar(colors.paper),
          title,
          headerLargeTitleEnabled: true,
          // Opaque appearances suppress UIKit's iOS 26 large title.
          headerStyle: {},
          headerLargeStyle: {},
          headerTransparent: true,
          scrollEdgeEffects: { top: 'soft', bottom: 'soft' },
        });
        expect(resolved.headerStyle).toEqual({});
        expect(resolved.headerLargeStyle).toEqual({});
        expect(resolved).not.toHaveProperty('headerBackground');
        expect(resolved).not.toHaveProperty('headerBlurEffect');
        navigation.setOptions.mockClear();
        for (const height of [100, 68, 120])
          act(() => renderer.update(page(height)));
        expect(navigation.setOptions).not.toHaveBeenCalled();
      } finally {
        act(() => renderer.unmount());
      }
    }),
);

test.each(['unspecified', 'leading', 'trailing'] as const)(
  'form sheets retain the paper bar and inherited %s edge',
  (edge) => {
    mockBarEdge = edge;
    let chrome!: ReturnType<typeof useStackChrome>;
    function Harness() {
      chrome = useStackChrome();
      return null;
    }
    const renderer = tree(<Harness />);
    try {
      expect(sheetOptions).not.toHaveProperty('scrollEdgeEffects');
      const resolved = { ...chrome, ...sheetOptions };
      expect(resolved.scrollEdgeEffects).toEqual(chrome.scrollEdgeEffects);
      expect(resolved).toMatchObject({
        ...opaqueBar(colors.paper),
        headerTransparent: false,
      });
    } finally {
      act(() => renderer.unmount());
    }
  },
);

test.each([18, 26, 27])(
  'iOS %s Screen preserves the electorate route transparency from build 57',
  (version) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: version,
    });
    const route = { key: 'electorate', name: 'electorate/[id]' };
    const navigation = {
      isFocused: () => true,
      addListener: () => () => {},
      setOptions: jest.fn(),
      getState: () => ({
        index: 1,
        routes: [{ key: 'root', name: 'your-mp' }, route],
        routeNames: sharedScreens('(your-mp)', false).map(
          (entry) => entry.props.name,
        ),
      }),
    };
    let registration!: NativeStackNavigationOptions;
    // The route captures glassBar() at module load, just as on a cold launch.
    jest.isolateModules(() => {
      const { Platform: platform } =
        jest.requireActual<typeof import('react-native')>('react-native');
      Object.defineProperty(platform, 'Version', {
        configurable: true,
        value: version,
      });
      const { yourMpScreens } = jest.requireActual<
        typeof import('../src/navigation/stack/your-mp')
      >('../src/navigation/stack/your-mp');
      registration = yourMpScreens('(your-mp)', false)
        .find((entry) => entry.props.name === route.name)!
        .props.options({ route, navigation });
    });
    const renderer = tree(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <Screen grouped>
            <View />
          </Screen>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
    try {
      expect(navigation.setOptions).toHaveBeenLastCalledWith(
        opaqueBar(colors.sunken),
      );
      const resolved = Object.assign(
        {},
        registration,
        ...navigation.setOptions.mock.calls.map(([options]) => options),
      );
      expect(resolved).toMatchObject({
        ...opaqueBar(colors.sunken),
        headerTransparent: version >= 26,
      });
    } finally {
      act(() => renderer.unmount());
      Object.defineProperty(Platform, 'Version', descriptor);
    }
  },
);

test('More keeps its page title out and ends in one public-site action', () => {
  for (const items of [
    [],
    [
      {
        title: 'Cite',
        inline: true,
        items: [{ title: 'Copy APA 7', onPress: jest.fn() }],
      },
      { title: 'Open on opax.com.au', onPress: jest.fn() },
      { title: 'Share', onPress: jest.fn() },
    ],
  ]) {
    const menu = pageMenu({ name: 'A full record title', items });
    if (menu.type !== 'menu') throw new Error('Expected a menu');
    expect(menu.menu).not.toHaveProperty('title');
    expect(menu.menu.items.at(-1)?.label).toBe(
      menuTitle('Open on opax.com.au'),
    );
    expect(
      menu.menu.items.filter(
        (row) => row.label === menuTitle('Open on opax.com.au'),
      ),
    ).toHaveLength(1);
  }
});

// Duo audit finding 3: on the folded display the tab items move to a side
// rail, but the title and search field stay at the top. A soft top edge let
// scrolled text show through the glass search field and hid the title.
describe('scroll edges on every bar shape', () => {
  // Phones, the unfolded Duo and iPad keep a horizontal bar ('unspecified').
  test.each([
    ['iPhone', 'unspecified'],
    ['Duo unfolded', 'unspecified'],
    ['iPad', 'unspecified'],
  ] as const)('%s: the top edge follows the page', (_device, edge) => {
    expect(barScrollEdges(edge)).toEqual({ top: 'hard', bottom: 'soft' });
    expect(barScrollEdges(edge, 'soft')).toEqual({
      top: 'soft',
      bottom: 'soft',
    });
    expect(barScrollEdges(edge, 'hidden')).toEqual({
      top: 'hidden',
      bottom: 'soft',
    });
  });
  test.each([
    ['leading', 'left', 'right'],
    ['trailing', 'right', 'left'],
  ] as const)(
    'Duo folded, %s rail: the top edge follows the page under the title and search field',
    (edge, rail, far) => {
      for (const active of ['hard', 'soft'] as const) {
        const edges = barScrollEdges(edge, active);
        expect(edges.top).toBe(active);
        expect(edges.bottom).toBe('soft');
        expect(edges[rail]).toBe(active);
        expect(edges[far]).toBe('soft');
      }
      // A solid bar draws its own ground; nothing scrolls under it.
      expect(barScrollEdges(edge, 'hidden').top).toBe('hidden');
    },
  );
  test('a glass tab root on the folded rail is soft at rest and hard under content', () =>
    withGlass(() => {
      expect(scrollBar(colors.paper, false, 'leading', false)).toMatchObject({
        headerTransparent: true,
        scrollEdgeEffects: { top: 'soft', left: 'soft' },
      });
      expect(scrollBar(colors.paper, false, 'leading', true)).toMatchObject({
        scrollEdgeEffects: { top: 'hard', left: 'soft' },
      });
      expect(scrollBar(colors.paper, false, 'unspecified')).toMatchObject({
        scrollEdgeEffects: { top: 'soft', bottom: 'soft' },
      });
    }));
  test.each([
    ['leading', false],
    ['trailing', false],
    ['leading', true],
    ['trailing', true],
  ] as const)(
    'Today on the %s rail (isPad=%s) leaves the map whole at rest and covers it from the first scroll point',
    (edge, pad) =>
      withGlass(() => {
        const idiom = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(pad);
        mockBarEdge = edge;
        const { page, navigation } = fadePage('index', '(today)');
        const renderer = tree(page(100));
        try {
          expect(edgeCalls(navigation).at(-1)).toBe('soft');
          navigation.setOptions.mockClear();
          scrollTo(renderer, -100);
          scrollTo(renderer, -110);
          expect(edgeCalls(navigation)).toEqual([]);
          scrollTo(renderer, -98);
          scrollTo(renderer, 20);
          expect(edgeCalls(navigation)).toEqual(['hard']);
          scrollTo(renderer, -100);
          expect(edgeCalls(navigation)).toEqual(['hard', 'soft']);
        } finally {
          act(() => renderer.unmount());
          idiom.mockRestore();
        }
      }),
  );
  test.each(['leading', 'trailing'] as const)(
    'pushed pages on a %s rail keep the hard top edge',
    (edge) => {
      mockBarEdge = edge;
      let chrome!: ReturnType<typeof useStackChrome>;
      function Harness() {
        chrome = useStackChrome();
        return null;
      }
      const renderer = tree(<Harness />);
      try {
        expect(chrome.scrollEdgeEffects).toMatchObject({
          top: 'hard',
          bottom: 'soft',
        });
      } finally {
        act(() => renderer.unmount());
      }
    },
  );
  test('the Search root on the folded rail sets a hard top edge under its search field', () =>
    withGlass(() => {
      mockBarEdge = 'trailing';
      const { page, navigation } = searchOwnerPage(false);
      const renderer = tree(page(68));
      try {
        const resolved = Object.assign(
          {},
          ...navigation.setOptions.mock.calls.map(([options]) => options),
        );
        expect(resolved).toMatchObject({
          headerTransparent: true,
          scrollEdgeEffects: { top: 'soft', bottom: 'soft', right: 'soft' },
        });
        expect(resolved.headerLargeTitleEnabled).not.toBe(true);
        scrollTo(renderer, -68 + 2);
        expect(edgeCalls(navigation).at(-1)).toBe('hard');
      } finally {
        act(() => renderer.unmount());
      }
    }));
});

test('the scroll publisher never applies options or native backing', () =>
  withGlass(() => {
    const navigation = { setOptions: jest.fn() };
    function Publisher({ underBar }: { underBar: boolean }) {
      useRootBarUnderBar(underBar);
      return null;
    }
    const page = (underBar: boolean) => (
      <NavigationContext.Provider value={navigation as never}>
        <Publisher underBar={underBar} />
      </NavigationContext.Provider>
    );
    const renderer = tree(page(false));
    try {
      for (const value of [false, true, true, false])
        act(() => renderer.update(page(value)));
      expect(navigation.setOptions).not.toHaveBeenCalled();
      expect(RootBar!.setSolid).not.toHaveBeenCalled();
      expect(RootBar!.remove).not.toHaveBeenCalled();
    } finally {
      act(() => renderer.unmount());
    }
  }));
