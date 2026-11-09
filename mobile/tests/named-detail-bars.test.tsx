import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform, SectionList, type View } from 'react-native';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import DivisionHistory from '../src/features/directories/DivisionHistory';
import { loadDivisionHistory } from '../src/features/directories/division-data';
import { useNamedBackOptions } from '../src/navigation/useNamedBackOptions';
import { BarTitle, useTitleOnScroll } from '../src/navigation/useTitleOnScroll';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/directories/division-data', () => ({
  loadDivisionHistory: jest.fn(),
}));

let view: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
  if (view) act(() => view!.unmount());
  view = undefined;
});

function navigationFor(...names: string[]) {
  const routes = names.map((name, i) => ({ name, key: `route-${i}` }));
  return {
    route: routes.at(-1)!,
    navigation: {
      getState: () => ({ index: routes.length - 1, routes }),
      setOptions: jest.fn(),
      isFocused: () => true,
      addListener: () => () => {},
    },
  };
}

test.each([
  [['index', 'explore/index', 'explore/[tool]'], 'Tools'],
  [['bills', 'bill/[key]', 'bill-text/[key]', 'division-history'], 'Bill text'],
  [['index', 'leads', 'lead/[id]', 'money-item'], 'Lead'],
  [['index', 'explore/[tool]'], 'Today'],
  [['bills', 'bill/[key]'], 'Bills'],
  [['index', 'bill/[key]', 'bill-text/[key]'], undefined],
  [['index'], undefined],
] as const)('%j supplies the named back options %s', (names, title) => {
  const { route, navigation } = navigationFor(...names);
  let options: ReturnType<typeof useNamedBackOptions> = {};
  function Probe() {
    options = useNamedBackOptions();
    return null;
  }
  act(() => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <Probe />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  expect(options).toEqual({
    headerBackButtonDisplayMode: 'default',
    ...(title ? { headerBackTitle: title } : {}),
    ...(['Tools', 'Bill text', 'Lead'].includes(title ?? '')
      ? { headerBackButtonMenuEnabled: false }
      : {}),
  });
});

test('named back options leave Android to its native header', () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  let options: ReturnType<typeof useNamedBackOptions> | undefined;
  function Probe() {
    options = useNamedBackOptions();
    return null;
  }
  try {
    act(() => {
      view = TestRenderer.create(<Probe />);
    });
    expect(options).toEqual({});
  } finally {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: original,
    });
  }
});

test('Votes keeps its named back button and shows the inline title only after the heading scrolls away', async () => {
  jest.mocked(loadDivisionHistory).mockResolvedValue({
    rows: [],
    loaded: 0,
    total: 0,
    failed: 0,
    asAt: '2026-11-10',
    stale: false,
    savedAt: 1,
    partial: false,
  });
  const { route, navigation } = navigationFor(
    'bills',
    'bill/[key]',
    'bill-text/[key]',
    'division-history',
  );
  const options: Record<string, unknown> = {};
  navigation.setOptions.mockImplementation((next) =>
    Object.assign(options, next),
  );
  await act(async () => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <DivisionHistory />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  expect(options).toMatchObject({
    title: 'Votes in parliament',
    headerBackTitle: 'Bill text',
    headerBackButtonDisplayMode: 'default',
    headerBackButtonMenuEnabled: false,
  });
  const inline = () => (options.headerTitle as () => React.ReactElement)();
  expect(inline().type).toBe(BarTitle);
  expect(inline().props.shown).toBe(false);
  const list = view!.root.findByType(SectionList);
  const heading = list.props.ListHeaderComponent.props.children[0];
  expect(heading.props.collapsable).toBe(false);
  heading.props.ref.current.measure = (
    done: (...coordinates: number[]) => void,
  ) => done(0, 0, 300, 60, 0, 44);
  act(() =>
    heading.props.onLayout({ nativeEvent: { layout: { y: 0, height: 60 } } }),
  );
  // Native automatic insets can arrive after the first layout event.
  expect(inline().props.shown).toBe(false);
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: -44 } } }),
  );
  expect(inline().props.shown).toBe(false);
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: 200 } } }),
  );
  expect(inline().props.shown).toBe(true);
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: -44 } } }),
  );
  expect(inline().props.shown).toBe(false);
});

function scrollTitle(ref: React.RefObject<View | null> | null) {
  let hook!: ReturnType<typeof useTitleOnScroll>;
  const options: Record<string, unknown> = {};
  const setOptions = jest.fn((next) => Object.assign(options, next));
  function Probe() {
    hook = useTitleOnScroll(ref, 'Votes in parliament');
    return null;
  }
  act(() => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={{ setOptions } as never}>
        <HeaderHeightContext.Provider value={100}>
          <Probe />
        </HeaderHeightContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  return {
    hook: {
      onTitleLayout: (...args: Parameters<typeof hook.onTitleLayout>) =>
        hook.onTitleLayout(...args),
      onScroll: (...args: Parameters<typeof hook.onScroll>) =>
        hook.onScroll(...args),
    },
    inline: () => (options.headerTitle as () => React.ReactElement)(),
    setOptions,
  };
}

const headingLayout = {
  nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 80 } },
} as never;

test('a native heading waits for the automatic resting inset before its viewport measurement', () => {
  const measure = jest.fn((done) => done(0, 0, 300, 80, 0, 120));
  const ref = { current: { measure } as unknown as View };
  const { hook, inline, setOptions } = scrollTitle(ref);
  act(() => hook.onTitleLayout(headingLayout));
  expect(measure).not.toHaveBeenCalled();
  expect(inline().props.shown).toBe(false);
  act(() => hook.onScroll(-100));
  expect(measure).toHaveBeenCalledTimes(1);
  expect(inline().props.shown).toBe(false);
  const restingTitle = setOptions.mock.calls.at(-1)![0]
    .headerTitle as () => React.ReactElement;
  act(() => hook.onScroll(0));
  expect(inline().props.shown).toBe(false);
  act(() => hook.onScroll(1));
  expect(inline().props.shown).toBe(true);
  expect(restingTitle().props.shown).toBe(false);
  act(() => hook.onScroll(-100));
  expect(inline().props.shown).toBe(false);
});

test.each([
  [0, 0, 0],
  [300, 0, 0],
  [300, 80, NaN],
])(
  'invalid initial native measurements (%j, %j, %j) never reveal a title',
  (width, height, pageY) => {
    const measure = jest.fn((done) => done(0, 0, width, height, 0, pageY));
    const { hook, inline } = scrollTitle({
      current: { measure } as unknown as View,
    });
    act(() => hook.onTitleLayout(headingLayout));
    act(() => hook.onScroll(-100));
    expect(inline().props.shown).toBe(false);
    measure.mockImplementation((done) => done(0, 0, 300, 80, 0, 120));
    act(() => hook.onScroll(-100));
    expect(inline().props.shown).toBe(false);
    act(() => hook.onScroll(1));
    expect(inline().props.shown).toBe(true);
  },
);

test('a missing native ref never uses a nested wrapper’s local coordinates', () => {
  const ref: React.RefObject<View | null> = { current: null };
  const { hook, inline } = scrollTitle(ref);
  act(() => hook.onTitleLayout(headingLayout));
  act(() => hook.onScroll(0));
  expect(inline().props.shown).toBe(false);
  ref.current = {
    measure: (done) => done(0, 0, 300, 80, 0, 120),
  } as View;
  act(() => hook.onScroll(0));
  expect(inline().props.shown).toBe(false);
  act(() => hook.onScroll(101));
  expect(inline().props.shown).toBe(true);
});

test('an asynchronous heading measurement never mixes two scroll offsets', () => {
  let complete!: (...coordinates: number[]) => void;
  const measure = jest.fn((done) => {
    complete = done;
  });
  const { hook, inline } = scrollTitle({
    current: { measure } as unknown as View,
  });
  act(() => hook.onTitleLayout(headingLayout));
  act(() => hook.onScroll(-100));
  act(() => hook.onScroll(0));
  act(() => complete(0, 0, 300, 80, 0, 120));
  expect(inline().props.shown).toBe(false);
  expect(measure).toHaveBeenCalledTimes(2);
  act(() => complete(0, 0, 300, 80, 0, 20));
  act(() => hook.onScroll(1));
  expect(inline().props.shown).toBe(true);
});
