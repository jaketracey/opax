import { act, useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Platform, ScrollView, Text, View } from 'react-native';
import TestRenderer, { type ReactTestRendererJSON } from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  type WindowTraits,
} from '../src/design/adaptive';
import { BarFade } from '../src/design/bar-fade';
import { ClearBarRest, Screen } from '../src/design/layout';
import { Heading } from '../src/design/text';
import {
  TitlePin,
  titlePinLayout,
  useRailRootReselect,
} from '../src/navigation/title-pin';
import { useAndroidRootScroll } from '../src/navigation/useAndroidRootScroll';

/**
 * Build 91 on the closed iPhone Duo: with the tabs on the side rail, UIKit
 * minimised the title band as a page scrolled down, so every page lost its
 * title and kept an empty strip in its place. `TitlePin` keeps the band:
 * beside a vertical bar the page's first child is an empty view, so UIKit
 * finds no scroll view to follow and never minimises the bar.
 *
 * The simulator cannot unfold the Duo, so its inner display is staged here:
 * 951 by 669 with the rail, 669 by 951 without one, beside the outer display
 * and a standard phone. iPad runs the `pad` rule, fixed when the modules
 * load: tests/title-pin-pad.test.tsx.
 */

let mockEdge: 'unspecified' | 'leading' | 'trailing' = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => mockEdge,
}));
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));

const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
const mounted: TestRenderer.ReactTestRenderer[] = [];

function render(children: ReactNode) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<>{children}</>);
  });
  mounted.push(tree);
  return tree;
}

beforeEach(() => {
  mockEdge = 'unspecified';
  jest.replaceProperty(Platform, 'OS', 'ios');
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 27 });
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  Object.defineProperty(Platform, 'Version', version);
  jest.restoreAllMocks();
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});

/** The host views at the top of a rendered tree, in native order. */
function hosts(tree: TestRenderer.ReactTestRenderer): ReactTestRendererJSON[] {
  const json = tree.toJSON();
  return json === null ? [] : Array.isArray(json) ? json : [json];
}

/**
 * UIKit's search for the scroll view a bar follows: the first view, then
 * that view's first child, and so on down.
 */
function firstDescendantScroll(
  node: ReactTestRendererJSON | undefined,
): ReactTestRendererJSON | null {
  let at: ReactTestRendererJSON | string | undefined = node;
  while (at && typeof at !== 'string') {
    if (at.type === 'RCTScrollView') return at;
    at = at.children?.[0];
  }
  return null;
}

const page = (testID = 'page') => (
  <ScrollView testID={testID}>
    <Text>Rows</Text>
  </ScrollView>
);
const layout = (options: object, children = page()) =>
  titlePinLayout({ options, children } as never);

describe('the tab stacks’ screen layout', () => {
  test.each([
    ['a tab root', 'trailing', {}],
    ['a tab root', 'leading', {}],
    ['a pushed page', 'trailing', { presentation: 'card' }],
    ['a pushed page', 'leading', { headerTransparent: true }],
  ] as const)(
    '%s beside a %s bar: the pin is the page’s first child, so UIKit finds no scroll view to minimise the title band for',
    (_what, edge, options) => {
      mockEdge = edge;
      const tree = render(layout(options));
      const [first, second] = hosts(tree);
      expect(first!.props.testID).toBe('title-pin');
      // An empty view that takes no room and no touches, kept in the native
      // tree (a flattened view would not be a native child at all).
      expect(first!.props.collapsable).toBe(false);
      expect(first!.props.pointerEvents).toBe('none');
      expect(first!.props.style).toEqual({
        position: 'absolute',
        width: 0,
        height: 0,
      });
      expect(first!.children).toBeNull();
      expect(first!.props.accessibilityElementsHidden).toBe(true);
      expect(first!.props.importantForAccessibility).toBe(
        'no-hide-descendants',
      );
      expect(second!.type).toBe('RCTScrollView');
      expect(firstDescendantScroll(first)).toBeNull();
    },
  );

  test('with the bar at the bottom or top (iPhone, iPad, the Duo opened in portrait) nothing is added: UIKit still finds the scroll view, for the large title’s collapse and the minimising tab bar', () => {
    const tree = render(layout({}));
    const top = hosts(tree);
    expect(top).toHaveLength(1);
    expect(firstDescendantScroll(top[0])!.props.testID).toBe('page');
    expect(tree.root.findAllByProps({ testID: 'title-pin' })).toHaveLength(0);
  });

  test.each([
    'modal',
    'formSheet',
    'pageSheet',
    'fullScreenModal',
    'transparentModal',
    'containedModal',
  ])(
    'a %s in the stack is left alone beside a vertical bar: its scroll view drives its detents',
    (presentation) => {
      mockEdge = 'trailing';
      const top = hosts(render(layout({ presentation })));
      expect(top).toHaveLength(1);
      expect(firstDescendantScroll(top[0])!.props.testID).toBe('page');
    },
  );

  test('Android has no vertical bar and gets nothing', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockEdge = 'trailing';
    const top = hosts(render(layout({})));
    expect(top).toHaveLength(1);
    expect(top[0]!.type).toBe('RCTScrollView');
  });

  test('folding and unfolding adds and removes the pin under a mounted page, which is not mounted again', () => {
    let mounts = 0;
    function Page() {
      const [rows] = useState(() => 3);
      useEffect(() => {
        mounts += 1;
      }, []);
      return (
        <ScrollView testID="page">
          <Text>{rows}</Text>
        </ScrollView>
      );
    }
    const element = <Page />;
    const tree = render(<TitlePin presented={false}>{element}</TitlePin>);
    expect(hosts(tree)).toHaveLength(1);
    // Closed: the rail is on the trailing side.
    mockEdge = 'trailing';
    act(() => tree.update(<TitlePin presented={false}>{element}</TitlePin>));
    expect(hosts(tree).map((host) => host.props.testID)).toEqual([
      'title-pin',
      'page',
    ]);
    // Opened in portrait: the bar is at the bottom again.
    mockEdge = 'unspecified';
    act(() => tree.update(<TitlePin presented={false}>{element}</TitlePin>));
    expect(hosts(tree).map((host) => host.props.testID)).toEqual(['page']);
    expect(mounts).toBe(1);
  });
});

const rootRoute = { key: 'today-root', name: 'index' };
const pushedRoute = { key: 'bill-1', name: 'bill/[key]', params: {} };
const HEADER = 82;
const STACK_KEY = 'stack-today';

/** A tab's stack around one page: the root, or a page pushed on it. */
function Stack({
  pushed,
  tabs,
  children,
}: {
  pushed: boolean;
  /** The tab navigator above the stack, for the reselect tests. */
  tabs?: object;
  children: ReactNode;
}) {
  const route = pushed ? pushedRoute : rootRoute;
  const [descriptors, setDescriptors] = useState<
    Record<string, { options: Record<string, unknown> }>
  >({ [route.key]: { options: { headerTransparent: true } } });
  const [navigation] = useState(() => ({
    setOptions: (options: Record<string, unknown>) =>
      setDescriptors((old) => ({
        ...old,
        [route.key]: { options: { ...old[route.key]!.options, ...options } },
      })),
    getState: () => ({
      key: STACK_KEY,
      index: pushed ? 1 : 0,
      routes: pushed ? [rootRoute, pushedRoute] : [rootRoute],
      routeNames: ['index', 'bill/[key]', 'explore/[tool]', 'person/[slug]'],
    }),
    isFocused: () => true,
    addListener: () => () => {},
    getParent: () => tabs,
  }));
  return (
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={route as never}>
        <DescriptorsContext.Provider value={descriptors as never}>
          <SafeAreaInsetsContext.Provider
            value={{ top: 24, right: 0, bottom: 0, left: 0 }}
          >
            <HeaderHeightContext.Provider value={HEADER}>
              {children}
            </HeaderHeightContext.Provider>
          </SafeAreaInsetsContext.Provider>
        </DescriptorsContext.Provider>
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>
  );
}

const regular: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: true,
};
interface Pose {
  name: string;
  window: { width: number; height: number };
  traits: WindowTraits | null;
  edge: typeof mockEdge;
}
const poses: Pose[] = [
  {
    name: 'the Duo closed (466 by 678, rail)',
    window: { width: 466, height: 678 },
    traits: {
      horizontal: 'compact',
      vertical: 'regular',
      foldable: true,
      verticalBars: true,
    },
    edge: 'trailing',
  },
  {
    name: 'the Duo opened in landscape (951 by 669, rail)',
    window: { width: 951, height: 669 },
    traits: { ...regular, verticalBars: true },
    edge: 'trailing',
  },
  {
    name: 'the Duo opened in portrait (669 by 951)',
    window: { width: 669, height: 951 },
    traits: regular,
    edge: 'unspecified',
  },
  {
    name: 'a standard phone (402 by 874)',
    window: { width: 402, height: 874 },
    traits: null,
    edge: 'unspecified',
  },
];
function pose(p: Pose) {
  mockEdge = p.edge;
  act(() => {
    const size = { ...p.window, scale: 3, fontScale: 1 };
    Dimensions.set({ window: size, screen: size });
    setWindowTraitsOverride(p.traits);
  });
}

const fades = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(BarFade);

describe.each(poses.map((p) => [p.name, p] as const))('%s', (_name, p) => {
  const rail = p.edge !== 'unspecified';

  test.each([
    ['a tab root', false],
    ['a pushed page', true],
  ] as const)(
    '%s built on Screen: its title is pinned on the rail and the page fades under it',
    (_what, pushed) => {
      pose(p);
      const tree = render(
        <Stack pushed={pushed}>
          {layout(
            {},
            <Screen testID="page">
              <Heading level={1}>A page</Heading>
              <View>
                <Text>Rows</Text>
              </View>
            </Screen>,
          )}
        </Stack>,
      );
      const top = hosts(tree);
      expect(top[0]!.props.testID === 'title-pin').toBe(rail);
      // Off the rail UIKit still follows the page's scroll view.
      expect(firstDescendantScroll(top[0]) !== null).toBe(!rail);
      // A title that stays needs the page's own fade under it: on the rail
      // react-native-screens can no longer style UIKit's edge, and with no
      // fade a pushed page's text ran through its title.
      const fade = fades(tree);
      expect(fade).toHaveLength(1);
      // Whole to the bar's foot on the rail, where UIKit's own edge showed
      // as a faint band in the last 12 pt; as it was everywhere else.
      expect(fade[0]!.props.cover).toBe(rail ? 12 : 0);
    },
  );

  test('a pushed page with its own list (ClearBarRest): pinned on the rail, with the fade', () => {
    pose(p);
    const tree = render(
      <Stack pushed>
        {layout(
          {},
          <ClearBarRest ground="paper">
            <ScrollView testID="page">
              <Text>Rows</Text>
            </ScrollView>
          </ClearBarRest>,
        )}
      </Stack>,
    );
    const top = hosts(tree);
    expect(top[0]!.props.testID === 'title-pin').toBe(rail);
    expect(firstDescendantScroll(top[0]) !== null).toBe(!rail);
    const fade = fades(tree);
    expect(fade).toHaveLength(1);
    expect(fade[0]!.props.cover).toBe(rail ? 12 : 0);
  });
});

/**
 * A tab pressed again scrolls its root to the top. react-native-screens does
 * that for the scroll view it finds the way UIKit does, which the pin hides
 * on the rail: there the root does it from JS.
 */
describe('a tab pressed again beside a vertical bar', () => {
  /** The tab navigator: Today's stack is its first tab. */
  function tabsWith(selected: number) {
    const listeners: ((event: object) => void)[] = [];
    return {
      listeners,
      getState: () => ({
        type: 'tab',
        index: selected,
        routes: [
          { key: 'tab-today', state: { key: STACK_KEY } },
          { key: 'tab-bills', state: { key: 'stack-bills' } },
        ],
      }),
      addListener: (name: string, listener: (event: object) => void) => {
        if (name === 'tabPress') listeners.push(listener);
        return () => listeners.splice(listeners.indexOf(listener), 1);
      },
    };
  }
  const press = (tabs: ReturnType<typeof tabsWith>, event: object) =>
    act(() => {
      tabs.listeners.forEach((listener) => listener(event));
      jest.runOnlyPendingTimers();
    });
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function Root({ onReselect }: { onReselect: () => void }) {
    useRailRootReselect(onReselect);
    return null;
  }

  test.each([
    [
      'its own tab, already selected, nothing pushed',
      'trailing',
      0,
      false,
      'tab-today',
      {},
      1,
    ],
    ['the leading rail', 'leading', 0, false, 'tab-today', {}, 1],
    ['another tab pressed', 'trailing', 0, false, 'tab-bills', {}, 0],
    [
      'its tab pressed from another tab (a switch)',
      'trailing',
      1,
      false,
      'tab-today',
      {},
      0,
    ],
    [
      'a page pushed over the root (the press pops it)',
      'trailing',
      0,
      true,
      'tab-today',
      {},
      0,
    ],
    [
      'a press the system prevented',
      'trailing',
      0,
      false,
      'tab-today',
      { isPrevented: true },
      0,
    ],
  ] as const)('%s', (_what, edge, selected, pushed, target, data, calls) => {
    mockEdge = edge;
    const tabs = tabsWith(selected);
    const onReselect = jest.fn();
    render(
      <Stack pushed={pushed} tabs={tabs}>
        <Root onReselect={onReselect} />
      </Stack>,
    );
    press(tabs, { target, data });
    expect(onReselect).toHaveBeenCalledTimes(calls);
  });

  test('off the rail and on Android it listens for nothing: the native effect and Android’s own listener stand', () => {
    const tabs = tabsWith(0);
    const onReselect = jest.fn();
    const tree = render(
      <Stack pushed={false} tabs={tabs}>
        <Root onReselect={onReselect} />
      </Stack>,
    );
    expect(tabs.listeners).toHaveLength(0);
    act(() => tree.unmount());
    jest.replaceProperty(Platform, 'OS', 'android');
    mockEdge = 'trailing';
    render(
      <Stack pushed={false} tabs={tabs}>
        <Root onReselect={onReselect} />
      </Stack>,
    );
    expect(tabs.listeners).toHaveLength(0);
  });

  test('a Screen root goes to its resting top under the pinned title, past 0, and overflow is allowed only for that scroll', () => {
    mockEdge = 'trailing';
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    scrollTo.mockClear();
    const tabs = tabsWith(0);
    const tree = render(
      <Stack pushed={false} tabs={tabs}>
        {layout(
          {},
          <Screen testID="page">
            <Heading level={1}>Today</Heading>
          </Screen>,
        )}
      </Stack>,
    );
    const scroll = () => tree.root.findByType(ScrollView);
    expect(scroll().props.scrollToOverflowEnabled).toBe(false);
    press(tabs, { target: 'tab-today', data: {} });
    // The clear bar lies over the scroll view: its top is minus the bar.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -HEADER, animated: true });
    expect(scroll().props.scrollToOverflowEnabled).toBe(true);
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(scroll().props.scrollToOverflowEnabled).toBe(false);
    scrollTo.mockRestore();
  });

  test('a root’s own list (Bills) goes to 0, below its solid rail bar', () => {
    mockEdge = 'trailing';
    const tabs = tabsWith(0);
    const scrollToOffset = jest.fn();
    function List() {
      useAndroidRootScroll({ current: { scrollToOffset } });
      return null;
    }
    render(
      <Stack pushed={false} tabs={tabs}>
        <List />
      </Stack>,
    );
    press(tabs, { target: 'tab-today', data: {} });
    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    expect(scrollToOffset).toHaveBeenLastCalledWith({
      offset: 0,
      animated: true,
    });
  });
});
