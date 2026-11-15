import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { PixelRatio, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  detentFullHeight,
  noteRootRoutes,
  resetSheetStatusForTests,
  sheetFullHeight,
  SheetStatusBar,
  statusBarOnField,
} from '../src/navigation/sheet-status-bar';
import { askScreens } from '../src/navigation/stack/ask';
import { exploreScreens } from '../src/navigation/stack/explore';
import { rootScreens } from '../src/navigation/stack/root';

const ios18 = { OS: 'ios', Version: '18.4' };
const ios26 = { OS: 'ios', Version: '26.3.1' };
const tabs = { name: '(tabs)' };

describe('the status bar over the navy field behind a page sheet', () => {
  test.each(['account', 'talk', 'seat', 'licences'])(
    'iOS 18 iPhone: %s shrinks the page, so the status bar sits on the field',
    (name) => {
      expect(statusBarOnField([tabs, { name }], ios18, false)).toBe(true);
    },
  );

  test('a route sheet above Account keeps the status bar on the field', () => {
    expect(
      statusBarOnField(
        [tabs, { name: 'account' }, { name: 'source' }],
        ios18,
        false,
      ),
    ).toBe(true);
  });

  test('half-height route sheets and the full-screen welcome leave the page style', () => {
    for (const name of ['term', 'source', 'citation', 'rule', 'welcome'])
      expect(statusBarOnField([tabs, { name }], ios18, false)).toBe(false);
    expect(statusBarOnField([tabs], ios18, false)).toBe(false);
  });

  test('iOS 26 dims the page in place, an iPad centres the sheet, Android has none', () => {
    const routes = [tabs, { name: 'account' }];
    expect(statusBarOnField(routes, ios26, false)).toBe(false);
    expect(statusBarOnField(routes, ios18, true)).toBe(false);
    expect(
      statusBarOnField(routes, { OS: 'android', Version: 36 }, false),
    ).toBe(false);
  });
});

describe('the root stack drives the light status bar', () => {
  const os = Platform.OS;
  const version = Platform.Version;
  function setPlatform(value: { OS: string; Version: string | number }) {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => value.OS,
    });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      get: () => value.Version,
    });
  }
  afterEach(() => {
    act(() => noteRootRoutes([tabs]));
    act(() => resetSheetStatusForTests());
    setPlatform({ OS: os, Version: version });
  });

  /** The root stack's own listener, as React Navigation calls it. */
  function report(routes: { name: string }[]) {
    const element = rootScreens().find((node) => node.key === 'account')!;
    const { state } = element.props.listeners({
      navigation: { getState: () => ({ routes, index: routes.length - 1 }) },
    });
    act(() => state());
  }

  test('light while Account is open on iOS 18, the page style again once it closes', () => {
    setPlatform(ios18);
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SheetStatusBar />);
    });
    expect(renderer.root.findAllByType(StatusBar)).toHaveLength(0);
    report([tabs, { name: 'account' }]);
    expect(renderer.root.findByType(StatusBar).props.style).toBe('light');
    report([tabs]);
    expect(renderer.root.findAllByType(StatusBar)).toHaveLength(0);
    act(() => renderer.unmount());
  });

  test('iOS 26 never changes the status bar', () => {
    setPlatform(ios26);
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SheetStatusBar />);
    });
    report([tabs, { name: 'account' }]);
    expect(renderer.root.findAllByType(StatusBar)).toHaveLength(0);
    act(() => renderer.unmount());
  });
});

describe('every sheet at full height puts the status bar on the field, in step with the sheet', () => {
  const os = Platform.OS;
  const version = Platform.Version;
  function setPlatform(value: { OS: string; Version: string | number }) {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => value.OS,
    });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      get: () => value.Version,
    });
  }
  let scale: jest.SpyInstance;
  let renderer: TestRenderer.ReactTestRenderer;
  const light = () => renderer.root.findAllByType(StatusBar).length === 1;
  beforeEach(() => {
    setPlatform(ios18);
    scale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    act(() => {
      renderer = TestRenderer.create(<SheetStatusBar />);
    });
  });
  afterEach(() => {
    act(() => resetSheetStatusForTests());
    act(() => renderer.unmount());
    scale.mockRestore();
    setPlatform({ OS: os, Version: version });
  });

  type Route = { name: string; key: string; params?: object };
  /** A root screen's own listeners, as React Navigation calls them. */
  function root(routes: Route[], own: Route = routes.at(-1)!) {
    const element = rootScreens().find((node) => node.key === own.name)!;
    return element.props.listeners({
      route: own,
      navigation: {
        getState: () => ({ key: 'root', routes, index: routes.length - 1 }),
      },
    });
  }
  /** A tab stack's sheet screen, and its listeners for one route. */
  function tabSheet(
    screens: { key: string | null; props: Record<string, unknown> }[],
    name: string,
  ) {
    const element = screens.find((node) => node.key === name)!;
    const listeners = element.props.listeners as
      | ((args: unknown) => Record<string, (event?: unknown) => void>)
      | undefined;
    return listeners?.({
      route: { key: `${name}-1`, name },
      navigation: { getState: () => ({ key: 'tab-stack' }) },
    });
  }
  const home: Route = { name: '(tabs)', key: 'tabs' };

  test('a route sheet at an accessibility text size opens at full height', () => {
    const source: Route = { name: 'source', key: 'source-1' };
    // Default size: Sources opens at half height, the page whole behind it.
    act(() => root([home, source]).state());
    expect(light()).toBe(false);
    act(() => root([home], home).state());
    // AX3: its opening detent is the whole height.
    scale.mockReturnValue(2.643);
    act(() => root([home, source]).state());
    expect(light()).toBe(true);
    act(() => root([home], home).state());
    expect(light()).toBe(false);
    // A short sheet (a glossary term) has one detent there, the whole height.
    const term: Route = { name: 'term', key: 'term-1' };
    act(() => root([home, term]).state());
    expect(light()).toBe(true);
  });

  test('a sheet dragged to large is at full height; dragged back, it is not', () => {
    const source: Route = { name: 'source', key: 'source-1' };
    const sheet = root([home, source]);
    act(() => sheet.state());
    expect(light()).toBe(false);
    act(() => sheet.sheetDetentChange({ data: { index: 1, stable: true } }));
    expect(light()).toBe(true);
    // The stack reporting its routes again does not undo the drag.
    act(() => sheet.state());
    expect(light()).toBe(true);
    act(() => sheet.sheetDetentChange({ data: { index: 0, stable: true } }));
    expect(light()).toBe(false);
  });

  test('Ask’s Conversations, a page sheet in a tab’s stack, counts; and the style follows the start of its transitions', () => {
    const sheet = tabSheet(askScreens('(ask)'), 'conversations')!;
    expect(sheet).toBeDefined();
    // Light as the presentation starts, not after it.
    act(() => sheet.transitionStart!({ data: { closing: false } }));
    expect(light()).toBe(true);
    // Dismissal starts: the page's style is back at once, not 0.3 s later.
    act(() => sheet.transitionStart!({ data: { closing: true } }));
    expect(light()).toBe(false);
    // The swipe is cancelled: the sheet is still there.
    act(() => sheet.gestureCancel!());
    expect(light()).toBe(true);
    act(() => sheet.transitionStart!({ data: { closing: true } }));
    act(() => sheet.transitionEnd!({ data: { closing: true } }));
    expect(light()).toBe(false);
    // Ask's fitted consent sheet and its half-height report do not count.
    for (const name of ['consent', 'ask-report']) {
      const other = tabSheet(askScreens('(ask)'), name)!;
      act(() => other.transitionStart!({ data: { closing: false } }));
      expect(light()).toBe(false);
    }
  });

  test('the tide table, a sheet with one detent, the whole height, counts', () => {
    const tide = tabSheet(exploreScreens(), 'explore/tide-table')!;
    expect(tide).toBeDefined();
    act(() => tide.focus!());
    expect(light()).toBe(true);
    act(() => tide.beforeRemove!());
    expect(light()).toBe(false);
    // The years sheet beside it opens at half height.
    const years = tabSheet(exploreScreens(), 'explore/years')!;
    act(() => years.focus!());
    expect(light()).toBe(false);
    act(() => years.sheetDetentChange!({ data: { index: 1 } }));
    expect(light()).toBe(true);
  });

  test('a pushed page has no sheet listeners, and iOS 26 never changes the status bar', () => {
    expect(tabSheet(askScreens('(ask)'), 'ask')).toBeUndefined();
    setPlatform(ios26);
    const tide = tabSheet(exploreScreens(), 'explore/tide-table')!;
    act(() => tide.focus!());
    expect(light()).toBe(false);
  });

  test('the height rule: page sheets, an opening detent of 1, never a fitted sheet', () => {
    expect(sheetFullHeight({ presentation: 'modal' })).toBe(true);
    expect(sheetFullHeight({ sheetAllowedDetents: [1] })).toBe(true);
    expect(
      sheetFullHeight({
        sheetAllowedDetents: [0.5, 1],
        sheetInitialDetentIndex: 1,
      }),
    ).toBe(true);
    expect(sheetFullHeight({ sheetAllowedDetents: [0.5, 1] })).toBe(false);
    expect(sheetFullHeight({ sheetAllowedDetents: 'fitToContents' })).toBe(
      false,
    );
    expect(sheetFullHeight({ presentation: 'fullScreenModal' })).toBe(false);
    expect(sheetFullHeight({})).toBe(false);
    expect(detentFullHeight({ sheetAllowedDetents: [0.5, 1] }, 1)).toBe(true);
    expect(detentFullHeight({ sheetAllowedDetents: [0.5, 1] }, 0)).toBe(false);
  });
});
