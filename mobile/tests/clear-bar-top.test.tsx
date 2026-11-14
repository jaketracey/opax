import { act } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  HeaderHeightContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { FixedPage } from '../src/design/layout';

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
