import { execFileSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { extname, join, relative } from 'path';
import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { Modal, Text as NativeText, Platform, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';

// Pass 4F: Android follows the redesigned iPhone screens on its own chrome.

let mockHighText = false;
let mockFontScale = 1;
jest.mock('../modules/opax-root-bar', () => ({
  ...jest.requireActual('../modules/opax-root-bar'),
  useVerticalBarEdge: () => 'unspecified',
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useHighTextContrast: () => mockHighText,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 412,
    height: 915,
    scale: 2.625,
    fontScale: mockFontScale,
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  };
});
const mockScreens: { name: string; options: Record<string, unknown> }[] = [];
let mockTabOptions: Record<string, unknown> = {};
let mockTabNavigation: Record<string, unknown> = {};
jest.mock('expo-router', () => {
  function Tabs({
    screenOptions,
    children,
    ...navigation
  }: {
    screenOptions: Record<string, unknown>;
    children: ReactNode;
    initialRouteName?: string;
    backBehavior?: string;
  }) {
    mockTabOptions = screenOptions;
    mockTabNavigation = navigation;
    return children;
  }
  Tabs.Screen = function Screen({
    name,
    options,
  }: {
    name: string;
    options: Record<string, unknown>;
  }) {
    mockScreens.push({ name, options });
    return null;
  };
  return {
    Tabs,
    useSegments: () => ['(tabs)', '(today)', 'index'],
    router: { push: jest.fn(), back: jest.fn() },
  };
});

const MOBILE = join(__dirname, '..');
const asPlatform = <T,>(os: 'android' | 'ios', run: () => T): T => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(Platform, 'OS', {
      value: original,
      configurable: true,
    });
  }
};
const render = (element: ReactElement) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
};
const flat = (style: unknown) =>
  StyleSheet.flatten(style as never) as Record<string, unknown>;
const pressable = (renderer: TestRenderer.ReactTestRenderer, id: string) =>
  renderer.root.find(
    (n) => n.props.testID === id && typeof n.props.onPress === 'function',
  );

describe('Material symbols', () => {
  // Files whose symbols never draw on Android: iOS-only routes and chrome
  // (NativeTabs, bar items), the iPad tour, and the iOS community. Talk
  // draws on Android with its OpaxVoice module.
  const iosOnly = [
    /^src\/onboarding\/pad/,
    /^src\/app\/\(tabs\)\/_layout\.tsx$/,
    /^src\/app\/community\//,
    /^src\/navigation\/chrome\.ts$/,
    /^src\/features\/community\/CommunityScreen\.tsx$/,
    /^src\/workbench\//,
    /^src\/test-screens\//,
  ];
  const symbolNames = () => {
    const found = new Map<string, string>();
    // An attribute or default (`icon = 'tray'`, `symbol="ellipsis"`, a
    // ternary in braces), an object key, an <Icon name>, and the tab table.
    const holders = [
      /<Icon\b[^>]*?\bname=(\{[^}]*\}|["'][^"']*["'])/gs,
      /\b(?:symbol|icon|glyph)\s*=\s*(\{[^}]*\}|["'][^"']*["'])/g,
      /\b(?:symbol|icon|glyph):\s*(["'][^"']*["'])/g,
      /\[\s*'\([a-z-]+\)',\s*'[a-z-]+',\s*'[^']+',\s*('[^']*')\s*\]/g,
    ];
    // Not the operand of a comparison (`kind === 'electorate' ? …`).
    const quoted = /(?<![=!]==\s*)["']([a-z][a-z0-9]*(?:\.[a-z0-9]+)*)["']/g;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (['.ts', '.tsx'].includes(extname(name))) {
          const file = relative(MOBILE, path);
          if (iosOnly.some((rule) => rule.test(file))) continue;
          const text = readFileSync(path, 'utf8');
          for (const holder of holders)
            for (const match of text.matchAll(holder))
              for (const name of match[1]!.matchAll(quoted))
                if (!found.has(name[1]!)) found.set(name[1]!, file);
        }
      }
    };
    walk(join(MOBILE, 'src'));
    return found;
  };

  test('every symbol drawn on Android has its own Material glyph', () => {
    const { androidSymbol } = jest.requireActual<
      typeof import('../src/design/android-symbols')
    >('../src/design/android-symbols');
    const names = symbolNames();
    // The scan sees the tabs, the ⋯ buttons and record symbols.
    for (const name of ['newspaper', 'ellipsis.circle', 'doc.text'])
      expect(names.has(name)).toBe(true);
    const unmapped = [...names]
      .filter(([name]) => androidSymbol(name) === 'article')
      .map(([name, file]) => `${name} (${file})`);
    expect(unmapped).toEqual([]);
  });

  test('⋯ is Material’s overflow mark and back is its arrow', () => {
    const { androidSymbol } = jest.requireActual<
      typeof import('../src/design/android-symbols')
    >('../src/design/android-symbols');
    expect(androidSymbol('ellipsis')).toBe('more_vert');
    expect(androidSymbol('arrow.left')).toBe('arrow_back');
    expect(androidSymbol('newspaper')).toBe('newspaper');
  });
});

describe('Android tabs', () => {
  const draw = () => {
    mockScreens.length = 0;
    const { AndroidTabs } = jest.requireActual<
      typeof import('../src/navigation/AndroidTabs')
    >('../src/navigation/AndroidTabs');
    render(<AndroidTabs />);
    return mockScreens;
  };
  afterEach(() => {
    mockHighText = false;
  });

  test('five sentence-case tabs keep their test IDs and labels', () => {
    const screens = draw();
    expect(
      screens.map((s) => [s.options.title, s.options.tabBarButtonTestID]),
    ).toEqual([
      ['Today', 'tab-today'],
      ['Your MP', 'tab-your-mp'],
      ['Bills', 'tab-bills'],
      ['Search', 'tab-search'],
      ['Ask', 'tab-ask'],
    ]);
    expect(screens.map((s) => s.options.tabBarAccessibilityLabel)).toEqual([
      'Today',
      'Your MP',
      'Bills',
      'Search',
      'Ask',
    ]);
    expect(mockTabNavigation).toMatchObject({
      initialRouteName: '(today)',
      backBehavior: 'initialRoute',
    });
  });

  test('the chosen tab sits in a navy-wash pill; the others draw none', () => {
    const { colors, radii } = jest.requireActual<
      typeof import('../src/design/tokens')
    >('../src/design/tokens');
    const icon = draw()[0]!.options.tabBarIcon as (p: {
      focused: boolean;
    }) => ReactElement;
    const style = (focused: boolean) =>
      flat(
        (render(icon({ focused })).toJSON() as { props: { style: unknown } })
          .props.style,
      );
    expect(style(true)).toMatchObject({
      backgroundColor: colors.navyWash,
      borderRadius: radii.capsule,
      height: 32,
    });
    expect(style(false).backgroundColor).toBeUndefined();
    expect(flat(mockTabOptions.tabBarIconStyle)).toMatchObject({
      width: 56,
      height: 32,
    });
  });

  test('labels are 12sp, capped at 1.4x; the bar clears the gesture inset', () => {
    const label = draw()[1]!.options.tabBarLabel as (p: {
      color: string;
    }) => ReactElement;
    const text = render(label({ color: '#000000' })).root.findByType(
      NativeText,
    );
    expect(text.props.maxFontSizeMultiplier).toBe(1.4);
    expect(text.props.numberOfLines).toBe(1);
    expect(flat(text.props.style)).toMatchObject({ fontSize: 12 });
    expect(flat(mockTabOptions.tabBarStyle).height).toBe(80 + 16);
  });

  test('High contrast text takes the stronger ink for the other tabs', () => {
    const { light } = jest.requireActual<typeof import('../src/design/tokens')>(
      '../src/design/tokens',
    );
    const { lightHighContrast } = jest.requireActual<
      typeof import('../src/design/palette')
    >('../src/design/palette');
    draw();
    expect(mockTabOptions.tabBarInactiveTintColor).toBe(light.inkSoft);
    mockHighText = true;
    draw();
    expect(mockTabOptions.tabBarInactiveTintColor).toBe(
      lightHighContrast.inkSoft,
    );
    expect(mockTabOptions.tabBarActiveTintColor).toBe(light.navy);
  });
});

describe('Android bars', () => {
  const chrome = jest.requireActual<typeof import('../src/navigation/chrome')>(
    '../src/navigation/chrome',
  );
  const chromeFor = (os: 'android' | 'ios', fontScale: number) => {
    mockFontScale = fontScale;
    return asPlatform(os, () => {
      let options!: ReturnType<typeof chrome.useStackChrome>;
      function Probe() {
        options = chrome.useStackChrome();
        return null;
      }
      const renderer = render(<Probe />);
      act(() => renderer.unmount());
      return options;
    });
  };
  afterEach(() => {
    mockFontScale = 1;
  });

  test('the Android bar is flat paper with the title at the heading size, scaled once by the system', () => {
    const atDefault = chromeFor('android', 1);
    const atDouble = chromeFor('android', 2);
    expect(atDefault).toMatchObject({ headerShadowVisible: false });
    expect(atDefault.headerTitleStyle.fontSize).toBe(22);
    // The native bar sets sp: Dynamic Type sizes on top would scale twice.
    expect(atDouble.headerTitleStyle.fontSize).toBe(22);
  });

  test('iOS keeps its Dynamic Type title sizes and system bar', () => {
    const atDefault = chromeFor('ios', 1);
    const atDouble = chromeFor('ios', 2);
    expect(atDefault.headerTitleStyle.fontSize).toBeUndefined();
    expect(atDouble.headerTitleStyle.fontSize).toBeUndefined();
    expect(atDefault.headerShadowVisible).toBe(true);
    expect(atDefault).not.toHaveProperty('statusBarStyle');
  });

  test('Android bar actions are words on the type scale, at least 48dp', () => {
    const onPress = jest.fn();
    const items = asPlatform('android', () =>
      chrome.headerItems(() => [
        {
          type: 'button',
          label: 'Account',
          accessibilityLabel: 'Account and about',
          onPress,
        },
      ]),
    );
    const bar = render(
      (items as { headerRight: () => ReactElement }).headerRight(),
    );
    const button = pressable(bar, 'header-account');
    expect(button.props.accessibilityLabel).toBe('Account and about');
    expect(flat(button.props.style)).toMatchObject({
      minWidth: 48,
      minHeight: 48,
    });
    const text = bar.root.findByType(NativeText);
    expect(text.props.children).toBe('Account');
    expect(flat(text.props.style).fontSize).toBe(15);
  });
});

describe('Android reading header', () => {
  const header = (back: boolean, title = 'Sources and licences') => {
    const goBack = jest.fn();
    const { AndroidReadingHeader } = jest.requireActual<
      typeof import('../src/navigation/AndroidReadingHeader')
    >('../src/navigation/AndroidReadingHeader');
    const props = {
      navigation: { goBack },
      options: { title },
      back: back ? { title: 'Account and about', href: undefined } : undefined,
      route: { key: 'r', name: 'sources' },
    } as unknown as Parameters<typeof AndroidReadingHeader>[0];
    return { renderer: render(<AndroidReadingHeader {...props} />), goBack };
  };

  test('a pushed reading screen backs out with Material’s arrow, labelled Back', () => {
    const { renderer, goBack } = header(true);
    const back = pressable(renderer, 'header-back');
    expect(back.props.accessibilityLabel).toBe('Navigate up');
    expect(back.props.android_ripple).toBeDefined();
    const symbol = back.findAll(
      (n) => n.props.name && typeof n.props.name === 'string',
    )[0]!;
    expect(symbol.props.name).toBe('arrow.left');
    act(() => back.props.onPress());
    expect(goBack).toHaveBeenCalled();
    const title = renderer.root
      .findAllByType(NativeText)
      .find((n) => n.props.accessibilityRole === 'header')!;
    expect(title.props.children).toBe('Sources and licences');
    expect(flat(title.props.style)).toMatchObject({ fontSize: 22 });
  });

  test('an Android dialog root has an X close action', () => {
    const { renderer, goBack } = header(false, 'Account and about');
    const done = pressable(renderer, 'header-done');
    expect(done.props.accessibilityLabel).toBe('Close');
    expect(
      renderer.root.findAll((n) => n.props.testID === 'header-back'),
    ).toHaveLength(0);
    act(() => done.props.onPress());
    expect(goBack).toHaveBeenCalled();
  });

  test('at 200% text the reading title has its own row clear of all actions', () => {
    mockFontScale = 2;
    try {
      const { renderer } = header(true, 'Time machine photographs');
      const title = renderer.root
        .findAllByType(NativeText)
        .find((node) => node.props.accessibilityRole === 'header')!;
      expect(flat(title.props.style)).toMatchObject({
        flex: 0,
        fontSize: 22,
      });
      // The sectionTitle role's 28, with the design Text's rounding nudge.
      expect(flat(title.props.style).lineHeight).toBeCloseTo(28, 2);
      expect(title.props.numberOfLines).toBeUndefined();
      expect(pressable(renderer, 'header-back').props.accessibilityLabel).toBe(
        'Navigate up',
      );
    } finally {
      mockFontScale = 1;
    }
  });
});

describe('Android ⋯ menus', () => {
  const host = () => {
    const menu =
      jest.requireActual<typeof import('../src/design/menu')>(
        '../src/design/menu',
      );
    return {
      menu,
      renderer: asPlatform('android', () => render(<menu.AndroidMenuHost />)),
    };
  };

  test('a Material popup is anchored, scrollable and exposes labelled menu items', () => {
    const ask = jest.fn();
    const { menu, renderer } = host();
    asPlatform('android', () =>
      act(() =>
        menu.showMenu(
          'Bill actions',
          [
            { title: 'Ask about this', onPress: ask },
            { title: 'Open on opax.com.au', onPress: jest.fn() },
          ],
          { x: 40, y: 200, width: 48, height: 48 },
        ),
      ),
    );
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.animationType).toBe('none');
    const popup = renderer.root.find(
      (n) => n.props.testID === 'android-menu' && typeof n.type === 'string',
    );
    expect(popup.props.accessibilityRole).toBe('menu');
    expect(flat(popup.props.style)).toMatchObject({
      borderRadius: 12,
      left: 40,
      top: 248,
    });
    const rows = popup.findAll(
      (n) =>
        typeof n.type !== 'string' &&
        Array.isArray(n.props.style) &&
        typeof n.props.onPressIn === 'function' &&
        n.props.accessibilityRole === 'menuitem',
    );
    expect(rows.map((n) => n.props.accessibilityLabel)).toEqual([
      'Ask about this',
      'Open on opax.com.au',
    ]);
    expect(rows[0]!.props.android_ripple).toBeDefined();
    act(() => rows[0]!.props.onPress());
    expect(ask).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
  });

  test('Back and outside tap close the menu without acting', () => {
    const ask = jest.fn();
    const { menu, renderer } = host();
    const open = () =>
      asPlatform('android', () =>
        act(() =>
          menu.showMenu('This answer', [
            { title: 'Share answer', onPress: ask },
          ]),
        ),
      );
    open();
    act(() => renderer.root.findByType(Modal).props.onRequestClose());
    expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
    open();
    act(() => pressable(renderer, 'android-menu-outside').props.onPress());
    expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('Android journeys', () => {
  const prepared = mkdtempSync(join(tmpdir(), 'opax-android-journeys-'));
  beforeAll(() => {
    execFileSync('python3', [
      join(MOBILE, 'scripts/prepare-android-flows.py'),
      prepared,
    ]);
  });
  afterAll(() => rmSync(prepared, { recursive: true, force: true }));

  test('the runner offers the parity journeys, and each prepared entry exists', () => {
    const plan = JSON.parse(
      readFileSync(join(prepared, 'suite.json'), 'utf8'),
    ) as {
      shared: string;
      path: string;
      run: boolean;
    }[];
    const offered = plan.filter((flow) => flow.run);
    expect(offered.map((flow) => flow.shared)).toEqual(
      expect.arrayContaining([
        '03-mp-profile.yaml',
        '13-today.yaml',
        '26-follows.yaml',
        '39-topics.yaml',
        '66-my-mp-journey.yaml',
      ]),
    );
    for (const key of ['38', '40'])
      expect(offered.some((flow) => flow.shared.startsWith(`${key}-`))).toBe(
        false,
      );
    for (const flow of offered)
      expect(statSync(join(prepared, flow.path)).isFile()).toBe(true);
    expect(
      statSync(
        join(MOBILE, '.maestro/android/screenshots-high-contrast.yaml'),
      ).isFile(),
    ).toBe(true);
  });

  test('Android flows use Back and IDs, not iPhone bar titles or copy', () => {
    const dir = join(MOBILE, '.maestro/android');
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
      const steps = readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'));
      const body = steps.join('\n');
      // iOS back-button titles and tab-label taps.
      expect([name, /^- tapOn: Today$/m.test(body)]).toEqual([name, false]);
      expect([name, /\bindex: 0\b/.test(body)]).toEqual([name, false]);
      // phoneCopy says "phone" on Android.
      expect([name, /this iPhone/.test(body)]).toEqual([name, false]);
    }
  });
});

describe('Android system surfaces', () => {
  test('alerts and text handles take navy, and alert buttons keep sentence case', () => {
    const plugin = jest.requireActual('../plugins/withAndroidTheme.js') as {
      withTheme: (xml: unknown) => {
        resources: {
          style: {
            $: { name: string; parent?: string };
            item: { $: { name: string }; _: string }[];
          }[];
        };
      };
      navy: string;
    };
    const { light } = jest.requireActual<typeof import('../src/design/tokens')>(
      '../src/design/tokens',
    );
    expect(plugin.navy).toBe(light.navy);
    const xml = plugin.withTheme({
      resources: {
        style: [
          {
            $: {
              name: 'AppTheme',
              parent: 'Theme.AppCompat.DayNight.NoActionBar',
            },
            item: [],
          },
        ],
      },
    });
    const style = (name: string) =>
      Object.fromEntries(
        xml.resources.style
          .find((s) => s.$.name === name)!
          .item.map((i) => [i.$.name, i._]),
      );
    expect(style('AppTheme')).toMatchObject({
      colorAccent: '@color/opaxNavy',
      alertDialogTheme: '@style/OpaxAlertDialog',
    });
    expect(style('OpaxAlertDialog')).toMatchObject({
      colorAccent: '@color/opaxNavy',
      buttonBarButtonStyle: '@style/OpaxAlertButton',
    });
    expect(style('OpaxAlertButton')).toMatchObject({
      'android:textAllCaps': 'false',
      textAllCaps: 'false',
    });
  });

  test('only Android builds take the theme plugin', () => {
    const config = readFileSync(join(MOBILE, 'app.config.ts'), 'utf8');
    const android = config.slice(
      config.indexOf('...(androidBuild\n      ? ['),
      config.indexOf("'@react-native-community/datetimepicker'"),
    );
    expect(android).toContain("'./plugins/withAndroidTheme.js'");
    expect(config.match(/withAndroidTheme/g)).toHaveLength(1);
  });
});

test('Victorian election screens use shared routes and native cross-platform controls', () => {
  const hub = readFileSync(
    join(MOBILE, 'src/features/vic-election/Hub.tsx'),
    'utf8',
  );
  const seat = readFileSync(
    join(MOBILE, 'src/features/vic-election/Seat.tsx'),
    'utf8',
  );
  expect(hub).toContain('useListSearchBar');
  expect(hub).toContain('ElectionList');
  expect(seat).toContain('vic-seat-screen');
  expect(seat).toContain('Candidates');
  for (const source of [hub, seat])
    expect(source).not.toMatch(/ActionSheetIOS|@expo\/ui\/swift-ui/);
});
