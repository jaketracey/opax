import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform } from 'react-native';
import { type NativeStackNavigationOptions } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import {
  headerItems,
  pendingHeaderItems,
  useStackChrome,
} from '../src/navigation/chrome';
import { RouteOptions } from '../src/navigation/preview';
import { sharedScreens } from '../src/navigation/stack';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: {},
  useSegments: () => [],
}));

afterEach(() => jest.restoreAllMocks());

function pushed(
  name: string,
  previous = 'index',
  params: Record<string, string> = {},
) {
  const route = { name, key: 'pushed', params };
  const routes = [{ name: previous, key: 'previous' }, route];
  const navigation = {
    getState: () => ({ index: 1, routes }),
    setOptions: jest.fn(),
  };
  const screen = sharedScreens('(today)', false).find(
    (screen) => screen.props.name === name,
  )!;
  const initial: NativeStackNavigationOptions = screen.props.options({
    route,
    navigation,
  });
  return { initial, navigation, route, routes };
}

test('the navigator starts with a labelled, space-aware native back item', () => {
  let chrome!: ReturnType<typeof useStackChrome>;
  function Probe() {
    chrome = useStackChrome();
    return null;
  }
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(<Probe />);
  });
  expect(chrome).toMatchObject({
    headerBackTitle: 'Back',
    headerBackButtonDisplayMode: 'default',
    headerBackButtonMenuEnabled: true,
  });
  expect(chrome).not.toHaveProperty('headerBackTitleStyle');
  act(() => view.unmount());
});

test.each([
  ['grants', 'index', 'Today', 104],
  ['agencies', 'public-money', 'Public money', 104],
  ['directory', 'search', 'Search', 104],
  ['grant-program', 'grants', 'Grants', 44],
  ['grant-program', 'largest-grants', 'Largest grants', 44],
  ['money-item', 'explore/index', 'Tools', 104],
  ['explore/[tool]', 'explore/index', 'Tools', 104],
  ['division-history', 'bill-text/[key]', 'Back', 104],
  ['money-record', 'money', 'Money map', 44],
  ['doc/[slug]', 'search', 'Search', 104],
] as const)(
  '%s from %s has its final back settings and trailing space before mounting',
  (name, previous, back, spacing) => {
    const { initial } = pushed(name, previous);
    expect(initial).toMatchObject({
      headerBackTitle: back,
      headerBackButtonDisplayMode: 'default',
      headerBackButtonMenuEnabled: true,
    });
    expect(initial.unstable_headerRightItems?.({})).toEqual([
      { type: 'spacing', spacing },
    ]);
  },
);

test.each(['person/[slug]', 'party/[slug]', 'bill/[key]', 'money-item'])(
  '%s keeps a long source name eligible for UIKit shortening to Back',
  (name) => {
    const { initial, navigation, route, routes } = pushed(name, 'money-record');
    const longName =
      'A source record with a name that cannot fit beside the title and actions';
    Object.assign(routes[0]!, { params: { name: longName } });
    const screen = sharedScreens('(today)', false).find(
      (screen) => screen.props.name === name,
    )!;
    const options = screen.props.options({ route, navigation });
    expect(options).toMatchObject({
      headerBackTitle: longName,
      headerBackButtonDisplayMode: 'default',
      headerBackButtonMenuEnabled: true,
    });
    expect(options).not.toHaveProperty('headerBackTitleStyle');
    expect(initial.headerBackTitle).toBe('Money record');
  },
);

test('a source with a live title keeps UIKit title resolution from the first layout', () => {
  const { initial } = pushed('person/[slug]', 'members');
  expect(initial).toHaveProperty('headerBackTitle', undefined);
  expect(initial).toMatchObject({
    headerBackButtonDisplayMode: 'default',
    headerBackButtonMenuEnabled: true,
  });
});

test.each([
  ['person', 'People'],
  ['party', 'Parties'],
  ['electorate', 'Electorates'],
])('a %s directory retains its existing %s back label', (kind, back) => {
  const { navigation, route, routes } = pushed('person/[slug]', 'directory');
  Object.assign(routes[0]!, { params: { kind } });
  const screen = sharedScreens('(today)', false).find(
    (screen) => screen.props.name === 'person/[slug]',
  )!;
  expect(screen.props.options({ route, navigation }).headerBackTitle).toBe(
    back,
  );
});

test.each([
  ['money-record', 1],
  ['money-item', 2],
  ['grant-program', 1],
  ['grants', 2],
  ['agencies', 2],
  ['directory', 2],
] as const)(
  '%s retains its initial back settings and item callbacks as actions load',
  (name, count) => {
    const { initial, route, navigation } = pushed(name);
    const options = { ...initial };
    navigation.setOptions.mockImplementation((next) =>
      Object.assign(options, next),
    );
    const onPress = jest.fn();
    const render = (loaded: boolean) => (
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <RouteOptions
            options={headerItems(
              loaded
                ? () => [
                    ...(count === 2
                      ? [{ type: 'button' as const, label: 'Share', onPress }]
                      : []),
                    { type: 'button', label: 'More', onPress },
                  ]
                : undefined,
            )}
          />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );
    let view!: TestRenderer.ReactTestRenderer;
    act(() => {
      view = TestRenderer.create(render(false));
    });
    expect(options.unstable_headerRightItems?.({})).toEqual(
      initial.unstable_headerRightItems?.({}),
    );
    const callback = options.unstable_headerRightItems;
    // An item-only owner must not replace the stack's title with an empty one.
    expect(options.title).toBe(initial.title);
    act(() => view.update(render(true)));
    expect(options.unstable_headerRightItems).toBe(callback);
    expect(options.unstable_headerRightItems?.({})).toHaveLength(count);
    const item = options.unstable_headerRightItems?.({})[0];
    expect(item?.type).toBe('button');
    if (item?.type === 'button') item.onPress?.();
    expect(onPress).toHaveBeenCalledTimes(1);
    for (const [delta] of navigation.setOptions.mock.calls) {
      expect(
        Object.keys(delta).filter((key) => key.startsWith('headerBack')),
      ).toEqual([]);
      expect(delta.title).toBeUndefined();
    }
    expect(options.headerBackTitle).toBe(initial.headerBackTitle);
    expect(options.headerBackButtonDisplayMode).toBe(
      initial.headerBackButtonDisplayMode,
    );
    expect(options.headerBackButtonMenuEnabled).toBe(true);
    navigation.setOptions.mockClear();
    act(() => view.update(render(true)));
    expect(navigation.setOptions).not.toHaveBeenCalled();
    act(() => view.unmount());
  },
);

test('sheets and Android do not inherit loading reservations', () => {
  expect(pendingHeaderItems('money-item', { sheet: '1' })).toBeUndefined();
  const { initial } = pushed('money-item', 'index', { sheet: '1' });
  expect(initial.unstable_headerRightItems?.({})).toEqual([
    expect.objectContaining({ type: 'button', label: 'Done' }),
  ]);
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(pendingHeaderItems('money-record')).toBeUndefined();
  expect(pushed('money-record').initial).not.toHaveProperty('headerBackTitle');
});
