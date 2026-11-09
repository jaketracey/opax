import { NavigationContext } from 'expo-router/react-navigation';
import { PaneHost } from '../src/design/split';
import { useNetworkState } from 'expo-network';
import { act } from 'react';
import { Pressable, RefreshControl } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { useOffline } from '../src/api/useOffline';
import { Card } from '../src/design/card';
import { KeyboardStableScreen, Screen } from '../src/design/layout';
import { StatePageProvider } from '../src/design/states';

jest.mock('@expo/ui/swift-ui', () => {
  const React = jest.requireActual('react');
  const part = (name: string) =>
    function MockPart({ children, ...props }: any) {
      return React.createElement(name, props, children);
    };
  return {
    Host: part('Host'),
    RNHostView: part('RNHostView'),
    Button: part('MenuButton'),
    Menu: part('Menu'),
    Section: part('MenuSection'),
    ContextMenu: Object.assign(part('ContextMenu'), {
      Trigger: part('Trigger'),
      Items: part('Items'),
    }),
  };
});
jest.mock('../src/design/useStableKeyboard', () => ({
  useStableKeyboard: () => ({
    onLayout: () => undefined,
    onScroll: () => undefined,
    contentStyle: {},
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
  useSegments: () => [],
}));

test('a card without a navigation destination keeps its menu and existing accessibility actions', () => {
  const source = jest.fn(),
    copy = jest.fn();
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <Card
        testID="card"
        menu={[{ title: 'Sources', onPress: source }]}
        accessibilityActions={[{ name: 'Copy', label: 'Copy', onAction: copy }]}
      >
        <Pressable />
      </Card>,
    );
  });
  const target = r.root.find(
    (node) =>
      node.props.testID === 'card' &&
      typeof node.props.onAccessibilityAction === 'function',
  );
  expect(
    target.props.accessibilityActions.map((action: any) => action.name),
  ).toEqual(['Copy', 'Sources']);
  act(() =>
    target.props.onAccessibilityAction({
      nativeEvent: { actionName: 'Sources' },
    }),
  );
  act(() =>
    target.props.onAccessibilityAction({ nativeEvent: { actionName: 'Copy' } }),
  );
  expect(source).toHaveBeenCalledTimes(1);
  expect(copy).toHaveBeenCalledTimes(1);
  expect(
    r.root.findAll((node) => node.type === ('MenuButton' as any)),
  ).toHaveLength(1);
  act(() => r.unmount());
});

test.each([Screen, KeyboardStableScreen])(
  '%p resets the shared page state on pull to refresh',
  (Component) => {
    let r!: TestRenderer.ReactTestRenderer;
    const page = (refreshing: boolean) => (
      <Component
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => undefined} />
        }
      >
        <Pressable />
      </Component>
    );
    act(() => {
      r = TestRenderer.create(page(false));
    });
    expect(r.root.findByType(StatePageProvider).props.refreshing).toBe(false);
    act(() => r.update(page(true)));
    expect(r.root.findByType(StatePageProvider).props.refreshing).toBe(true);
    act(() => r.unmount());
  },
);

test.each([
  [{}, false],
  [{ isConnected: false }, true],
  [{ isConnected: true, isInternetReachable: false }, true],
  [{ isConnected: true, isInternetReachable: true }, false],
] as const)(
  'connectivity %p supplies offline %s without an HTTP read',
  (state, expected) => {
    jest.mocked(useNetworkState).mockReturnValue(state);
    let observed: boolean | undefined, r!: TestRenderer.ReactTestRenderer;
    function Probe() {
      observed = useOffline();
      return null;
    }
    act(() => {
      r = TestRenderer.create(<Probe />);
    });
    expect(observed).toBe(expected);
    act(() => r.unmount());
  },
);

test.each([false, true])(
  'a screen changes its own bar ground and title, never its parent pane bar (embedded=%s)',
  (embedded) => {
    const setOptions = jest.fn();
    const screen = (
      <Screen grouped barTitle="A record">
        <Pressable />
      </Screen>
    );
    const pane = {
      entries: [],
      depth: 0,
      push: jest.fn(),
      select: jest.fn(),
      back: () => false,
    };
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <NavigationContext.Provider
          value={
            {
              setOptions,
              isFocused: () => true,
              addListener: () => () => undefined,
            } as never
          }
        >
          {embedded ? (
            <PaneHost pane={pane} bar={null}>
              {screen}
            </PaneHost>
          ) : (
            screen
          )}
        </NavigationContext.Provider>,
      );
    });
    expect(setOptions).toHaveBeenCalledTimes(embedded ? 0 : 2);
    act(() => r.unmount());
  },
);
