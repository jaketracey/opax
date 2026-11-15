import { act, useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
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
    act(() => jest.advanceTimersByTime(1000));
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

// The people lists set their route options as they render (RouteOptions
// with inline options), and every setOptions gives the stack new
// descriptors. A page that read the descriptors itself re-rendered without
// end: "Maximum update depth exceeded" on Voting record, Declared interests,
// Speeches and Largest sources (b71 review, caught on the simulator).
test('a list under ClearBarRest does not re-render its page when options change', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockBarEdge = 'trailing';
  let pageRenders = 0;
  let listProps: object | null = null;
  function Options({
    options,
    set,
  }: {
    options: object;
    set: (value: object) => void;
  }) {
    // As RouteOptions does: a new options object is a new setOptions.
    useLayoutEffect(() => set(options), [options, set]);
    return null;
  }
  function Page({ set }: { set: (value: object) => void }) {
    pageRenders += 1;
    return (
      <>
        <Options options={{ title: 'Voting record' }} set={set} />
        <ClearBarRest>
          {(list) => {
            listProps = list;
            return <FlatList data={[]} renderItem={() => null} {...list} />;
          }}
        </ClearBarRest>
      </>
    );
  }
  function Stack() {
    const [descriptors, setDescriptors] = useState({
      [route.key]: { options: { headerTransparent: true } },
    });
    const set = useCallback(
      (options: object) =>
        setDescriptors({
          [route.key]: { options: { headerTransparent: true, ...options } },
        }),
      [],
    );
    const page = useMemo(() => <Page set={set} />, [set]);
    return (
      <NavigationRouteContext.Provider value={route as never}>
        <DescriptorsContext.Provider value={descriptors as never}>
          <HeaderHeightContext.Provider value={82}>
            {page}
          </HeaderHeightContext.Provider>
        </DescriptorsContext.Provider>
      </NavigationRouteContext.Provider>
    );
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Stack />);
  });
  expect(pageRenders).toBe(1);
  // Under the clear bar the list still gets the rest check's props.
  expect(listProps).toMatchObject({ scrollEventThrottle: 16 });
  act(() => renderer.unmount());
});
