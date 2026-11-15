import { act } from 'react';
import { Platform, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import * as accessibility from '../src/design/accessibility';
import { Screen } from '../src/design/layout';

jest.mock('../modules/opax-root-bar', () => ({
  RootBar: null,
  useVerticalBarEdge: () => 'unspecified',
}));

// Build 82: a pushed page had the stack's solid paper bar, and its rows were
// cut sharp at the bar's hairline. On iOS 26 it has Today's treatment: a
// clear bar with no colour and no hairline, and the page fades into its own
// ground under it. A legibility setting keeps the solid bar.
const root = { key: 'today-root', name: 'index' };
const pushed = { key: 'person-1', name: 'person/[slug]' };
const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;

function page({
  route = pushed,
  headerTransparent = true,
  presentation,
}: {
  route?: typeof pushed;
  headerTransparent?: boolean;
  presentation?: string;
} = {}) {
  const navigation = {
    setOptions: jest.fn(),
    getState: () => ({
      index: 1,
      routes: [root, pushed],
      routeNames: ['index', 'bill/[key]', 'explore/[tool]'],
    }),
    isFocused: () => true,
    addListener: () => () => {},
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route as never}>
          <DescriptorsContext.Provider
            value={
              {
                [route.key]: { options: { headerTransparent, presentation } },
              } as never
            }
          >
            <HeaderHeightContext.Provider value={114}>
              <Screen testID="page" ground="sunken">
                <View />
              </Screen>
            </HeaderHeightContext.Provider>
          </DescriptorsContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  const fades = () =>
    renderer.root.findAll(
      (n) => n.props.testID === 'bar-fade' && typeof n.type === 'string',
    ).length;
  const bar = () =>
    Object.assign(
      {},
      ...navigation.setOptions.mock.calls.map(([options]) => options),
    ) as {
      headerStyle?: object;
      headerShadowVisible?: boolean;
    };
  return { renderer, fades, bar };
}

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
});
afterEach(() => {
  Object.defineProperty(Platform, 'Version', version);
  jest.restoreAllMocks();
});

test('a pushed Screen page under the clear bar draws the fade, with no bar colour and no hairline', () => {
  const { renderer, fades, bar } = page();
  expect(fades()).toBe(1);
  expect(bar().headerStyle).toEqual({});
  expect(bar().headerShadowVisible).toBe(false);
  act(() => renderer.unmount());
});

test('with Reduce Transparency or Increase Contrast on it draws no fade and keeps the solid bar and its hairline', () => {
  jest.spyOn(accessibility, 'useSolidBar').mockReturnValue(true);
  // The stack gives the opaque bar then; a route that asks for a clear one
  // itself (the electorate page) still has no fade.
  for (const headerTransparent of [false, true]) {
    const { renderer, fades, bar } = page({ headerTransparent });
    expect(fades()).toBe(0);
    expect(bar().headerStyle).toHaveProperty('backgroundColor');
    expect(bar().headerShadowVisible).toBe(true);
    act(() => renderer.unmount());
  }
});

test.each([
  [
    'below a solid bar of its own (a search field)',
    { headerTransparent: false },
  ],
  ['presented as a sheet', { presentation: 'formSheet' }],
  ['before iOS 26', { old: true }],
] as const)('a page %s has no fade and keeps its bar', (_case, options) => {
  if ('old' in options)
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 18,
    });
  const { renderer, fades, bar } = page(options as never);
  expect(fades()).toBe(0);
  expect(bar().headerShadowVisible).toBe(true);
  act(() => renderer.unmount());
});
