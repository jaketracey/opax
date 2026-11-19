import { act, useState, type ReactNode } from 'react';
import { Dimensions, Text, View } from 'react-native';
import TestRenderer, { type ReactTestRendererJSON } from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { isPad, useLayout } from '../src/design/adaptive';
import { BarFade } from '../src/design/bar-fade';
import { Screen } from '../src/design/layout';
import { Heading } from '../src/design/text';
import { titlePinLayout } from '../src/navigation/title-pin';

/**
 * iPad runs the `pad` layout rule, which is fixed when the modules load, so
 * it has its own file (the Duo and iPhone poses: tests/title-pin.test.tsx).
 * iPad has no vertical bar: the title pin adds nothing there, UIKit still
 * follows the page's scroll view, and the page's fade is as it was.
 */

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: {
      value: { ...actual.Platform, OS: 'ios', isPad: true, Version: '27.2' },
    },
  });
});
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => 'unspecified',
}));
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));

const rootRoute = { key: 'today-root', name: 'index' };
const pushedRoute = { key: 'bill-1', name: 'bill/[key]', params: {} };

function Stack({ pushed, children }: { pushed: boolean; children: ReactNode }) {
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
      index: pushed ? 1 : 0,
      routes: pushed ? [rootRoute, pushedRoute] : [rootRoute],
      routeNames: ['index', 'bill/[key]', 'explore/[tool]', 'person/[slug]'],
    }),
    isFocused: () => true,
    addListener: () => () => {},
  }));
  return (
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={route as never}>
        <DescriptorsContext.Provider value={descriptors as never}>
          <SafeAreaInsetsContext.Provider
            value={{ top: 24, right: 0, bottom: 20, left: 0 }}
          >
            <HeaderHeightContext.Provider value={74}>
              {children}
            </HeaderHeightContext.Provider>
          </SafeAreaInsetsContext.Provider>
        </DescriptorsContext.Provider>
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>
  );
}

function Rule() {
  const layout = useLayout();
  return <View testID="rule" {...({ rule: layout.rule } as object)} />;
}

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

test.each([
  ['a tab root', false, 1024, 1366],
  ['a pushed page', true, 1024, 1366],
  ['a tab root', false, 1366, 1024],
  ['a pushed page', true, 1366, 1024],
] as const)(
  'iPad, %s (pushed %s) at %s by %s: no pin, UIKit follows the scroll view, the fade is as it was',
  (_what, pushed, width, height) => {
    expect(isPad).toBe(true);
    act(() => {
      const size = { width, height, scale: 2, fontScale: 1 };
      Dimensions.set({ window: size, screen: size });
    });
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <Stack pushed={pushed}>
          {titlePinLayout({
            options: {},
            children: (
              <Screen testID="page">
                <Heading level={1}>A page</Heading>
                <Rule />
                <View>
                  <Text>Rows</Text>
                </View>
              </Screen>
            ),
          } as never)}
        </Stack>,
      );
    });
    expect(
      tree.root.find(
        (node) => typeof node.type === 'string' && node.props.testID === 'rule',
      ).props.rule,
    ).toBe('pad');
    const json = tree.toJSON();
    const top = Array.isArray(json) ? json : [json!];
    expect(tree.root.findAllByProps({ testID: 'title-pin' })).toHaveLength(0);
    expect(firstDescendantScroll(top[0])).not.toBeNull();
    const fade = tree.root.findAllByType(BarFade);
    expect(fade).toHaveLength(1);
    expect(fade[0]!.props.cover).toBe(0);
    act(() => tree.unmount());
  },
);
