import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  Animated,
  Dimensions,
  Platform,
  SectionList,
  StyleSheet,
  type View,
} from 'react-native';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import DivisionHistory from '../src/features/directories/DivisionHistory';
import Members from '../src/features/your-mp/Members';
import { catalogs } from '../src/api/runtime';
import { Screen } from '../src/design/layout';
import { loadDivisionHistory } from '../src/features/directories/division-data';
import {
  useNamedBackOptions,
  useNamedBackTitle,
} from '../src/navigation/useNamedBackOptions';
import {
  BarTitle,
  barTitleWidth,
  useTitleOnScroll,
} from '../src/navigation/useTitleOnScroll';

const mockParams = { seat: 'federal-senate-nsw-new-south-wales' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { directory: jest.fn(), electorateFor: jest.fn() },
}));
jest.mock('../src/features/directories/division-data', () => ({
  loadDivisionHistory: jest.fn(),
}));

let view: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
  if (view) act(() => view!.unmount());
  view = undefined;
});

function nativeMeasurements() {
  const pending: Parameters<View['measure']>[0][] = [];
  const measure = jest.fn((done: Parameters<View['measure']>[0]) => {
    pending.push(done);
  });
  const node = { measure } as unknown as View;
  return {
    node,
    ref: { current: node } as React.RefObject<View | null>,
    measure,
    answer: (request: number, pageY: number, height = 80, width = 300) =>
      act(async () => {
        await Promise.resolve();
        pending[request]!(0, 0, width, height, 0, pageY);
      }),
  };
}

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
  [['your-mp', 'members'], 'Your MP'],
  [['index', 'bill/[key]', 'bill-text/[key]'], undefined],
  [['index'], undefined],
] as const)('%j supplies the named back options %s', (names, title) => {
  const { route, navigation } = navigationFor(...names);
  let options: ReturnType<typeof useNamedBackOptions> = {};
  let backTitle: string | undefined;
  function Probe() {
    options = useNamedBackOptions();
    backTitle = useNamedBackTitle();
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
  expect(backTitle).toBe(title);
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
  const native = nativeMeasurements();
  heading.props.ref.current.measure = native.measure;
  act(() =>
    heading.props.onLayout({ nativeEvent: { layout: { y: 0, height: 60 } } }),
  );
  expect(native.measure).not.toHaveBeenCalled();
  expect(inline().props.shown).toBe(false);
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: -44 } } }),
  );
  await native.answer(0, 140, 60);
  expect(inline().props.shown).toBe(false);
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: -800 } } }),
  );
  // Window coordinates already include the native scroll, even though the
  // JS offset still looks like a negative resting inset.
  await native.answer(1, -20, 60);
  expect(inline().props.shown).toBe(true);
  act(() =>
    list.props.onScroll({ nativeEvent: { contentOffset: { y: 9000 } } }),
  );
  await native.answer(2, 140, 60);
  expect(inline().props.shown).toBe(false);
});

test('the NSW Members route reveals Senators from asynchronous window coordinates', async () => {
  jest.mocked(catalogs.directory).mockResolvedValue({
    electorates: {
      data: {
        electorates: [
          {
            electorate_id: mockParams.seat,
            slug: mockParams.seat,
            name: 'New South Wales',
            state_code: 'NSW',
            jurisdiction: 'federal',
            chamber: 'senate',
            representatives: [],
            detail_url: '/electorates/nsw.json',
            url: 'https://www.aph.gov.au/Senators_and_Members/Senators',
          },
        ],
      },
      stale: false,
    },
  } as never);
  jest
    .mocked(catalogs.electorateFor)
    .mockResolvedValue({ data: { terms: [] } } as never);
  const { route, navigation } = navigationFor('index', 'members');
  const options: Record<string, unknown> = {};
  navigation.setOptions.mockImplementation((next) =>
    Object.assign(options, next),
  );
  await act(async () => {
    view = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <HeaderHeightContext.Provider value={100}>
            <Members />
          </HeaderHeightContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  const screen = view!.root.findByType(Screen);
  const heading = screen.props.children[0].props.children[0];
  const native = nativeMeasurements();
  heading.props.ref.current.measure = native.measure;
  const inline = () => (options.headerTitle as () => React.ReactElement)();
  expect(inline().props).toMatchObject({ title: 'Senators', shown: false });
  act(() => heading.props.onLayout(headingLayout));
  expect(native.measure).not.toHaveBeenCalled();
  act(() => screen.props.onScroll(10000));
  await native.answer(0, 120);
  expect(inline().props.shown).toBe(false);
  act(() => screen.props.onScroll(-1000));
  await native.answer(1, 10);
  expect(inline().props).toMatchObject({ title: 'Senators', shown: true });
  act(() => screen.props.onScroll(20000));
  await native.answer(2, 200);
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
      setAnchorBottom: (...args: Parameters<typeof hook.setAnchorBottom>) =>
        hook.setAnchorBottom(...args),
    },
    inline: () => (options.headerTitle as () => React.ReactElement)(),
    header: () => options.headerTitle,
    setOptions,
  };
}

const headingLayout = {
  nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 80 } },
} as never;

test('iOS compares asynchronous window measurements without using the JS scroll offset', async () => {
  const native = nativeMeasurements();
  const { hook, inline, setOptions } = scrollTitle(native.ref);
  const restingTitle = setOptions.mock.calls.at(-1)![0]
    .headerTitle as () => React.ReactElement;
  setOptions.mockClear();
  act(() => hook.onTitleLayout(headingLayout));
  expect(native.measure).not.toHaveBeenCalled();
  expect(inline().props.shown).toBe(false);
  expect(setOptions).not.toHaveBeenCalled();

  act(() => hook.onScroll(5000));
  expect(inline().props.shown).toBe(false);
  await native.answer(0, 120);
  expect(inline().props.shown).toBe(false);
  expect(setOptions).not.toHaveBeenCalled();

  act(() => hook.onScroll(-900));
  await native.answer(1, 20);
  expect(inline().props.shown).toBe(true);
  expect(restingTitle().props.shown).toBe(false);
  expect(setOptions).toHaveBeenCalledTimes(1);

  act(() => hook.onScroll(-1000));
  await native.answer(2, -400);
  expect(native.measure).toHaveBeenCalledTimes(3);
  expect(setOptions).toHaveBeenCalledTimes(1);

  act(() => hook.onScroll(9000));
  await native.answer(3, 120);
  expect(inline().props.shown).toBe(false);
  expect(setOptions).toHaveBeenCalledTimes(2);
});

test('only the newest asynchronous measurement can change visibility', async () => {
  const native = nativeMeasurements();
  const { hook, inline } = scrollTitle(native.ref);
  act(() => {
    hook.onScroll(-100);
    hook.onScroll(-200);
  });
  expect(native.measure).toHaveBeenCalledTimes(2);
  await native.answer(1, 10);
  expect(inline().props.shown).toBe(true);
  await native.answer(0, 200);
  expect(inline().props.shown).toBe(true);

  act(() => {
    hook.onScroll(10000);
    hook.onScroll(-4000);
  });
  await native.answer(3, 200);
  expect(inline().props.shown).toBe(false);
  await native.answer(2, -400);
  expect(inline().props.shown).toBe(false);
});

test.each([
  [NaN, 80, 300],
  [Infinity, 80, 300],
  [20, NaN, 300],
  [20, Infinity, 300],
  [20, 0, 300],
  [20, -1, 300],
  [20, 80, NaN],
])(
  'invalid window measurement (%j, %j, %j) preserves visibility',
  async (pageY, height, width) => {
    const native = nativeMeasurements();
    const { hook, inline, setOptions } = scrollTitle(native.ref);
    setOptions.mockClear();
    act(() => hook.onScroll(5000));
    await native.answer(0, pageY, height, width);
    expect(inline().props.shown).toBe(false);
    expect(setOptions).not.toHaveBeenCalled();

    act(() => hook.onScroll(-500));
    await native.answer(1, 10);
    expect(inline().props.shown).toBe(true);
    setOptions.mockClear();
    act(() => hook.onScroll(9000));
    await native.answer(2, pageY, height, width);
    expect(inline().props.shown).toBe(true);
    expect(setOptions).not.toHaveBeenCalled();
  },
);

test.each([
  [21, true],
  [21.1, false],
])(
  'the window boundary has 1 pt tolerance at pageY %s',
  async (pageY, expected) => {
    const native = nativeMeasurements();
    const { hook, inline } = scrollTitle(native.ref);
    act(() => hook.onScroll(-1000));
    await native.answer(0, pageY);
    expect(inline().props.shown).toBe(expected);
  },
);

test('relayout mid-scroll keeps the shown title while a fresh window measurement is pending', async () => {
  const native = nativeMeasurements();
  const { hook, inline, setOptions } = scrollTitle(native.ref);
  act(() => hook.onScroll(-900));
  await native.answer(0, 10);
  expect(inline().props.shown).toBe(true);
  setOptions.mockClear();

  act(() => hook.onTitleLayout(headingLayout));
  expect(native.measure).toHaveBeenCalledTimes(2);
  expect(inline().props.shown).toBe(true);
  expect(setOptions).not.toHaveBeenCalled();
  await native.answer(1, -20);
  expect(inline().props.shown).toBe(true);
  expect(setOptions).not.toHaveBeenCalled();

  act(() => hook.onTitleLayout(headingLayout));
  expect(inline().props.shown).toBe(true);
  await native.answer(2, 200);
  expect(inline().props.shown).toBe(false);
});

test('a virtualised heading keeps its revealed title and invalidates the old node’s response', async () => {
  const native = nativeMeasurements();
  const { hook, inline } = scrollTitle(native.ref);
  act(() => hook.onScroll(-1000));
  await native.answer(0, 10);
  expect(inline().props.shown).toBe(true);

  act(() => hook.onScroll(9000));
  native.ref.current = null;
  act(() => hook.onScroll(-2000));
  await native.answer(1, 200);
  expect(inline().props.shown).toBe(true);

  const replacement = nativeMeasurements();
  native.ref.current = replacement.node;
  act(() => hook.onTitleLayout(headingLayout));
  await replacement.answer(0, 200);
  expect(inline().props.shown).toBe(false);
});

test('a replaced heading cannot block later measurements, even if its old request never answers', async () => {
  const native = nativeMeasurements();
  const { hook, inline } = scrollTitle(native.ref);
  act(() => hook.onScroll(-100));
  const replacement = nativeMeasurements();
  native.ref.current = replacement.node;
  act(() => hook.onTitleLayout(headingLayout));
  expect(replacement.measure).toHaveBeenCalledTimes(1);
  await replacement.answer(0, 10);
  expect(inline().props.shown).toBe(true);
  await native.answer(0, 200);
  expect(inline().props.shown).toBe(true);
  act(() => hook.onScroll(5000));
  await replacement.answer(1, 200);
  expect(inline().props.shown).toBe(false);
});

test('an unmounted heading cannot install a late title', async () => {
  const native = nativeMeasurements();
  const { hook, setOptions } = scrollTitle(native.ref);
  act(() => hook.onScroll(-1000));
  act(() => view!.unmount());
  view = undefined;
  setOptions.mockClear();
  await native.answer(0, 10);
  expect(setOptions).not.toHaveBeenCalled();
});

test('Screen-provided content anchors keep the baseline threshold', () => {
  const { hook, inline } = scrollTitle(null);
  act(() => hook.setAnchorBottom(200));
  act(() => hook.onScroll(99));
  expect(inline().props.shown).toBe(false);
  act(() => hook.onScroll(101));
  expect(inline().props.shown).toBe(true);
  act(() => hook.onScroll(0));
  expect(inline().props.shown).toBe(false);
});

test('Android keeps its baseline content-coordinate measurement and string title', async () => {
  const original = Platform.OS;
  try {
    Platform.OS = 'android';
    const native = nativeMeasurements();
    const { hook, header } = scrollTitle(native.ref);
    act(() => hook.onTitleLayout(headingLayout));
    expect(native.measure).toHaveBeenCalledTimes(1);
    await native.answer(0, 200);
    act(() => hook.onScroll(179));
    expect(header()).toBe('');
    act(() => hook.onScroll(181));
    expect(header()).toBe('Votes in parliament');
    act(() => hook.onScroll(0));
    expect(header()).toBe('');
    act(() => view!.unmount());
    view = undefined;
  } finally {
    Platform.OS = original;
  }
});

test.each([
  [402, 1, 266],
  [402, 2, 146],
  [402, 3, 26],
  [375, 1, 239],
  [375, 2, 119],
  [1024, 1, 512],
])(
  'existing bar widths stay unchanged at %i pt with %i items',
  (width, trailing, expected) => {
    expect(barTitleWidth(width, trailing)).toBe(expected);
    expect(barTitleWidth(width, trailing, undefined)).toBe(expected);
  },
);

test('the Version pill gets off-centre title room on a 402 pt iPhone and no title width at rest', () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');
  try {
    act(() => {
      Dimensions.set({
        window: { ...originalWindow, width: 402 },
        screen: { ...originalScreen, width: 402 },
      });
      view = TestRenderer.create(
        <BarTitle
          title="Synthetic short bill name"
          shown
          trailing={2}
          trailingWidth={120 + 44}
        />,
      );
    });
    const text = () => view!.root.findByType(Animated.Text);
    expect(StyleSheet.flatten(text().props.style).maxWidth).toBe(90);
    expect(text().props).toMatchObject({
      numberOfLines: 1,
      ellipsizeMode: 'tail',
    });
    act(() =>
      view!.update(
        <BarTitle
          key="rest"
          title="Synthetic short bill name"
          shown={false}
          trailing={2}
          trailingWidth={120 + 44}
        />,
      ),
    );
    expect(StyleSheet.flatten(text().props.style).maxWidth).toBe(0);
    expect(barTitleWidth(200, 2, 164)).toBe(0);
    expect(barTitleWidth(1024, 2, 164)).toBe(512);
  } finally {
    act(() =>
      Dimensions.set({ window: originalWindow, screen: originalScreen }),
    );
  }
});
