import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  noteRootRoutes,
  SheetStatusBar,
  statusBarOnField,
} from '../src/navigation/sheet-status-bar';
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
