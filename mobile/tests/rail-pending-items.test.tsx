// The bar items a page stands in before its own arrive. Beside a vertical
// bar (the closed iPhone Duo) the items sit on the rail, where a spacing
// item takes no room and is no bar content: every pushed page was first
// laid out with no title band, 58 pt higher, and dropped when the real
// Share and More arrived (b74). The stand-ins there are the buttons.
import { act, type ReactElement } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { ContentUnavailable } from '../src/design/states';
import {
  headerItems,
  noHeaderItems,
  pendingHeaderItems,
} from '../src/navigation/chrome';
import { RouteOptions } from '../src/navigation/preview';

let mockBarEdge: 'unspecified' | 'leading' | 'trailing' = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: { getVerticalBarEdge: () => mockBarEdge },
  useVerticalBarEdge: () => mockBarEdge,
}));

const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
function at(edge: typeof mockBarEdge, ios: number) {
  mockBarEdge = edge;
  jest.replaceProperty(Platform, 'OS', 'ios');
  Object.defineProperty(Platform, 'Version', {
    configurable: true,
    value: ios,
  });
}
afterEach(() => {
  mockBarEdge = 'unspecified';
  if (version) Object.defineProperty(Platform, 'Version', version);
});

const labels = (name: string, params?: object) =>
  pendingHeaderItems(name, params)?.map((item) =>
    item.type === 'spacing'
      ? `spacing ${item.spacing}`
      : `${'label' in item ? item.label : item.type}${
          'disabled' in item && item.disabled ? ' (disabled)' : ''
        }`,
  );

test.each(['leading', 'trailing'] as const)(
  'beside a %s rail the stand-ins are the disabled buttons themselves',
  (edge) => {
    at(edge, 27);
    expect(labels('person/[slug]')).toEqual([
      'Share (disabled)',
      'More (disabled)',
    ]);
    expect(labels('bill/[key]')).toEqual([
      'Share (disabled)',
      'More (disabled)',
    ]);
    expect(labels('directory')).toEqual([
      'Filters (disabled)',
      'More (disabled)',
    ]);
    expect(labels('grant-program')).toEqual(['More (disabled)']);
    // The real More item is matched across the swap by its identifier.
    expect(pendingHeaderItems('person/[slug]')!.at(-1)).toMatchObject({
      identifier: 'header-more',
    });
    // No items of its own, and a sheet: nothing, as before.
    expect(labels('topics')).toBeUndefined();
    expect(labels('money-item', { sheet: '1' })).toBeUndefined();
  },
);

test.each([
  // iPhone, iPad and the unfolded Duo.
  ['unspecified', 27],
  // Before iOS 26 there is no rail.
  ['trailing', 18],
] as const)(
  'beside a %s bar on iOS %s the stand-in is the spacing it always was',
  (edge, ios) => {
    at(edge, ios);
    expect(labels('person/[slug]')).toEqual(['spacing 104']);
    expect(labels('directory')).toEqual(['spacing 104']);
    expect(labels('grant-program')).toEqual(['spacing 44']);
  },
);

// The stand-ins stay until a page installs items of its own. A page that
// never will (not found, a failed load, offline, or loaded with nothing to
// share) must not keep dimmed Share and More on the rail: VoiceOver read
// "Share, dimmed" on a page with nothing to share.
describe('a page that will have no items of its own', () => {
  const route = { key: 'person-1', name: 'person/[slug]' };
  function items(content: ReactElement) {
    const calls: Record<string, unknown>[] = [];
    const navigation = {
      addListener: () => () => undefined,
      setOptions: (value: Record<string, unknown>) => calls.push(value),
      getState: () => ({
        index: 1,
        routes: [{ key: 'root' }, { key: route.key }],
        routeNames: ['index', 'bill/[key]', 'explore/[tool]'],
      }),
      isFocused: () => true,
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationContext.Provider value={navigation as never}>
          <NavigationRouteContext.Provider value={route as never}>
            {content}
          </NavigationRouteContext.Provider>
        </NavigationContext.Provider>,
      );
    });
    const set = Object.assign({}, ...calls) as {
      unstable_headerRightItems?: (props: object) => { type: string }[];
    };
    act(() => renderer.unmount());
    return set
      .unstable_headerRightItems?.({})
      .map((item) =>
        'label' in item ? (item as { label: string }).label : item.type,
      );
  }
  // As a page does while it loads, fails or finds nothing: no items.
  const bar = <RouteOptions stableItems options={headerItems(undefined)} />;
  const failed = (
    <>
      {bar}
      <ContentUnavailable
        symbol="exclamationmark.triangle"
        title="Couldn’t load this profile"
        body="Check your connection and try again."
      />
    </>
  );

  test('beside the rail, loading shows the stand-ins and a failed load clears them', () => {
    at('trailing', 27);
    expect(items(bar)).toEqual(['Share', 'More']);
    expect(items(failed)).toEqual([]);
  });

  test('a message inside a loaded page clears nothing', () => {
    at('trailing', 27);
    expect(
      items(
        <>
          {bar}
          <ContentUnavailable
            inline
            symbol="magnifyingglass"
            title="No results"
          />
        </>,
      ),
    ).toEqual(['Share', 'More']);
  });

  test('on an iPhone the invisible spacing stays, failed or not', () => {
    at('unspecified', 27);
    expect(items(bar)).toEqual(['spacing']);
    expect(items(failed)).toEqual(['spacing']);
  });

  test('a loaded page with nothing to share clears them on the rail only', () => {
    at('trailing', 27);
    expect(
      noHeaderItems().unstable_headerRightItems?.({ canGoBack: true }),
    ).toEqual([]);
    at('unspecified', 27);
    expect(noHeaderItems()).toEqual({});
  });
});
