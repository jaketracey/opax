import { act, type ReactElement } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import * as accessibility from '../src/design/accessibility';
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
    ['a page with no setting on', 'trailing', tabStack, undefined, false],
  ] as const)('%s is not backed', (_name, edge, names, presentation, on) => {
    mockBarEdge = edge;
    solid.mockReturnValue(on);
    expect('headerBackground' in page([...names], presentation)).toBe(false);
  });
});
