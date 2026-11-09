import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform, SectionList } from 'react-native';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import DivisionHistory from '../src/features/directories/DivisionHistory';
import { loadDivisionHistory } from '../src/features/directories/division-data';
import { useNamedBackOptions } from '../src/navigation/useNamedBackOptions';
import { BarTitle } from '../src/navigation/useTitleOnScroll';

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
  });
  const inline = () => (options.headerTitle as () => React.ReactElement)();
  expect(inline().type).toBe(BarTitle);
  expect(inline().props.shown).toBe(false);
  const list = view!.root.findByType(SectionList);
  const heading = list.props.ListHeaderComponent.props.children[0];
  heading.props.ref.current.measure = (
    done: (...coordinates: number[]) => void,
  ) => done(0, 0, 300, 60, 0, 44);
  act(() =>
    heading.props.onLayout({ nativeEvent: { layout: { y: 0, height: 60 } } }),
  );
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: 200 } } }),
  );
  expect(inline().props.shown).toBe(true);
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: -44 } } }),
  );
  expect(inline().props.shown).toBe(false);
});
