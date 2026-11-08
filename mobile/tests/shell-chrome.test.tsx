import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Animated, Dimensions, Platform, StyleSheet, View } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import AskRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/ask';
import { askScreens } from '../src/navigation/stack/ask';
import { tabRootScreen, untitled } from '../src/navigation/stack/screen';
import {
  pageItems,
  pageMenu,
  rootHeaderItems,
  askHeaderItems,
  opaqueBar,
  glassBar,
  useStackChrome,
  shortSheet,
  androidHeaderBar,
} from '../src/navigation/chrome';
import {
  useTitleOnScroll,
  BarTitle,
  barTitleWidth,
  emptyBarTitle,
  inlineTitleScaleCap,
} from '../src/navigation/useTitleOnScroll';
import { recordsScreens } from '../src/navigation/stack/records';
import { editionScreens } from '../src/navigation/stack/edition';
import {
  ExternalURLProbe,
  recordExternalURL,
} from '../src/navigation/source-destination';
import { designFlags } from '../src/design/flags';
import { colors } from '../src/design/tokens';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
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
  useReduceMotionSetting: () => mockReducedMotion,
}));
let mockReducedMotion = false;
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
test('iOS 26 leaves material to the system and older bars accept the screen ground', () => {
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
  expect(opaqueBar(colors.sunken)).toEqual({});
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 18 });
  expect(opaqueBar(colors.sunken)).toMatchObject({
    headerStyle: { backgroundColor: colors.sunken },
  });
  if (version) Object.defineProperty(Platform, 'Version', version);
});
test('tab roots are translucent on iOS 26 and opaque on iOS 18.4 to 25', () => {
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  const rootOptions = () =>
    [
      tabRootScreen('(today)', '(today)', 'index', 'Today', false)[0]!,
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
  expect(setOptions).not.toHaveBeenCalled();
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
const mockFlags = { searchTab: true, talkInAsk: true };
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

describe('bar titles leave room for a named back button (wave 4 bills-06, money-03)', () => {
  const style = (view: TestRenderer.ReactTestRenderer) =>
    StyleSheet.flatten(view.root.findByType(Animated.Text).props.style);
  test('at rest the title view has no width and no text', () => {
    const view = tree(
      <BarTitle title="Interactive Gambling Bill" shown={false} />,
    );
    expect(style(view).maxWidth).toBe(0);
    expect(view.root.findByType(Animated.Text).props.children).toBe('');
    act(() => view.unmount());
  });
  test('shown, it truncates inside the bar items, never under them (bills-07)', () => {
    const view = tree(
      <BarTitle title="Interactive Gambling Bill" shown trailing={2} />,
    );
    const text = view.root.findByType(Animated.Text);
    expect(text.props.children).toBe('Interactive Gambling Bill');
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.ellipsizeMode).toBe('tail');
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
  test('hiding keeps the width while it fades, then gives it back', () => {
    let finish: Animated.EndCallback | undefined;
    const timing = jest.spyOn(Animated, 'timing').mockImplementation(
      () =>
        ({
          start: (callback?: Animated.EndCallback) => {
            finish = callback;
          },
          stop: () => undefined,
        }) as unknown as Animated.CompositeAnimation,
    );
    const view = tree(<BarTitle title="Member" shown />);
    act(() => view.update(<BarTitle title="Member" shown={false} />));
    expect(style(view).maxWidth).toBeGreaterThan(0);
    act(() => finish?.({ finished: true }));
    expect(style(view).maxWidth).toBe(0);
    act(() => view.unmount());
    timing.mockRestore();
  });
  test('reader and edition routes keep their title for the next back button', () => {
    expect(untitled.headerTitle).toBe(emptyBarTitle);
    const options = (screen: React.ReactElement) =>
      (
        screen.props as {
          options: (p: object) => { title: string; headerTitle?: unknown };
        }
      ).options({ route: { params: {} }, navigation: undefined });
    for (const screen of [...recordsScreens(), ...editionScreens()]) {
      const resolved = options(screen);
      expect(resolved.headerTitle).not.toBe('');
      expect(resolved.title).not.toBe('');
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
