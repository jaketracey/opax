import { act, Profiler, useState, type ReactNode } from 'react';
import { Dimensions, Platform, Text, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Screen } from '../src/design/layout';
import { Heading } from '../src/design/text';
import { headerItems } from '../src/navigation/chrome';
import { RouteOptions } from '../src/navigation/preview';

// Off the rail, every pushed Screen and RouteOptions reads the stack's
// descriptors to know its bar is the clear one, so each re-renders whenever
// any page sets options. That is the shape of build 71's "Maximum update
// depth exceeded": a page that set options as it rendered, and read them.
// Here the stack is a real one in that respect: every setOptions makes new
// descriptors. A member profile's name crosses into the bar and back, and
// the renders and the options set per crossing are counted.
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => 'unspecified',
}));
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));

const root = { key: 'today-root', name: 'index' };
const pushed = { key: 'person-1', name: 'person/[slug]', params: {} };
const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
const HEADER = 114;

let sets = 0;
/** A stack as the native one behaves: options set are new descriptors. */
function Stack({ children }: { children: ReactNode }) {
  const [descriptors, setDescriptors] = useState<
    Record<string, { options: Record<string, unknown> }>
  >({ [pushed.key]: { options: { headerTransparent: true } } });
  const [navigation] = useState(() => ({
    setOptions: (options: Record<string, unknown>) => {
      sets += 1;
      setDescriptors((old) => ({
        ...old,
        [pushed.key]: {
          options: { ...old[pushed.key]!.options, ...options },
        },
      }));
    },
    getState: () => ({
      index: 1,
      routes: [root, pushed],
      routeNames: ['index', 'bill/[key]', 'explore/[tool]', 'person/[slug]'],
    }),
    isFocused: () => true,
    addListener: () => () => {},
  }));
  return (
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={pushed as never}>
        <DescriptorsContext.Provider value={descriptors as never}>
          <SafeAreaInsetsContext.Provider
            value={{ top: 62, right: 0, bottom: 34, left: 0 }}
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

/** The profile's own shape: inline options, and its name as the bar title. */
function Profile({ name }: { name: string }) {
  return (
    <>
      <RouteOptions
        stableItems
        options={{
          title: name,
          headerBackButtonDisplayMode: 'default',
          ...headerItems(() => []),
        }}
      />
      <Screen testID="page" barTitle={name}>
        <Heading level={1}>{name}</Heading>
        <View>
          <Text>Rows</Text>
        </View>
      </Screen>
    </>
  );
}

beforeEach(() => {
  sets = 0;
  jest.replaceProperty(Platform, 'OS', 'ios');
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
  const size = { width: 402, height: 874, scale: 3, fontScale: 1 };
  act(() => Dimensions.set({ window: size, screen: size }));
});
afterEach(() => {
  Object.defineProperty(Platform, 'Version', version);
  jest.restoreAllMocks();
});

test('a profile’s name crossing into the bar renders the page a bounded number of times, the same at every crossing', async () => {
  let commits = 0;
  // The heading's window frame, as UIKit would report it to measure().
  const heading = { pageY: 200, height: 40 };
  // The page element is made once: only context can re-render it.
  const page = <Profile name="Sam Placeholder" />;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <Stack>
        <Profiler id="page" onRender={() => (commits += 1)}>
          {page}
        </Profiler>
      </Stack>,
    );
  });
  // Under the stack's clear bar the page draws its fade: it is one of the
  // pages that reads the descriptors.
  expect(
    tree.root.findAll(
      (n) => n.props.testID === 'bar-fade' && typeof n.type === 'string',
    ),
  ).toHaveLength(1);
  const anchor = tree.root
    .findAll(
      (node) =>
        node.type === View &&
        node.props.collapsable === false &&
        node.findAll((child) => child.type === Heading).length > 0,
    )
    .at(-1)!;
  Object.assign(anchor.instance as object, {
    measure: (
      callback: (
        x: number,
        y: number,
        width: number,
        height: number,
        pageX: number,
        pageY: number,
      ) => void,
    ) => callback(0, 0, 370, heading.height, 16, heading.pageY),
  });
  const scroll = tree.root.find(
    (node) =>
      typeof node.type !== 'string' &&
      node.props.testID === 'page' &&
      typeof node.props.onScroll === 'function',
  );
  // One scroll event, and everything it leads to, flushed.
  const scrollTo = async (y: number, pageY: number) => {
    heading.pageY = pageY;
    const before = { commits, sets };
    await act(async () =>
      scroll.props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y },
          contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
          contentSize: { width: 402, height: 3000 },
          layoutMeasurement: { width: 402, height: 874 },
        },
      }),
    );
    await act(async () => {});
    return { renders: commits - before.commits, sets: sets - before.sets };
  };
  // Mounting settles: the options are installed, and nothing keeps going.
  await act(async () => {});
  const mountSets = sets;
  expect(mountSets).toBeGreaterThan(0);
  expect(mountSets).toBeLessThanOrEqual(6);
  const mountCommits = commits;
  await act(async () => {});
  expect({ sets, commits }).toEqual({ sets: mountSets, commits: mountCommits });

  // The profiler hears of a render on the flush after it, so a count is
  // taken over a scroll and the quiet one that follows it.
  const quiet = { renders: 0, sets: 0 };
  // The first scrolls are the page's own (it notes it has left its rest);
  // after them a scroll that crosses nothing sets nothing, renders nothing.
  await scrollTo(8, 192);
  await scrollTo(10, 190);
  expect(await scrollTo(12, 188)).toEqual(quiet);
  expect(await scrollTo(14, 186)).toEqual(quiet);

  // Six crossings: under the bar, back out, and again.
  const perCrossing: { renders: number; sets: number }[] = [];
  for (let i = 0; i < 6; i += 1) {
    const under = i % 2 === 0;
    const crossed = await scrollTo(under ? 300 + i : i, under ? 54 : 200);
    const after = await scrollTo(under ? 310 + i : 2 + i, heading.pageY);
    perCrossing.push({
      renders: crossed.renders + after.renders,
      sets: crossed.sets + after.sets,
    });
    // Nothing follows the crossing on its own: the page is quiet again.
    expect(await scrollTo(under ? 320 + i : 4 + i, heading.pageY)).toEqual(
      quiet,
    );
    expect(await scrollTo(under ? 330 + i : 6 + i, heading.pageY)).toEqual(
      quiet,
    );
  }
  // One set of options per crossing, and at most two renders of the page
  // for it: bounded, and no larger at the sixth crossing than at the first.
  for (const crossing of perCrossing) {
    expect(crossing.sets).toBe(1);
    expect(crossing.renders).toBeGreaterThanOrEqual(1);
    expect(crossing.renders).toBeLessThanOrEqual(2);
    expect(crossing).toEqual(perCrossing[0]);
  }
  // Measured here: one render and one set of options per crossing.
  expect(perCrossing[0]).toEqual({ renders: 1, sets: 1 });
  act(() => tree.unmount());
});
