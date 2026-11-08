import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Animated, Platform } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import AskRoute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/ask';
import { askScreens } from '../src/navigation/stack/ask';
import { tabRootScreen } from '../src/navigation/stack/screen';
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
  inlineTitleScaleCap,
} from '../src/navigation/useTitleOnScroll';
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
  'Ask registration, wrapper and AskScreen agree on the interim bar when signed in: %s',
  (signedIn) => {
    mockSignedIn = signedIn;
    const view = tree(<AskRoute />);
    const wrapper = () => view.root.findByType(Stack.Screen).props.options;
    const registration = askScreens('(ask)', signedIn)
      .find((screen) => screen.props.name === 'ask')!
      .props.options({ route: { params: {} } });
    const expected = rootHeaderItems();
    expect(expected).toMatchObject([
      { accessibilityLabel: 'Account' },
      { accessibilityLabel: 'Talk to OPAX', icon: { name: 'waveform' } },
    ]);
    for (const options of [wrapper(), registration]) {
      expect(options.unstable_headerRightItems()).toEqual(expected);
      expect(options).not.toHaveProperty('unstable_headerLeftItems');
    }
    act(() => view.update(<AskRoute />));
    expect(wrapper().unstable_headerRightItems()).toEqual(rootHeaderItems());
    const talk = expected[1];
    if (talk.type === 'button') talk.onPress?.();
    expect(router.push).toHaveBeenLastCalledWith('/talk');
    mockVoiceLinked = false;
    expect(rootHeaderItems()).toHaveLength(1);
    expect(wrapper().unstable_headerRightItems()).toEqual(rootHeaderItems());
    expect(registration.unstable_headerRightItems()).toEqual(rootHeaderItems());
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
