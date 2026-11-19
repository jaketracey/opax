/* eslint-disable @typescript-eslint/no-require-imports -- Route host double. */
import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  Appearance,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
} from 'react-native';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { Tile } from '../src/design/card';
import { designFlags } from '../src/design/flags';
import { StatusCapsule } from '../src/design/labels';
import { InsetGroup, Screen } from '../src/design/layout';
import { dark, light } from '../src/design/palette';
import { SurfaceContext } from '../src/design/row-padding';
import { useListSearchBar } from '../src/design/search-bar';
import { Text } from '../src/design/text';
import { hairline } from '../src/design/tokens';
import { useIsDark } from '../src/design/use-colors';
import {
  useMapTheme,
  type MapTheme,
} from '../src/features/money/ported/palette';
import { androidHeaderBar } from '../src/navigation/chrome';

// Build 92 follow-ups to dark mode (19 Nov 2026): edges for tiles, grouped
// lists and the neutral status capsule on dark; colours that follow a live
// switch on Android; and the scheme held while the app is in the background.
// Each test fails if its change is reverted.
jest.mock('expo-router', () => {
  const React = require('react');
  const part = ({ children, ...props }: { children?: unknown }) =>
    React.createElement('RouteHost', props, children);
  return {
    ...jest.requireActual('expo-router'),
    Link: Object.assign(part, {
      Trigger: part,
      Preview: part,
      Menu: part,
      MenuAction: part,
    }),
    Stack: { Screen: () => null },
    useIsPreview: () => false,
    useSegments: () => [],
    router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const originalOS = Platform.OS;
const originalState = AppState.currentState;
let scheme: 'light' | 'dark' = 'light';
// Every listener the hooks register, so a test can speak for the system.
let schemeListeners: (() => void)[] = [];
let stateListeners: ((state: string) => void)[] = [];
beforeEach(() => {
  scheme = 'light';
  schemeListeners = [];
  stateListeners = [];
  AppState.currentState = 'active';
  jest.spyOn(Appearance, 'getColorScheme').mockImplementation(() => scheme);
  jest.spyOn(Appearance, 'addChangeListener').mockImplementation((listener) => {
    schemeListeners.push(listener as () => void);
    return {
      remove: () => {
        schemeListeners = schemeListeners.filter((l) => l !== listener);
      },
    } as never;
  });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event: string, listener: unknown) => {
      if (event === 'change')
        stateListeners.push(listener as (state: string) => void);
      return {
        remove: () => {
          stateListeners = stateListeners.filter((l) => l !== listener);
        },
      } as never;
    });
});
afterEach(() => {
  Platform.OS = originalOS;
  AppState.currentState = originalState;
  jest.restoreAllMocks();
});

/** The system changes its scheme, as the user's switch or UIKit does. */
function systemScheme(next: 'light' | 'dark') {
  scheme = next;
  act(() => [...schemeListeners].forEach((listener) => listener()));
}
function appState(next: 'active' | 'inactive' | 'background') {
  AppState.currentState = next;
  act(() => [...stateListeners].forEach((listener) => listener(next)));
}
function draw(element: ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}
type Flat = Record<string, unknown>;
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Flat;
/** The style of the host view that draws on `ground`, resolved if a function. */
function surface(tree: TestRenderer.ReactTestRenderer, ground: unknown): Flat {
  const styles = tree.root
    .findAll((node) => typeof node.type === 'string')
    .map((node) =>
      flat(
        typeof node.props.style === 'function'
          ? node.props.style({ pressed: false })
          : node.props.style,
      ),
    );
  const found = styles.find((style) => style.backgroundColor === ground);
  if (!found) throw new Error(`no view on ${String(ground)}`);
  return found;
}
const edge = (colour: string, width: number = hairline) => ({
  outlineColor: colour,
  outlineWidth: width,
  outlineOffset: -width,
  outlineStyle: 'solid',
});

describe('raised surfaces keep an edge on dark', () => {
  const tile = (
    <Tile
      title="Explore"
      line="From the record"
      symbol="doc.text"
      ink="navy"
      href="/workbench"
    />
  );
  const group = (
    <SurfaceContext.Provider value="sunken">
      <InsetGroup>
        <Text>One</Text>
        <Text>Two</Text>
      </InsetGroup>
    </SurfaceContext.Provider>
  );
  let grouped: boolean;
  beforeEach(() => {
    grouped = designFlags.groupedSurfaces;
    designFlags.groupedSurfaces = true;
    Platform.OS = 'android';
  });
  afterEach(() => {
    designFlags.groupedSurfaces = grouped;
  });

  test.each([
    ['a tile', tile],
    ['a grouped list', group],
  ])(
    '%s takes the card hairline in dark, and a clear one in light',
    (_, element) => {
      scheme = 'dark';
      const inDark = surface(draw(element), dark.raised);
      expect(inDark).toMatchObject(edge(dark.raisedOutline));
      // An outline, never a border: a border would move the content.
      expect(inDark.borderWidth).toBeUndefined();
      scheme = 'light';
      expect(surface(draw(element), light.raised)).toMatchObject(
        edge(light.raisedOutline),
      );
      // Clear in light, so the light drawing is unchanged.
      expect(light.raisedOutline).toBe('rgba(0,0,0,0)');
    },
  );

  test('the neutral status capsule has an edge on dark; the active one has none', () => {
    scheme = 'dark';
    const passed = surface(
      draw(<StatusCapsule status="Passed" />),
      dark.sunken,
    );
    expect(passed).toMatchObject(edge(dark.raisedOutline, 1));
    const before = surface(
      draw(<StatusCapsule status="Before parliament" />),
      dark.billsWash,
    );
    expect(before.outlineColor).toBeUndefined();
    scheme = 'light';
    expect(
      surface(draw(<StatusCapsule status="Passed" />), light.sunken),
    ).toMatchObject(edge('rgba(0,0,0,0)', 1));
  });
});

describe('a live switch on Android', () => {
  beforeEach(() => {
    Platform.OS = 'android';
  });

  test('the bar actions redraw in the new colours with no help from the stack', () => {
    // The element is built once, as `headerRight` builds it, and nothing
    // above it draws again.
    const bar = androidHeaderBar([
      { type: 'button', label: 'Done', onPress: () => undefined },
    ]);
    const tree = draw(<View>{bar}</View>);
    const word = () => flat(tree.root.findByType(NativeText).props.style).color;
    const ripple = () =>
      tree.root.find((node) => node.props.android_ripple !== undefined).props
        .android_ripple.color;
    expect([word(), ripple()]).toEqual([light.navy, light.navyWash]);
    systemScheme('dark');
    expect([word(), ripple()]).toEqual([dark.navy, dark.navyWash]);
    systemScheme('light');
    expect([word(), ripple()]).toEqual([light.navy, light.navyWash]);
  });

  test('the bar search field takes the new tint though its list reads no colour', () => {
    let tint: unknown;
    let renders = 0;
    function List() {
      tint = useListSearchBar({
        placeholder: 'Search bills',
        onChangeText: () => undefined,
        onSearchButtonPress: () => undefined,
        onCancelButtonPress: () => undefined,
      }).tintColor;
      renders += 1;
      return null;
    }
    draw(<List />);
    expect(tint).toBe(light.navy);
    systemScheme('dark');
    expect(tint).toBe(dark.navy);
    expect(renders).toBe(2);
  });

  test('a scrolled tab root keeps its raised bar through the switch', () => {
    const options: Record<string, unknown> = {};
    const navigation = {
      isFocused: () => true,
      addListener: () => () => undefined,
      getState: () => ({
        key: 'root-stack',
        routeNames: ['index', 'bill/[key]'],
        routes: [{ key: 'today-root', name: 'index' }],
      }),
      getParent: () => undefined,
      // As the navigator does: later options lie over earlier ones.
      setOptions: (next: object) => Object.assign(options, next),
    };
    const tree = draw(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider
          value={{ key: 'today-root', name: 'index' }}
        >
          <Screen>
            <View />
          </Screen>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
    const bar = () =>
      (options.headerStyle as { backgroundColor: unknown }).backgroundColor;
    const scrollTo = (y: number) =>
      act(() =>
        tree.root.findByType(ScrollView).props.onScroll({
          nativeEvent: {
            contentOffset: { x: 0, y },
            contentSize: { width: 402, height: 3000 },
            layoutMeasurement: { width: 402, height: 700 },
          },
        }),
      );
    // At rest the bar is the page.
    expect(bar()).toBe(light.paper);
    systemScheme('dark');
    expect(bar()).toBe(dark.paper);
    systemScheme('light');
    scrollTo(80);
    expect(bar()).toBe(light.navyWash);
    expect(options.headerShadowVisible).toBe(true);
    // Screen's own bar effect runs after the root hook's. It wrote the page
    // ground here, and the bar stayed that colour until the next scroll flip.
    systemScheme('dark');
    expect(bar()).toBe(dark.navyWash);
    expect(options.headerShadowVisible).toBe(true);
    systemScheme('light');
    expect(bar()).toBe(light.navyWash);
    scrollTo(0);
    expect(bar()).toBe(light.paper);
    expect(options.headerShadowVisible).toBe(false);
  });
});

describe('useIsDark holds the scheme while the app is not active', () => {
  function probe() {
    const seen = {
      dark: false,
      theme: undefined as MapTheme | undefined,
      renders: 0,
    };
    const themes = new Set<MapTheme>();
    function Probe() {
      seen.dark = useIsDark();
      seen.theme = useMapTheme();
      themes.add(seen.theme);
      seen.renders += 1;
      return null;
    }
    const tree = draw(<Probe />);
    return { seen, themes, tree };
  }

  test.each(['ios', 'android'] as const)(
    'on %s it is the real scheme, and follows a switch while active',
    (os) => {
      Platform.OS = os;
      const { seen } = probe();
      expect(seen.dark).toBe(false);
      systemScheme('dark');
      expect(seen.dark).toBe(true);
      expect(seen.theme!.appearance).toBe('dark');
      systemScheme('light');
      expect(seen.dark).toBe(false);
      expect(seen.renders).toBe(3);
    },
  );

  test.each(['inactive', 'background'] as const)(
    "UIKit's two snapshots (%s) draw nothing again and rebuild no map theme",
    (state) => {
      Platform.OS = 'ios';
      const { seen, themes } = probe();
      const theme = seen.theme;
      appState(state);
      // Light, dark, light: both appearances reported in turn.
      systemScheme('dark');
      expect(seen.dark).toBe(false);
      systemScheme('light');
      appState('active');
      expect(seen.dark).toBe(false);
      expect(seen.theme).toBe(theme);
      expect(themes.size).toBe(1);
      expect(seen.renders).toBe(1);
    },
  );

  test('a real change made while the app is behind shows on return', () => {
    Platform.OS = 'ios';
    const { seen, themes } = probe();
    appState('background');
    systemScheme('dark');
    expect(seen.dark).toBe(false);
    expect(seen.renders).toBe(1);
    appState('active');
    expect(seen.dark).toBe(true);
    expect(seen.theme!.appearance).toBe('dark');
    expect(themes.size).toBe(2);
    expect(seen.renders).toBe(2);
  });

  test('a component drawn while the app is behind takes the held answer too', () => {
    Platform.OS = 'ios';
    const first = probe();
    appState('background');
    systemScheme('dark');
    // Mid-snapshot: a late mount must not be the one dark thing on screen.
    const second = probe();
    expect(second.seen.dark).toBe(false);
    systemScheme('light');
    appState('active');
    expect([first.seen.dark, second.seen.dark]).toEqual([false, false]);
  });

  test('the system listeners are shared, and removed with the last component', () => {
    Platform.OS = 'ios';
    function Bare() {
      useIsDark();
      return null;
    }
    const one = draw(<Bare />);
    const two = draw(<Bare />);
    expect([schemeListeners.length, stateListeners.length]).toEqual([1, 1]);
    act(() => one.unmount());
    expect([schemeListeners.length, stateListeners.length]).toEqual([1, 1]);
    act(() => two.unmount());
    expect([schemeListeners.length, stateListeners.length]).toEqual([0, 0]);
  });
});
