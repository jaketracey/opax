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
  pageItems,
  pendingHeaderItems,
  RAIL_STAND_IN_BUTTONS,
} from '../src/navigation/chrome';
import { moneyBar } from '../src/features/money-public/parts';

import { RouteOptions } from '../src/navigation/preview';

// The stand-in buttons are switched off (chrome.ts): they made a remembered
// profile drop 38 pt on the simulator. These tests describe them and run
// again when the switch is on; the last test pins what ships now.
const whenOn = RAIL_STAND_IN_BUTTONS ? describe : describe.skip;

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

whenOn('with the stand-in buttons on', () => {
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
});

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
whenOn('a page that will have no items of its own', () => {
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

  test('a money page still loading keeps the stand-ins', () => {
    // Agency and Grant program pass no path until their data arrives; an
    // empty menu must not read as "no items", or the page jumps again.
    at('trailing', 27);
    const loading = moneyBar({ name: 'Agency', path: null });
    expect(loading.unstable_headerRightItems).toBeUndefined();
    expect(items(<RouteOptions stableItems options={loading} />)).toEqual([
      'Share',
      'More',
    ]);
  });

  test('a failed load that recovers gets its real items', () => {
    at('trailing', 27);
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
    const page = (content: ReactElement) => (
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route as never}>
          {content}
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );
    const now = () =>
      (
        Object.assign({}, ...calls) as {
          unstable_headerRightItems?: (props: object) => { type: string }[];
        }
      )
        .unstable_headerRightItems?.({})
        .map((item) =>
          'label' in item ? (item as { label: string }).label : item.type,
        );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(page(failed));
    });
    expect(now()).toEqual([]);
    // Try again succeeds: the page installs its own Share and More.
    const real = headerItems(
      pageItems({ name: 'Fixture Member', share: () => undefined, menu: [] }),
    );
    act(() =>
      renderer.update(page(<RouteOptions stableItems options={real} />)),
    );
    expect(now()).toEqual(['Share', 'More']);
    expect(
      (
        Object.assign({}, ...calls) as {
          unstable_headerRightItems: (
            props: object,
          ) => { disabled?: boolean }[];
        }
      )
        .unstable_headerRightItems({})
        .some((item) => item.disabled),
    ).toBe(false);
    act(() => renderer.unmount());
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

test('the stand-in buttons are off: the rail keeps its spacing item', () => {
  expect(RAIL_STAND_IN_BUTTONS).toBe(false);
  at('trailing', 27);
  expect(labels('person/[slug]')).toEqual(['spacing 104']);
  expect(labels('directory')).toEqual(['spacing 104']);
  expect(labels('grant-program')).toEqual(['spacing 44']);
});
