import { act, createRef, type ReactNode } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '../src/design/layout';
import { androidHeaderBar, pageItems } from '../src/navigation/chrome';
import { androidTabsHidden } from '../src/navigation/AndroidTabs';
import { AndroidTabIcon } from '../src/navigation/AndroidTabIcon';
import { AndroidBottomSheet } from '../src/navigation/AndroidSheet';
import { AndroidReadingHeader } from '../src/navigation/AndroidReadingHeader';
import { routeSheetOptions, SheetFrame } from '../src/features/sheets/frame';
import { citationBar } from '../src/features/sheets/CitationSheet';
import { filtersScreens } from '../src/navigation/stack/filters';
import { rootScreens } from '../src/navigation/stack/root';
import { FiltersHeader } from '../src/features/sheets/FilterRoutes';
import * as safeArea from 'react-native-safe-area-context';
import { screen } from '../src/navigation/stack/screen';
import { exploreScreens } from '../src/navigation/stack/explore';
import { Icon } from '../src/design/icon';
import { AndroidMenuHost } from '../src/design/menu';
import { Pressable as MenuPressable } from '../src/design/pressable';
import { Text } from '../src/design/text';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useAndroidRootScroll } from '../src/navigation/useAndroidRootScroll';
import BillsList from '../src/features/bills/BillsList';
import AskScreen from '../src/features/ask/AskScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  Stack: { Screen: () => null },
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    bills: () => new Promise(() => {}),
    roster: () => new Promise(() => {}),
  },
  client: {},
}));
jest.mock('../src/api/useOffline', () => ({ useOffline: () => false }));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: null }),
  accountSnapshot: () => ({ status: null }),
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/features/ask/store', () => {
  const saved = { v: 1, active: null, chats: [] };
  return {
    chatsSnapshot: () => saved,
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: () => Promise.resolve(),
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

function render(children: ReactNode) {
  let result!: TestRenderer.ReactTestRenderer;
  act(() => {
    result = TestRenderer.create(<>{children}</>);
  });
  return result.root;
}
const originalOS = Platform.OS;
afterEach(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: originalOS,
  });
});
function platform(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

test('Android header actions use icons, ripple, hints and disabled semantics', () => {
  platform('android');
  const onPress = jest.fn();
  const tree = render(
    androidHeaderBar([
      {
        type: 'button',
        label: 'New question',
        icon: { type: 'sfSymbol', name: 'square.and.pencil' },
        disabled: true,
        onPress,
      },
      ...pageItems({ name: 'Record', share: onPress, menu: [] })(),
    ]),
  );
  const buttons = tree.findAll(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function',
  );
  expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
    'New question',
    'Share Record',
    'More for Record',
  ]);
  expect(buttons[0]!.props).toMatchObject({
    disabled: true,
    accessibilityState: { disabled: true },
  });
  for (const button of buttons) {
    expect(button.props.android_ripple).toBeDefined();
    expect(button.props.onLongPress).toEqual(expect.any(Function));
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({
      minWidth: 48,
      minHeight: 48,
    });
  }
  expect(buttons.at(-1)!.findByType(Icon).props.name).toBe('ellipsis');
});

test('Android More menus draw an untitled section’s items in place, destructive in red', () => {
  platform('android');
  const forget = jest.fn();
  // Your MP's shape: the destructive item alone in an untitled inline section.
  const tree = render(
    <>
      <AndroidMenuHost />
      {androidHeaderBar(
        pageItems({
          name: 'Grayndler',
          menu: [
            { title: 'Copy link', symbol: 'link', onPress: jest.fn() },
            {
              title: '',
              inline: true,
              items: [
                {
                  title: 'Forget my electorate',
                  symbol: 'minus.circle',
                  destructive: true,
                  onPress: forget,
                },
              ],
            },
          ],
        })(),
      )}
    </>,
  );
  const more = tree.find(
    (node) =>
      node.props?.testID === 'header-more' &&
      typeof node.props.onPress === 'function',
  );
  act(() => more.props.onPress());
  const rows = tree
    .findAllByType(MenuPressable)
    .filter((row) => row.props.accessibilityRole === 'menuitem');
  expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
    'Copy link',
    'Forget my electorate',
    'Open on opax.com.au',
  ]);
  const label = rows[1]!.findByType(Text);
  expect(label.props.tone).toBe('danger');
  act(() => rows[1]!.props.onPress());
  expect(forget).toHaveBeenCalledTimes(1);
});

test.each(['ios', 'android'] as const)(
  '%s rendered header actions speak each label and menu hint once',
  (os) => {
    platform(os);
    const tree = render(
      androidHeaderBar([
        { type: 'button', label: 'Done', onPress: jest.fn() },
        ...pageItems({ name: 'Record', share: jest.fn(), menu: [] })(),
      ]),
    );
    const buttons = tree.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityRole === 'button',
    );
    expect(
      buttons.map((button) => [
        button.props.accessibilityLabel,
        button.props.accessibilityHint,
      ]),
    ).toEqual([
      ['Done', undefined],
      ['Share Record', undefined],
      ['More for Record', 'Opens more actions'],
    ]);
    for (const button of buttons) {
      const { accessibilityLabel, accessibilityHint } = button.props;
      if (accessibilityHint)
        expect(accessibilityLabel).not.toContain(accessibilityHint);
    }
  },
);

test.each([
  'newspaper',
  'building.columns',
  'doc.text',
  'text.bubble',
] as const)(
  '%s has a filled selected silhouette and outlined idle symbol',
  (symbol) => {
    expect(
      render(<AndroidTabIcon symbol={symbol} focused={false} />).findByType(
        Icon,
      ).props.name,
    ).toBe(symbol);
    expect(
      render(<AndroidTabIcon symbol={symbol} focused />).findAllByType(Icon),
    ).toHaveLength(0);
  },
);

test('full-screen viewers and filter dialogs hide the Android tab bar', () => {
  expect(androidTabsHidden(['(tabs)', '(today)', 'explore', 'photo'])).toBe(
    true,
  );
  expect(androidTabsHidden(['(tabs)', '(ask)', 'filters', '[list]'])).toBe(
    true,
  );
  expect(
    androidTabsHidden(['(tabs)', '(ask)', 'filters', '[list]', '[facet]']),
  ).toBe(true);
  for (const route of ['index', 'bill/[key]', 'doc/[slug]', 'money'])
    expect(androidTabsHidden(['(tabs)', '(today)', route])).toBe(false);
});

test('Android route sheets are dimmed native bottom sheets, full height at large font sizes', () => {
  platform('android');
  for (const options of [
    {},
    { short: true },
    { citation: true },
    { short: true, table: true },
  ]) {
    expect(routeSheetOptions(options)).toMatchObject({
      presentation: 'formSheet',
      headerShown: false,
      sheetAllowedDetents: [0.5, 1],
      sheetGrabberVisible: true,
      sheetLargestUndimmedDetentIndex: -1,
    });
    expect(routeSheetOptions({ ...options, accessible: true })).toMatchObject({
      sheetAllowedDetents: [1],
      sheetInitialDetentIndex: 0,
    });
  }
  const tree = render(
    <SheetFrame title="Sources" testID="source-sheet">
      Content
    </SheetFrame>,
  );
  expect(
    tree.findAll(
      (node) =>
        node.props.role === 'dialog' &&
        node.props.accessibilityLabel === 'Sources',
    ).length,
  ).toBeGreaterThan(0);
  expect(
    tree.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityRole === 'button',
    ).props.accessibilityLabel,
  ).toBe('Done');
});

test.each([1, 2])(
  'Android sheet heading at font scale %s: the title keeps the default insets and Close stays on its row',
  (fontScale) => {
    platform('android');
    const rn = jest.requireActual('react-native');
    const dims = jest
      .spyOn(rn, 'useWindowDimensions')
      .mockReturnValue({ width: 412, height: 915, scale: 2.625, fontScale });
    try {
      const tree = render(
        <SheetFrame title="Sources" testID="source-sheet">
          Content
        </SheetFrame>,
      );
      const rows = tree.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === 'sheet-heading',
      );
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      const title = row.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'header',
      );
      const close = row.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === 'Done',
      );
      expect(title.props.children).toBe('Sources');
      expect(close).toBeDefined();
      const rowStyle = StyleSheet.flatten(row.props.style);
      const titleStyle = StyleSheet.flatten(title.props.style);
      // Row inset plus title inset: the same screen margin at both sizes.
      expect(rowStyle.paddingHorizontal).toBe(8);
      expect(titleStyle.paddingHorizontal).toBe(8);
      expect(titleStyle.flex).toBe(1);
      expect(rowStyle.flexDirection).toBe('row');
      // A wrapped title keeps Close at the top of the row.
      if (fontScale > 1) expect(rowStyle.alignItems).toBe('flex-start');
    } finally {
      dims.mockRestore();
    }
  },
);

test('Android citation navigation retains previous, next and overflow actions inside the sheet', () => {
  platform('android');
  const previous = jest.fn();
  const next = jest.fn();
  const bar = citationBar({ previous, next });
  const tree = render(
    <SheetFrame title="Citation 2" options={bar}>
      Source
    </SheetFrame>,
  );
  const buttons = tree.findAll(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function',
  );
  expect(buttons.map((node) => node.props.accessibilityLabel)).toEqual([
    'Previous source',
    'Next source',
    'Done',
  ]);
  act(() => buttons[0]!.props.onPress());
  act(() => buttons[1]!.props.onPress());
  expect(previous).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledTimes(1);
});

test('Android filter stacks use the supported full-screen dialog fallback', () => {
  platform('android');
  const element = filtersScreens()[0]!;
  expect(
    element.props.options({ route: {}, navigation: undefined }),
  ).toMatchObject({ presentation: 'fullScreenModal', headerShown: false });
});

function licencesOptions() {
  const element = rootScreens().find((node) => node.key === 'licences')!;
  return element.props.options({
    route: { params: {} },
    navigation: undefined,
  });
}

test('Android gives a deep-linked Sources and licences its own bar; iOS keeps its sheet bar', () => {
  platform('android');
  expect(licencesOptions()).toMatchObject({
    presentation: 'modal',
    headerShown: true,
    header: AndroidReadingHeader,
    title: 'Sources and licences',
  });
  platform('ios');
  const ios = licencesOptions();
  expect(ios).toMatchObject({ presentation: 'modal', headerShown: true });
  expect(ios.header).toBeUndefined();
});

test('Android filter dialogs pad their bar from the window insets from the first frame', () => {
  platform('android');
  const hook = safeArea.useSafeAreaInsets as jest.Mock;
  const original = hook.getMockImplementation();
  hook.mockImplementation(() => ({ top: 24, bottom: 16, left: 0, right: 0 }));
  const options = {
    title: 'Options',
    presentation: 'card',
    unstable_headerRightItems: () => [
      { type: 'button', label: 'Done', onPress: jest.fn() },
    ],
  };
  const props = {
    navigation: { goBack: jest.fn() },
    route: { key: 'options', name: '[list]' },
    options,
  } as unknown as Parameters<typeof AndroidReadingHeader>[0];
  const padded = render(<AndroidReadingHeader {...props} windowInsets />);
  const bar = padded.findByProps({ testID: 'android-header-window-insets' });
  expect(StyleSheet.flatten(bar.props.style)).toMatchObject({ paddingTop: 24 });
  // Other Android bars keep measuring natively.
  const native = render(<AndroidReadingHeader {...props} />);
  expect(
    native.findAllByProps({ testID: 'android-header-window-insets' }),
  ).toHaveLength(0);
  // The filters' dialog header is that window-inset bar.
  expect(
    render(<FiltersHeader {...props} />).findAllByProps({
      testID: 'android-header-window-insets',
    }),
  ).not.toHaveLength(0);
  hook.mockImplementation(original);
});

test('Android dialog headers reuse the route close action and show one close control', () => {
  platform('android');
  const close = jest.fn();
  const tree = render(
    <AndroidReadingHeader
      {...({
        navigation: { goBack: jest.fn() },
        route: { key: 'dialog', name: 'dialog' },
        back: { title: 'Today' },
        options: {
          title: 'Sources',
          presentation: 'modal',
          unstable_headerRightItems: () => [
            { type: 'button', label: 'Done', onPress: close },
          ],
        },
      } as unknown as Parameters<typeof AndroidReadingHeader>[0])}
    />,
  );
  const buttons = tree.findAll(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function',
  );
  expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
    'Close',
  ]);
  act(() => buttons[0]!.props.onPress());
  expect(close).toHaveBeenCalledTimes(1);
});

test('iOS retains form sheets, fitted notes, accessible detents and the undimmed citation', () => {
  platform('ios');
  expect(routeSheetOptions()).toMatchObject({
    presentation: 'formSheet',
    headerShown: true,
    sheetAllowedDetents: [0.5, 1],
  });
  expect(routeSheetOptions({ short: true }).sheetAllowedDetents).toBe(
    'fitToContents',
  );
  expect(
    routeSheetOptions({ citation: true }).sheetLargestUndimmedDetentIndex,
  ).toBe(0);
  expect(routeSheetOptions({ accessible: true })).toMatchObject({
    sheetAllowedDetents: [0.5, 1],
    sheetInitialDetentIndex: 1,
  });
  expect(
    filtersScreens()[0]!.props.options({ route: {}, navigation: undefined })
      .presentation,
  ).toBe('formSheet');
  expect(routeSheetOptions().header).not.toBe(AndroidReadingHeader);
  const bar = citationBar({ previous: jest.fn() });
  expect(bar).not.toHaveProperty('headerLeft');
  expect(bar.unstable_headerLeftItems().map((item) => item.label)).toEqual([
    'Previous source',
    'Next source',
  ]);
});

test('Android pushed titles are start aligned while iOS keeps its declared alignment', () => {
  const options = { headerTitleAlign: 'center' as const };
  platform('android');
  expect(
    screen('detail', 'Record', options).props.options({
      route: {},
      navigation: undefined,
    }).headerTitleAlign,
  ).toBe('left');
  const androidTool = exploreScreens().find(
    (element) => element.props.name === 'explore/[tool]',
  )!;
  expect(
    androidTool.props.options({ route: {}, navigation: undefined })
      .headerTitleAlign,
  ).toBe('left');
  platform('ios');
  expect(
    screen('detail', 'Record', options).props.options({
      route: {},
      navigation: undefined,
    }).headerTitleAlign,
  ).toBe('center');
});

test('action menus have a dialog title and native Modal handles Back before the stack', () => {
  platform('android');
  const close = jest.fn();
  const tree = render(
    <AndroidBottomSheet title="Actions" onClose={close}>
      Menu
    </AndroidBottomSheet>,
  );
  const modal = tree.find((node) => node.props.onRequestClose === close);
  act(() => modal.props.onRequestClose());
  expect(close).toHaveBeenCalledTimes(1);
  expect(
    tree.findAll((node) => node.props.role === 'dialog').length,
  ).toBeGreaterThan(0);
});

test.each([
  ['bills', 'Bills', BillsList],
  ['ask', 'Ask', AskScreen],
] as const)(
  'Android %s renders its root heading inside the real scrolling screen',
  async (name, title, Component) => {
    platform('android');
    const navigation = {
      getState: () => ({
        key: 'root-stack',
        routeNames: [name, 'bill/[key]'],
        routes: [{ key: 'root', name }],
      }),
      getParent: () => undefined,
      isFocused: () => true,
      addListener: () => () => {},
      setOptions: jest.fn(),
      setParams: jest.fn(),
    };
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={{ key: 'root', name }}>
            <Component />
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    const headings = view.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'android-root-title',
    );
    expect(headings).toHaveLength(1);
    expect(headings[0]!.props.accessibilityRole).toBe('header');
    expect(headings[0]!.children).toEqual([title]);
    let parent = headings[0]!.parent;
    while (parent && parent.type !== ScrollView) parent = parent.parent;
    expect(parent).not.toBeNull();
    expect(parent!.props.onScroll).toEqual(expect.any(Function));
  },
);

test.each(
  [false, true].flatMap((clamp) =>
    [false, true].map((callback) => ({ clamp, callback })),
  ),
)(
  'Android Screen retains its scroll target and range repair (clamp=$clamp, callback=$callback)',
  ({ clamp, callback }) => {
    platform('android');
    let tabPress!: (event: { target: string }) => void;
    const tabs = {
      getState: () => ({
        type: 'tab',
        index: 0,
        routes: [{ key: 'today-tab', state: { key: 'root-stack' } }],
      }),
      addListener: jest.fn((_type, callback) => {
        tabPress = callback;
        return jest.fn();
      }),
    };
    const setOptions = jest.fn();
    const navigation = {
      isFocused: () => true,
      addListener: jest.fn(() => jest.fn()),
      getState: () => ({
        key: 'root-stack',
        routeNames: ['index', 'bill/[key]'],
        routes: [{ key: 'today-root', name: 'index' }],
      }),
      getParent: () => tabs,
      setOptions,
    };
    const ref = createRef<ScrollView>();
    const forwarded = callback
      ? (node: ScrollView | null) => {
          ref.current = node;
        }
      : ref;
    const onScroll = jest.fn();
    const tree = render(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider
          value={{ key: 'today-root', name: 'index' }}
        >
          <Screen
            scrollRef={forwarded}
            onScroll={onScroll}
            clampScrollOnContentChange={clamp}
          >
            <View />
          </Screen>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
    const view = tree.findByType(ScrollView);
    expect(ref.current).toBe(view.instance);
    expect(
      tree.findAllByProps({ testID: 'android-root-title' }).length,
    ).toBeGreaterThan(0);
    const scrollTo = jest.fn();
    ref.current!.scrollTo = scrollTo;
    act(() => {
      view.props.onLayout({
        nativeEvent: { layout: { width: 402, height: 700 } },
      });
      view.props.onContentSizeChange?.(402, 3000);
      view.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 80 },
          contentInset: { top: 0, bottom: 0 },
          layoutMeasurement: { width: 402, height: 700 },
        },
      });
    });
    expect(onScroll).toHaveBeenLastCalledWith(80);
    expect(setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ headerTitle: 'Today' }),
    );
    const frame = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 0;
      });
    try {
      act(() => tabPress({ target: 'today-tab' }));
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
      if (clamp) {
        act(() => view.props.onContentSizeChange(402, 720));
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 20, animated: false });
      }
    } finally {
      frame.mockRestore();
    }
  },
);

test.each(['android', 'ios'] as const)(
  '%s root scroll preserves the platform bar and tab behaviour',
  (os) => {
    platform(os);
    const setOptions = jest.fn();
    let listener: ((event: { target: string }) => void) | undefined;
    const remove = jest.fn();
    const tabs = {
      getState: () => ({
        type: 'tab',
        index: 0,
        routes: [{ key: 'today-tab', state: { key: 'root-stack' } }],
      }),
      addListener: jest.fn((_type, callback) => {
        listener = callback;
        return remove;
      }),
    };
    const navigation = {
      getState: () => ({
        key: 'root-stack',
        routeNames: ['index', 'bill/[key]'],
        routes: [{ key: 'today-root', name: 'index' }],
      }),
      getParent: () => tabs,
      setOptions,
    };
    const scroll = { current: { scrollTo: jest.fn() } };
    let bridge!: ReturnType<typeof useAndroidRootScroll>;
    function Harness() {
      bridge = useAndroidRootScroll(scroll);
      return bridge.title;
    }
    render(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider
          value={{ key: 'today-root', name: 'index' }}
        >
          <Harness />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
    if (os === 'ios') {
      expect(bridge.title).toBeNull();
      expect(setOptions).not.toHaveBeenCalled();
      expect(tabs.addListener).not.toHaveBeenCalled();
      return;
    }
    expect(setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ headerTitle: '', headerShadowVisible: false }),
    );
    act(() => bridge.onScroll(1));
    expect(setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ headerTitle: '', headerShadowVisible: true }),
    );
    const count = setOptions.mock.calls.length;
    act(() => bridge.onScroll(10));
    expect(setOptions).toHaveBeenCalledTimes(count);
    act(() => bridge.onScroll(56));
    expect(setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headerTitle: 'Today',
        headerTitleAlign: 'left',
      }),
    );
    const frame = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 0;
      });
    try {
      act(() => listener!({ target: 'another-tab' }));
      expect(scroll.current.scrollTo).not.toHaveBeenCalled();
      act(() => listener!({ target: 'today-tab' }));
      expect(scroll.current.scrollTo).toHaveBeenCalledWith({
        y: 0,
        animated: true,
      });
    } finally {
      frame.mockRestore();
    }
  },
);

test('Android Ask root leaves no empty heading in the bar until its title collapses', () => {
  platform('android');
  const setOptions = jest.fn();
  const navigation = {
    getState: () => ({
      key: 'ask-stack',
      routeNames: ['ask', 'bill/[key]'],
      routes: [{ key: 'ask-root', name: 'ask' }],
    }),
    getParent: () => undefined,
    setOptions,
  };
  const scroll = { current: { scrollTo: jest.fn() } };
  let bridge!: ReturnType<typeof useAndroidRootScroll>;
  function Harness() {
    bridge = useAndroidRootScroll(scroll);
    return bridge.title;
  }
  render(
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={{ key: 'ask-root', name: 'ask' }}>
        <Harness />
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>,
  );
  // Ask's bar has a leading History item, so the stack would draw a string
  // title, even an empty one, as a heading view. A title that renders
  // nothing adds no node.
  const idle = setOptions.mock.lastCall![0].headerTitle;
  expect(typeof idle).toBe('function');
  expect(idle()).toBeNull();
  act(() => bridge.onScroll(56));
  expect(setOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({ headerTitle: 'Ask' }),
  );
});
