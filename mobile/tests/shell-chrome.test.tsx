import { Stack } from 'expo-router';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import React, { act } from 'react';
import { Animated, Dimensions, Platform, StyleSheet, View } from 'react-native';
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
  glassBar,
  largeTitleBar,
  opaqueBar,
  pageItems,
  pageMenu,
  rootHeaderItems,
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
  barTitleWidth,
  emptyBarTitle,
  inlineTitleScaleCap,
  useTitleOnScroll,
} from '../src/navigation/useTitleOnScroll';

const { colors } = tokens;

jest.mock('../modules/opax-root-bar', () => ({
  RootBar: { setSolid: jest.fn(), remove: jest.fn() },
  useVerticalBarEdge: () => 'unspecified',
}));
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
  return result;
}
afterEach(() => {
  mockBuild.isProduction = false;
  mockReducedMotion = false;
  mockSignedIn = false;
  mockVoiceLinked = true;
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
      expect(items[0]).toMatchObject({
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
      expect.objectContaining({ label: 'Account' }),
      expect.objectContaining({ label: 'New question', disabled: true }),
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
    expect.objectContaining({ label: 'Account' }),
    expect.objectContaining({
      label: 'New question',
      disabled: false,
      onPress: onNew,
    }),
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
    try {
      view = tree(<Harness />);
      expect(chrome.headerLargeTitleStyle).toEqual({
        fontFamily: tokens.textStyles.largeTitle.fontFamily,
        fontWeight: tokens.textStyles.largeTitle.fontWeight,
        fontSize: expectedSize,
        color: colors.ink,
      });
    } finally {
      if (view) act(() => view!.unmount());
      Dimensions.set({ window, screen });
    }
  },
);

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
  test('at rest the title keeps its text and width, hidden only by opacity and accessibility', () => {
    const view = tree(
      <BarTitle title="Interactive Gambling Bill" shown={false} />,
    );
    expect(style(view).maxWidth).toBeGreaterThan(0);
    expect(style(view).maxWidth).toBe(
      barTitleWidth(Dimensions.get('window').width, 2),
    );
    expect(style(view).opacity.__getValue()).toBe(0);
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
    expect(style(view).opacity.__getValue()).toBe(1);
    expect(text.props.accessibilityElementsHidden).toBe(false);
    expect(text.props.importantForAccessibility).toBe('auto');
    expect(style(view).maxWidth).toBe(
      barTitleWidth(Dimensions.get('window').width, 2),
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
    expect(style(view).opacity.__getValue()).toBe(0);
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
  expect(animation).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ duration: 0 }),
  );
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
    ...(explicit ? { headerLargeTitle: true } : { title: name }),
    ...(pinned
      ? {
          headerSearchBarOptions: {
            hideWhenScrolling: false,
            placement: 'stacked' as const,
          },
        }
      : {}),
  };
  const ground = explicit
    ? screenOwner
      ? colors.sunken
      : colors.paper
    : tabRootGround(name);
  const page = (height: number) => (
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={route}>
        <SafeAreaInsetsContext.Provider
          value={{ top: 24, bottom: 0, left: 0, right: 0 }}
        >
          <HeaderHeightContext.Provider value={height}>
            {(!usesScreen || explicit || pinned) && (
              <RouteOptions options={options} />
            )}
            {usesScreen && (
              <Screen grouped={name !== 'bills'}>
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
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
  jest.mocked(RootBar!.setSolid!).mockClear();
  jest.mocked(RootBar!.remove).mockClear();
  try {
    test();
  } finally {
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
        expect(RootBar!.setSolid).not.toHaveBeenCalled();
      } finally {
        act(() => renderer.unmount());
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
        navigation.setOptions.mockClear();
        for (const height of [100, 68, 120, 144]) {
          act(() => renderer.update(page(height)));
          expect(RootBar!.setSolid).toHaveBeenLastCalledWith(
            identifier,
            ground,
          );
        }
        expect(navigation.setOptions).not.toHaveBeenCalled();
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
      } finally {
        mockSolidBar = false;
        act(() => renderer.unmount());
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
        expect(setOptions).toHaveBeenLastCalledWith({
          ...opaqueBar(colors.sunken),
          headerTransparent: false,
        });
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

test.each(['grants', 'leads', 'money-donors'])(
  '%s cannot opt a pushed list into the root soft edge',
  (name) =>
    withGlass(() => {
      const { page, navigation } = fadePage(name, '(today)', true, true);
      const renderer = tree(page(120));
      try {
        // The mounted Screen owns the pushed list's opaque ground, even when
        // RouteOptions requests a large title for that list.
        const screen = renderer.root.findByType(Screen);
        expect(screen.props.grouped).toBe(true);
        expect(RootBar!.setSolid).not.toHaveBeenCalled();
        const resolved = Object.assign(
          {},
          ...navigation.setOptions.mock.calls.map(([options]) => options),
        );
        expect(resolved).toMatchObject({
          ...opaqueBar(colors.sunken),
          headerTransparent: false,
        });
      } finally {
        act(() => renderer.unmount());
      }
    }),
);

test('form sheets explicitly retain the paper bar and hard top edge', () => {
  expect(sheetOptions).toMatchObject({
    ...opaqueBar(colors.paper),
    headerTransparent: false,
    scrollEdgeEffects: { top: 'hard', bottom: 'soft' },
  });
});
