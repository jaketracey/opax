import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, join, relative } from 'path';
import type { ReactElement, ReactNode } from 'react';
import { act } from 'react';
import { Modal, Platform, StyleSheet, Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';

// Pass 4F: Android follows the redesigned iPhone screens on its own chrome.

let mockHighText = false;
let mockFontScale = 1;
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
jest.mock('expo-router', () => {
  function Tabs({
    screenOptions,
    children,
  }: {
    screenOptions: Record<string, unknown>;
    children: ReactNode;
  }) {
    mockTabOptions = screenOptions;
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
  return { Tabs, router: { push: jest.fn(), back: jest.fn() } };
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
  // (NativeTabs, bar items, Talk), the iPad tour, and the iOS community.
  const iosOnly = [
    /^src\/features\/talk\//,
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
    // The scan sees the tabs, the ⋯ buttons and the empty state.
    for (const name of ['newspaper', 'ellipsis', 'tray', 'doc.text'])
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
      borderRadius: radii.pill,
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
    expect(flat(mockTabOptions.tabBarStyle).height).toBe(72 + 16);
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
    // A hook with no state: call it as a function.
    return asPlatform(os, () => chrome.useStackChrome());
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
    expect(atDefault.headerTitleStyle.fontSize).toBe(17);
    expect(atDouble.headerTitleStyle.fontSize).toBe(23);
    expect('headerShadowVisible' in atDefault).toBe(false);
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
    expect(back.props.accessibilityLabel).toBe('Back');
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

  test('a sheet’s root closes with Done, as on iPhone', () => {
    const { renderer, goBack } = header(false, 'Account and about');
    const done = pressable(renderer, 'header-done');
    expect(done.props.accessibilityLabel).toBe('Done');
    expect(
      renderer.root.findAll((n) => n.props.testID === 'header-back'),
    ).toHaveLength(0);
    act(() => done.props.onPress());
    expect(goBack).toHaveBeenCalled();
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

  test('a menu rises as a bottom sheet titled small, rows with Material’s ripple, and Cancel', () => {
    const ask = jest.fn();
    const { menu, renderer } = host();
    asPlatform('android', () =>
      act(() =>
        menu.showMenu('Offshore Petroleum Amendment Bill 2023', [
          { title: 'Ask about this', onPress: ask },
          { title: 'Open on opax.com.au', onPress: jest.fn() },
        ]),
      ),
    );
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.presentationStyle).toBeUndefined();
    const sheet = renderer.root.find(
      (n) => n.props.testID === 'android-menu' && typeof n.type === 'string',
    );
    expect(flat(sheet.props.style)).toMatchObject({
      borderTopLeftRadius: 12,
      // The gesture inset plus the tight rhythm.
      paddingBottom: 16 + 8,
    });
    const title = sheet
      .findAllByType(NativeText)
      .find((n) => n.props.accessibilityRole === 'header')!;
    expect(title.props.children).toBe('Offshore Petroleum Amendment Bill 2023');
    // Small, as the iPhone action sheet's title; not a serif heading.
    expect(flat(title.props.style).fontSize).toBe(15);
    const buttons = (within: TestRenderer.ReactTestInstance) =>
      within.findAll(
        (n) =>
          typeof n.type !== 'string' &&
          n.props.accessibilityRole === 'button' &&
          typeof n.props.onPress === 'function',
      );
    const rows = buttons(sheet);
    expect(rows.map((n) => n.props.accessibilityLabel)).toEqual([
      'Ask about this',
      'Open on opax.com.au',
      'Cancel',
    ]);
    const first = rows[0]!;
    expect(first.props.android_ripple).toBeDefined();
    // TalkBack hears one Cancel: the scrim stays out of the way.
    const scrim = buttons(renderer.root).find((n) => !rows.includes(n))!;
    expect(scrim.props.importantForAccessibility).toBe('no');
    expect(scrim.props.accessible).toBe(false);
    act(() => first.props.onPress());
    expect(ask).toHaveBeenCalled();
    expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
  });

  test('Back and Cancel close the menu without acting', () => {
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
    act(() => pressable(renderer, 'android-menu-close').props.onPress());
    expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('Android choice sheets', () => {
  const sheet = (count: number) => {
    const { ChoiceSheet } = jest.requireActual<
      typeof import('../src/features/search/ChoiceSheet')
    >('../src/features/search/ChoiceSheet');
    const choices = Array.from({ length: count }, (_, i) => ({
      value: `kind-${i}`,
      label: `Kind ${i}`,
    }));
    const onChange = jest.fn();
    const onClose = jest.fn();
    const renderer = asPlatform('android', () =>
      render(
        <ChoiceSheet
          title="Kind"
          choices={choices}
          value="kind-1"
          onChange={onChange}
          onClose={onClose}
          testID="search-kind"
        />,
      ),
    );
    return { renderer, onChange, onClose };
  };

  test('a short list (the kind, the sort) is a bottom sheet with the same rows', () => {
    const { renderer, onChange, onClose } = sheet(10);
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.presentationStyle).toBeUndefined();
    expect(
      renderer.root.findAll((n) => n.props.testID === 'search-kind-sheet'),
    ).not.toHaveLength(0);
    const current = pressable(renderer, 'search-kind-option-kind-1');
    expect(current.props.accessibilityState).toMatchObject({ selected: true });
    act(() => pressable(renderer, 'search-kind-option-kind-3').props.onPress());
    expect(onChange).toHaveBeenCalledWith('kind-3');
    expect(onClose).toHaveBeenCalled();
    // The scrim is the iPhone sheet's Done for TalkBack.
    expect(
      renderer.root.findAll(
        (n) =>
          n.props.accessibilityLabel === 'Done' &&
          typeof n.props.onPress === 'function',
      ),
    ).not.toHaveLength(0);
  });

  test('a list long enough for its find field keeps the full-screen dialog', () => {
    const { renderer } = sheet(13);
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.transparent).toBeFalsy();
    expect(modal.props.presentationStyle).toBe('pageSheet');
    expect(
      renderer.root.findAll(
        (n) =>
          n.props.testID === 'search-kind-sheet-done' &&
          typeof n.props.onPress === 'function',
      ),
    ).toHaveLength(1);
  });
});

describe('Android source sheets', () => {
  const body = (os: 'android' | 'ios') => {
    const { SheetBody } = jest.requireActual<
      typeof import('../src/design/source')
    >('../src/design/source');
    return asPlatform(os, () =>
      render(
        <SheetBody title="Sources" onClose={jest.fn()} testID="sheet">
          {null}
        </SheetBody>,
      ),
    );
  };
  // The grab handle: a 36 x 5 pill.
  const grabs = (renderer: TestRenderer.ReactTestRenderer) =>
    renderer.root.findAll((n) => {
      const style = flat(n.props.style) ?? {};
      return (
        typeof n.type === 'string' && style.width === 36 && style.height === 5
      );
    });

  test('a full-screen Android sheet draws no grab handle; iPhone keeps it', () => {
    expect(grabs(body('android'))).toHaveLength(0);
    expect(grabs(body('ios'))).toHaveLength(1);
    const done = pressable(body('android'), 'sheet-done');
    expect(done.props.accessibilityLabel).toBe('Done');
  });
});

describe('Android journeys', () => {
  const runner = readFileSync(
    join(MOBILE, 'scripts/e2e-android-device.sh'),
    'utf8',
  );
  const cases = [...runner.matchAll(/^\s+(\d\d)\) file=(\S+) ;;/gm)].map(
    ([, key, file]) => [key!, file!] as const,
  );

  test('the runner offers the journeys the design passes touched, and each exists', () => {
    expect(cases.map(([key]) => key)).toEqual(
      expect.arrayContaining(['03', '13', '26', '38', '39', '40']),
    );
    for (const [, file] of cases)
      expect(statSync(join(MOBILE, file)).isFile()).toBe(true);
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
