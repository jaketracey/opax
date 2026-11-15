import { act, type ReactElement } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import * as accessibility from '../src/design/accessibility';
import { colors } from '../src/design/tokens';
import { paperBar } from '../src/features/sources/parts';
import { clearBarStyle, opaqueBar } from '../src/navigation/chrome';
import { RouteOptions } from '../src/navigation/preview';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { ClearBarRest, FixedPage, Screen } from '../src/design/layout';

let mockBarEdge: 'unspecified' | 'leading' | 'trailing' = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => mockBarEdge,
}));

const route = { key: 'votes-1', name: 'person/[slug]/votes' };

function page(headerTransparent: boolean | undefined) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <NavigationRouteContext.Provider value={route as never}>
        <DescriptorsContext.Provider
          value={{ [route.key]: { options: { headerTransparent } } } as never}
        >
          {/* The closed Duo's title band ends 82 pt down (DUO.md). */}
          <HeaderHeightContext.Provider value={82}>
            <FixedPage style={{ flex: 1 }} testID="fixed" />
          </HeaderHeightContext.Provider>
        </DescriptorsContext.Provider>
      </NavigationRouteContext.Provider>,
    );
  });
  const style = StyleSheet.flatten(renderer.root.findByType(View).props.style);
  act(() => renderer.unmount());
  return style;
}

afterEach(() => {
  mockBarEdge = 'unspecified';
});

// A tab stack's pushed pages run under a clear bar beside a vertical bar.
// UIKit insets their scroll views; a skeleton or message in a plain View
// would start at the top edge, under the title band.
test.each(['leading', 'trailing'] as const)(
  'a fixed page under a clear bar beside a %s bar starts below the title band',
  (edge) => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockBarEdge = edge;
    expect(page(true)).toEqual({ flex: 1, paddingTop: 82 });
  },
);

test.each([
  // The same list opened in a sheet keeps an opaque bar on the rail.
  ['trailing', false],
  ['trailing', undefined],
  // iPhone, iPad and the unfolded Duo: a glass route (the electorate page)
  // has a clear bar, and its fixed states are as they were.
  ['unspecified', true],
  ['unspecified', false],
] as const)(
  'a fixed page beside a %s bar with headerTransparent %s is the plain View',
  (edge, transparent) => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockBarEdge = edge;
    expect(page(transparent)).toEqual({ flex: 1 });
  },
);

// A scroll view that mounts after its page is on screen (a skeleton swapped
// for the loaded page) has been left 24 pt past rest under the clear bar,
// its heading under the title band's edge (party page, b71 review).
describe('a late scroll view under the clear bar', () => {
  function screen(headerTransparent: boolean) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationRouteContext.Provider value={route as never}>
          <DescriptorsContext.Provider
            value={{ [route.key]: { options: { headerTransparent } } } as never}
          >
            <HeaderHeightContext.Provider value={82}>
              <Screen testID="page">
                <View />
              </Screen>
            </HeaderHeightContext.Provider>
          </DescriptorsContext.Provider>
        </NavigationRouteContext.Provider>,
      );
    });
    const scroll = () => renderer.root.findByType(ScrollView);
    const at = (y: number) =>
      act(() =>
        scroll().props.onScroll({ nativeEvent: { contentOffset: { y } } }),
      );
    return { renderer, scroll, at };
  }
  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'ios');
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('left between rest and 0, it is put back at rest below the band', () => {
    mockBarEdge = 'trailing';
    const page = screen(true);
    expect(page.scroll().props.contentOffset).toBeUndefined();
    page.at(-58);
    act(() => jest.advanceTimersByTime(450));
    expect(page.scroll().props.contentOffset).toEqual({ x: 0, y: -82 });
    act(() => page.renderer.unmount());
  });

  test('at rest, or once the reader has dragged, it is left alone', () => {
    mockBarEdge = 'trailing';
    const rested = screen(true);
    rested.at(-82);
    act(() => jest.advanceTimersByTime(1000));
    expect(rested.scroll().props.contentOffset).toBeUndefined();
    act(() => rested.renderer.unmount());
    const dragged = screen(true);
    act(() => dragged.scroll().props.onScrollBeginDrag());
    dragged.at(-24);
    act(() => jest.advanceTimersByTime(1000));
    expect(dragged.scroll().props.contentOffset).toBeUndefined();
    act(() => dragged.renderer.unmount());
  });

  test.each([
    ['unspecified', true],
    ['trailing', false],
  ] as const)(
    'beside a %s bar with headerTransparent %s nothing is corrected',
    (edge, transparent) => {
      mockBarEdge = edge;
      const page = screen(transparent);
      page.at(-58);
      act(() => jest.advanceTimersByTime(1000));
      expect(page.scroll().props.contentOffset).toBeUndefined();
      act(() => page.renderer.unmount());
    },
  );
});

// The rest check is for a view still settling after it mounts. It must not
// undo the reader: a VoiceOver scroll begins no drag, and a reader who
// scrolls a few points, opens a page and comes back was put back at rest.
describe('the rest check ends with the settling', () => {
  const listeners: Record<string, () => void> = {};
  const navigation = {
    addListener: (name: string, listener: () => void) => {
      listeners[name] = listener;
      return () => delete listeners[name];
    },
    setOptions: () => undefined,
    getState: () => ({ index: 1, routes: [], routeNames: [] }),
    isFocused: () => true,
  };
  function page() {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route as never}>
            <DescriptorsContext.Provider
              value={
                {
                  [route.key]: { options: { headerTransparent: true } },
                } as never
              }
            >
              <HeaderHeightContext.Provider value={82}>
                <Screen testID="page">
                  <View />
                </Screen>
              </HeaderHeightContext.Provider>
            </DescriptorsContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    const scroll = () => renderer.root.findByType(ScrollView);
    const at = (y: number) =>
      act(() =>
        scroll().props.onScroll({ nativeEvent: { contentOffset: { y } } }),
      );
    return { renderer, scroll, at };
  }
  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockBarEdge = 'trailing';
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('a push that ends with the view past rest corrects it at once', () => {
    const view = page();
    view.at(-58);
    act(() => listeners.transitionEnd!());
    expect(view.scroll().props.contentOffset).toEqual({ x: 0, y: -82 });
    act(() => view.renderer.unmount());
  });

  test('at rest first and carried past it afterwards, it is still corrected', () => {
    // The race as captured: rest, then 24 pt past it, with no reader.
    const view = page();
    view.at(-82);
    view.at(-58);
    act(() => jest.advanceTimersByTime(450));
    expect(view.scroll().props.contentOffset).toEqual({ x: 0, y: -82 });
    act(() => view.renderer.unmount());
  });

  test('once settled, a scroll that begins no drag (VoiceOver) is left alone', () => {
    const view = page();
    view.at(-82);
    act(() => jest.advanceTimersByTime(3000));
    view.at(-60);
    act(() => listeners.transitionEnd!());
    act(() => jest.advanceTimersByTime(3000));
    expect(view.scroll().props.contentOffset).toBeUndefined();
    act(() => view.renderer.unmount());
  });

  test('after the settling time, coming back from another page corrects nothing', () => {
    const view = page();
    act(() => jest.advanceTimersByTime(3000));
    view.at(-40);
    act(() => listeners.transitionEnd!());
    act(() => jest.advanceTimersByTime(3000));
    expect(view.scroll().props.contentOffset).toBeUndefined();
    act(() => view.renderer.unmount());
  });

  test('carried off again after a correction, it is corrected again', () => {
    // The prop only acts when it changes, so each correction is a new value.
    const view = page();
    view.at(-58);
    act(() => jest.advanceTimersByTime(450));
    const first = view.scroll().props.contentOffset;
    expect(first.y).toBeCloseTo(-82, 1);
    view.at(-58);
    act(() => listeners.transitionEnd!());
    const second = view.scroll().props.contentOffset;
    expect(second.y).toBeCloseTo(-82, 1);
    expect(second.y).not.toBe(first.y);
    act(() => view.renderer.unmount());
  });

  test('a push that ends late is still looked at, and a moment after', () => {
    const view = page();
    view.at(-82);
    act(() => jest.advanceTimersByTime(1600));
    act(() => listeners.transitionEnd!());
    expect(view.scroll().props.contentOffset).toBeUndefined();
    view.at(-58);
    act(() => jest.advanceTimersByTime(300));
    expect(view.scroll().props.contentOffset.y).toBeCloseTo(-82, 1);
    act(() => view.renderer.unmount());
  });

  test('a drag ends it at once', () => {
    const view = page();
    act(() => view.scroll().props.onScrollBeginDrag());
    view.at(-58);
    act(() => listeners.transitionEnd!());
    act(() => jest.advanceTimersByTime(3000));
    expect(view.scroll().props.contentOffset).toBeUndefined();
    act(() => view.renderer.unmount());
  });
});

// A page's own list takes the rest check through ClearBarRest, which adds
// its props to the element the page made: the page's row functions keep
// their identity, so a change in the stack's options rebuilds no row.
test.each([
  ['trailing', true],
  ['unspecified', false],
] as const)(
  'ClearBarRest beside a %s bar keeps the list element and adds props: %s',
  (edge, adds) => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockBarEdge = edge;
    const renderItem = () => null;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationRouteContext.Provider value={route as never}>
          <DescriptorsContext.Provider
            value={
              { [route.key]: { options: { headerTransparent: true } } } as never
            }
          >
            <HeaderHeightContext.Provider value={82}>
              <ClearBarRest>
                <FlatList data={[]} renderItem={renderItem} testID="list" />
              </ClearBarRest>
            </HeaderHeightContext.Provider>
          </DescriptorsContext.Provider>
        </NavigationRouteContext.Provider>,
      );
    });
    const list = renderer.root.findByType(FlatList).props;
    expect(list.renderItem).toBe(renderItem);
    expect(list.testID).toBe('list');
    expect(list.scrollEventThrottle).toBe(adds ? 16 : undefined);
    expect(typeof list.onScrollBeginDrag).toBe(adds ? 'function' : 'undefined');
    act(() => renderer.unmount());
  },
);

// Reduce Transparency or Increase Contrast beside a vertical bar: the pushed
// page keeps the solid bar, on its own ground. UIKit's bar background stops
// short of the top edge there, and the strip above showed the system's grey.
describe('a solid bar beside a vertical bar', () => {
  function page(routeNames: string[], presentation?: string) {
    const options: Record<string, unknown>[] = [];
    const navigation = {
      addListener: () => () => undefined,
      setOptions: (value: Record<string, unknown>) => options.push(value),
      getState: () => ({
        index: 1,
        routes: [{ key: 'root' }, { key: route.key }],
        routeNames,
      }),
      isFocused: () => true,
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route as never}>
            <DescriptorsContext.Provider
              value={
                {
                  [route.key]: {
                    options: { headerTransparent: false, presentation },
                  },
                } as never
              }
            >
              <Screen grouped testID="page">
                <View />
              </Screen>
            </DescriptorsContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    act(() => renderer.unmount());
    return Object.assign({}, ...options) as Record<string, unknown>;
  }
  const tabStack = ['index', 'bill/[key]', 'explore/[tool]'];
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  let solid: jest.SpyInstance;
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 27,
    });
    solid = jest.spyOn(accessibility, 'useSolidBar').mockReturnValue(true);
  });
  afterEach(() => {
    solid.mockRestore();
    if (version) Object.defineProperty(Platform, 'Version', version);
  });

  test('a pushed page in a tab stack backs its bar in its own ground', () => {
    mockBarEdge = 'trailing';
    const options = page(tabStack);
    const backing = (
      options.headerBackground as () => ReactElement<{
        style: { backgroundColor: unknown };
      }>
    )();
    expect(backing.props.style.backgroundColor).toBe(
      (options.headerStyle as { backgroundColor: unknown }).backgroundColor,
    );
  });

  test.each([
    ['a sheet in the tab stack', 'trailing', tabStack, 'formSheet', true],
    [
      'a page in a modal stack',
      'trailing',
      ['index', 'about'],
      undefined,
      true,
    ],
    ['an iPhone page', 'unspecified', tabStack, undefined, true],
  ] as const)('%s is not backed', (_name, edge, names, presentation, on) => {
    mockBarEdge = edge;
    solid.mockReturnValue(on);
    expect('headerBackground' in page([...names], presentation)).toBe(false);
  });

  test('an opaque pushed page with no setting on is backed too', () => {
    // A bar that holds a search field is solid beside the rail whatever the
    // settings; its page backs it like the legibility bar.
    mockBarEdge = 'trailing';
    solid.mockReturnValue(false);
    expect(typeof page(tabStack).headerBackground).toBe('function');
  });
});

// Under the clear rail bar the page is the ground. UIKit paints a coloured
// bar from 14 pt down to the band's foot and draws its hairline there: the
// glossary's paper bar was a paper band over the darker page at rest, and
// the hairline crossed the electorate map at 24 pt once the band had folded
// (b73). Neither Screen nor a page's own RouteOptions colours a clear bar.
describe('no bar colour or hairline under the clear rail bar', () => {
  function options(
    edge: typeof mockBarEdge,
    headerTransparent: boolean,
    content: ReactElement,
  ) {
    mockBarEdge = edge;
    const calls: Record<string, unknown>[] = [];
    const navigation = {
      addListener: () => () => undefined,
      setOptions: (value: Record<string, unknown>) => calls.push(value),
      getState: () => ({
        index: 1,
        routes: [{ key: 'root' }, { key: route.key }],
        routeNames: ['index', 'bill/[key]', 'explore/[tool]'],
      }),
      isFocused: () => true,
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route as never}>
            <DescriptorsContext.Provider
              value={
                { [route.key]: { options: { headerTransparent } } } as never
              }
            >
              {content}
            </DescriptorsContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    act(() => renderer.unmount());
    return calls;
  }
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 27,
    });
  });
  afterEach(() => {
    if (version) Object.defineProperty(Platform, 'Version', version);
  });
  const screen = (
    <Screen grouped testID="electorate-screen">
      <View />
    </Screen>
  );
  // The glossary: a grouped page that sets a paper bar of its own.
  const glossary = (
    <>
      <RouteOptions options={{ title: 'A to Z glossary', ...paperBar }} />
      {screen}
    </>
  );

  test.each([
    ['the electorate page (Screen)', screen],
    ['the glossary (a paper bar of its own)', glossary],
  ] as const)('%s beside the rail', (_name, content) => {
    const styled = options('trailing', true, content).filter(
      (call) => 'headerStyle' in call,
    );
    expect(styled.length).toBeGreaterThan(0);
    for (const call of styled) {
      expect(call.headerStyle).toEqual({});
      expect(call.headerLargeStyle).toEqual({});
      expect(call.headerShadowVisible).toBe(false);
    }
  });

  // Build 82: iPhone and iPad too, on iOS 26. A pushed page under the
  // stack's clear bar sets no colour and no hairline.
  test('a pushed Screen page on iPhone has no bar colour or hairline', () => {
    const styled = options('unspecified', true, screen).filter(
      (call) => 'headerStyle' in call,
    );
    expect(styled.length).toBeGreaterThan(0);
    for (const call of styled) {
      expect(call.headerStyle).toEqual({});
      expect(call.headerShadowVisible).toBe(false);
    }
  });

  test.each([
    // iPhone and iPad, below a solid bar (a search field holds it): the
    // glossary's paper bar is the one it had.
    ['unspecified', false, glossary, [colors.paper, colors.sunken]],
    // The same page in a sheet beside the rail keeps its opaque bar.
    ['trailing', false, glossary, [colors.paper, colors.sunken]],
  ] as const)(
    'beside a %s bar with headerTransparent %s the bar keeps its colour and hairline',
    (edge, transparent, content, grounds) => {
      const styled = options(edge, transparent, content).filter(
        (call) => 'headerStyle' in call,
      );
      const seen = styled.map(
        (call) =>
          (call.headerStyle as { backgroundColor: unknown }).backgroundColor,
      );
      expect(seen.length).toBeGreaterThan(0);
      for (const colour of seen) expect(grounds).toContain(colour);
      for (const ground of grounds) expect(seen).toContain(ground);
      // Beside the rail the page's own bar is set last, so it wins.
      if (edge !== 'unspecified') expect(seen.at(-1)).toBe(grounds[0]);
      for (const call of styled) expect(call.headerShadowVisible).toBe(true);
    },
  );

  test('clearBarStyle leaves other options and uncoloured options alone', () => {
    const plain = { title: 'Bills', headerTitle: 'Bills' };
    expect(clearBarStyle(plain)).toBe(plain);
    expect(
      clearBarStyle({ title: 'Glossary', ...opaqueBar(colors.paper) }),
    ).toEqual({
      title: 'Glossary',
      headerStyle: {},
      headerLargeStyle: {},
      headerShadowVisible: false,
    });
  });
});

// With Reduce Transparency or Increase Contrast on, the rail bar is solid
// and backed. A page that sets a bar colour of its own (the glossary's
// paper bar on the darker grouped page) is backed in that colour: backed in
// the page's, it had 14 pt of the darker page above a paper band at rest.
test('a page’s own bar colour is backed in that colour under the solid rail bar', () => {
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  jest.replaceProperty(Platform, 'OS', 'ios');
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 27 });
  const solid = jest.spyOn(accessibility, 'useSolidBar').mockReturnValue(true);
  mockBarEdge = 'trailing';
  const calls: Record<string, unknown>[] = [];
  const navigation = {
    addListener: () => () => undefined,
    setOptions: (value: Record<string, unknown>) => calls.push(value),
    getState: () => ({
      index: 1,
      routes: [{ key: 'root' }, { key: route.key }],
      routeNames: ['index', 'bill/[key]', 'explore/[tool]'],
    }),
    isFocused: () => true,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  try {
    act(() => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route as never}>
            <DescriptorsContext.Provider
              value={
                {
                  [route.key]: { options: { headerTransparent: false } },
                } as never
              }
            >
              <RouteOptions
                options={{ title: 'A to Z glossary', ...paperBar }}
              />
              <Screen grouped>
                <View />
              </Screen>
            </DescriptorsContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    // Each call that colours the bar backs it in the same colour.
    const coloured = calls.filter((call) => 'headerStyle' in call);
    expect(coloured.length).toBeGreaterThanOrEqual(2);
    for (const call of coloured) {
      const backing = (
        call.headerBackground as () => ReactElement<{
          style: { backgroundColor: unknown };
        }>
      )();
      expect(backing.props.style.backgroundColor).toBe(
        (call.headerStyle as { backgroundColor: unknown }).backgroundColor,
      );
    }
    expect(
      coloured.map(
        (call) =>
          (call.headerStyle as { backgroundColor: unknown }).backgroundColor,
      ),
    ).toEqual(expect.arrayContaining([colors.paper, colors.sunken]));
    // The page's own paper bar is set last, backed in paper.
    expect(
      (coloured.at(-1)!.headerStyle as { backgroundColor: unknown })
        .backgroundColor,
    ).toBe(colors.paper);
  } finally {
    act(() => renderer.unmount());
    solid.mockRestore();
    if (version) Object.defineProperty(Platform, 'Version', version);
  }
});

// Methods, Datasets, Portraits and Photo credits are paper pages in the
// Account sheet, whose stack paints its screens in the darker grouped
// ground. Beside the rail UIKit's bar background stops short of the top
// edge, so that darker container showed as a strip above the paper bar. A
// sheet cannot take the backing view; Screen gives the container the page's
// own ground instead.
test.each([
  ['trailing', false, colors.paper, true],
  ['leading', true, colors.sunken, true],
  // iPhone, iPad and the unfolded Duo: Screen sets what it set before.
  ['unspecified', false, colors.paper, false],
] as const)(
  'beside a %s bar a sheet page (grouped: %s) paints its container in the page ground',
  (edge, grouped, ground, painted) => {
    const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
    jest.replaceProperty(Platform, 'OS', 'ios');
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 27,
    });
    mockBarEdge = edge;
    const calls: Record<string, unknown>[] = [];
    const navigation = {
      addListener: () => () => undefined,
      setOptions: (value: Record<string, unknown>) => calls.push(value),
      // The Account stack: a sheet's own stack, not a tab's.
      getState: () => ({
        index: 1,
        routes: [{ key: 'root' }, { key: route.key }],
        routeNames: ['index', 'about', 'methods'],
      }),
      isFocused: () => true,
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      act(() => {
        renderer = TestRenderer.create(
          <NavigationContext.Provider value={navigation as never}>
            <NavigationRouteContext.Provider value={route as never}>
              <DescriptorsContext.Provider
                value={
                  {
                    [route.key]: { options: { headerTransparent: false } },
                  } as never
                }
              >
                <Screen grouped={grouped} testID="methods-screen">
                  <View />
                </Screen>
              </DescriptorsContext.Provider>
            </NavigationRouteContext.Provider>
          </NavigationContext.Provider>,
        );
      });
      const set = Object.assign({}, ...calls) as Record<string, unknown>;
      // The bar keeps its opaque colour and hairline, and takes no backing.
      expect(set).toMatchObject(opaqueBar(ground));
      expect('headerBackground' in set).toBe(false);
      expect(set.contentStyle).toEqual(
        painted ? { backgroundColor: ground } : undefined,
      );
      expect('contentStyle' in set).toBe(painted);
    } finally {
      act(() => renderer.unmount());
      if (version) Object.defineProperty(Platform, 'Version', version);
    }
  },
);

// The photo viewer is a full-screen modal in the tab stack. It sets a clear
// bar of its own with a dark scrim under its white "n of N" title. Beside
// the rail RouteOptions stripped that scrim as if it were a pushed page's
// bar colour (b74 review), and the title sat straight on the photo.
describe('a presented page keeps the bar it sets itself', () => {
  const scrim = { backgroundColor: 'rgba(0,0,0,0.4)' };
  const viewer = {
    title: '1 of 6',
    headerTransparent: true,
    headerStyle: scrim,
  };
  function set(
    edge: typeof mockBarEdge,
    presentation: string | undefined,
    options: Record<string, unknown>,
    solidSetting = false,
  ) {
    mockBarEdge = edge;
    const solid = jest
      .spyOn(accessibility, 'useSolidBar')
      .mockReturnValue(solidSetting);
    const calls: Record<string, unknown>[] = [];
    const navigation = {
      addListener: () => () => undefined,
      setOptions: (value: Record<string, unknown>) => calls.push(value),
      getState: () => ({
        index: 1,
        routes: [{ key: 'root' }, { key: route.key }],
        routeNames: ['index', 'bill/[key]', 'explore/[tool]'],
      }),
      isFocused: () => true,
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route as never}>
            <DescriptorsContext.Provider
              value={
                {
                  [route.key]: {
                    options: {
                      headerTransparent: options.headerTransparent ?? false,
                      presentation,
                    },
                  },
                } as never
              }
            >
              <RouteOptions options={options} />
            </DescriptorsContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    act(() => renderer.unmount());
    solid.mockRestore();
    return Object.assign({}, ...calls) as Record<string, unknown>;
  }
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 27,
    });
  });
  afterEach(() => {
    if (version) Object.defineProperty(Platform, 'Version', version);
  });

  test.each([
    ['trailing', false],
    ['leading', false],
    // Increase Contrast: still its own scrim, and no backing behind it.
    ['trailing', true],
    ['unspecified', false],
  ] as const)(
    'the photo viewer beside a %s bar (legibility setting: %s) keeps its scrim',
    (edge, solidSetting) => {
      const options = set(edge, 'fullScreenModal', viewer, solidSetting);
      expect(options.headerStyle).toEqual(scrim);
      expect('headerShadowVisible' in options).toBe(false);
      expect('headerBackground' in options).toBe(false);
    },
  );

  test('a pushed page with the same options loses the colour beside the rail', () => {
    // The control: the gate is the presentation, not the options.
    expect(set('trailing', undefined, viewer).headerStyle).toEqual({});
    expect(set('trailing', 'card', viewer).headerStyle).toEqual({});
  });

  test.each([
    // iPhone, iPad and the unfolded Duo, with a legibility setting on.
    ['unspecified', undefined],
    // A sheet beside the rail.
    ['trailing', 'formSheet'],
  ] as const)(
    'a paper bar beside a %s bar (presentation %s) takes no backing',
    (edge, presentation) => {
      const options = set(edge, presentation, { ...paperBar }, true);
      expect(options).toEqual({ ...paperBar });
      expect('headerBackground' in options).toBe(false);
    },
  );

  test('a pushed page’s paper bar on the solid rail bar is backed in paper', () => {
    // The control for the case above.
    const options = set('trailing', undefined, { ...paperBar }, true);
    expect(typeof options.headerBackground).toBe('function');
  });
});

// A search field is stacked below the title band on the rail, outside what
// UIKit's scroll edge covers. The pushed Bills list drew a covered title
// with the field floating over its rows (b74). Any pushed page whose bar
// holds a search field takes the solid bar on the page's own ground, as the
// rail roots do.
describe('a pushed page with a search field beside the rail', () => {
  const search = { headerSearchBarOptions: { placeholder: 'Search bills' } };
  function set(
    edge: typeof mockBarEdge,
    content: ReactElement,
    {
      first = false,
      presentation,
      below = false,
    }: {
      first?: boolean;
      presentation?: string;
      /** The stack laid this route out below its bar (pinned headers). */
      below?: boolean;
    } = {},
  ) {
    mockBarEdge = edge;
    const calls: Record<string, unknown>[] = [];
    const navigation = {
      addListener: () => () => undefined,
      setOptions: (value: Record<string, unknown>) => calls.push(value),
      getState: () => ({
        index: first ? 0 : 1,
        routes: first
          ? [{ key: route.key }]
          : [{ key: 'root' }, { key: route.key }],
        routeNames: ['index', 'bill/[key]', 'explore/[tool]'],
      }),
      isFocused: () => true,
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route as never}>
            <DescriptorsContext.Provider
              value={
                {
                  [route.key]: {
                    options: { headerTransparent: !below, presentation },
                  },
                } as never
              }
            >
              {content}
            </DescriptorsContext.Provider>
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    act(() => renderer.unmount());
    return Object.assign({}, ...calls) as Record<string, unknown>;
  }
  const backing = (options: Record<string, unknown>) =>
    (
      options.headerBackground as () => ReactElement<{
        style: { backgroundColor: unknown };
      }>
    )().props.style.backgroundColor;
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 27,
    });
  });
  afterEach(() => {
    if (version) Object.defineProperty(Platform, 'Version', version);
  });

  test('a list with no Screen is solid and backed in paper', () => {
    const options = set('trailing', <RouteOptions options={search} />);
    expect(options.headerTransparent).toBe(false);
    expect(backing(options)).toBe(colors.paper);
  });

  test('a page with a Screen is backed in that page’s ground', () => {
    const options = set(
      'leading',
      <>
        <RouteOptions options={search} />
        <Screen grouped>
          <View />
        </Screen>
      </>,
    );
    expect(options.headerTransparent).toBe(false);
    expect(backing(options)).toBe(colors.sunken);
  });

  // iPhone and iPad run pushed pages under a clear bar too, and there the
  // bar holds its field inside the height the fade covers: a page with a
  // field keeps the clear bar, with no colour and no hairline (hub ruling:
  // no pushed page keeps the hairline).
  test('on iPhone a list with a field keeps the clear bar: no colour, no hairline', () => {
    const options = set(
      'unspecified',
      <RouteOptions
        options={{
          ...search,
          headerStyle: { backgroundColor: colors.paper },
        }}
      />,
    );
    expect(options.headerTransparent).toBe(true);
    expect(options.headerStyle).toEqual({});
    expect(options.headerShadowVisible).toBe(false);
    expect(options.headerBackground).toBeUndefined();
  });

  // A list with pinned section headers is laid out below its bar by the
  // stack. Its bar is the page's own ground with no hairline, and no backing.
  test('on iPhone a list laid out below its bar, with a field, has the page’s ground and no hairline', () => {
    const options = set('unspecified', <RouteOptions options={search} />, {
      below: true,
    });
    expect(options.headerTransparent).toBe(false);
    expect(options.headerStyle).toEqual({ backgroundColor: colors.paper });
    expect(options.headerShadowVisible).toBe(false);
    expect('headerBackground' in options).toBe(false);
  });

  test('a page that drops its field takes the clear bar back', () => {
    const options = set(
      'trailing',
      <RouteOptions options={{ headerSearchBarOptions: undefined }} />,
    );
    expect(options.headerTransparent).toBe(true);
    expect(options.headerBackground).toBeUndefined();
  });

  test.each([
    // A tab root: its own owner sets its bar (useRootBarAppearance).
    ['unspecified', { first: true }],
    ['trailing', { first: true }],
    // A sheet in the tab stack.
    ['trailing', { presentation: 'formSheet' }],
  ] as const)(
    'beside a %s bar (%o) the page’s options pass through untouched',
    (edge, where) => {
      const options = set(edge, <RouteOptions options={search} />, where);
      expect('headerTransparent' in options).toBe(false);
      expect('headerBackground' in options).toBe(false);
    },
  );
});
