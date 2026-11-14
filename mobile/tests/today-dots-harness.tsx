import type * as SkiaTypes from '@shopify/react-native-skia';
import {
  HeaderHeightContext,
  NavigationContext,
} from 'expo-router/react-navigation';
import { act, useRef } from 'react';
import { AppState, Dimensions, StyleSheet } from 'react-native';
import type * as ReanimatedTypes from 'react-native-reanimated';
import TestRenderer from 'react-test-renderer';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
} from '../src/design/adaptive';
import { Screen } from '../src/design/layout';
import { rhythm } from '../src/design/tokens';
import {
  AustraliaDots,
  resetDotArrivalForTests,
  useTodayDotsScroll,
} from '../src/features/today/AustraliaDots';
import { Masthead } from '../src/features/today/Masthead';

/**
 * Shared by the Today map rotation suites (lane ad-home-map-rotation): one
 * Today (Screen, Masthead, the art) stays mounted while the window, the
 * large-title bar's reported height and the scroll view's resting offset
 * change under it, as UIKit changes them. The suite file mocks
 * react-native's Platform, expo-router and the Duo module; call
 * `installDotHarness()` at its top level.
 */
const Skia = jest.requireMock('@shopify/react-native-skia') as typeof SkiaTypes;
const Reanimated = jest.requireMock(
  'react-native-reanimated',
) as typeof ReanimatedTypes;

export const portrait = { width: 402, height: 874 };
export const landscape = { width: 874, height: 402 };

let offset: ReanimatedTypes.SharedValue<number>;
let clock: () => boolean = () => false;
const spies: jest.SpyInstance[] = [];
const appState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');
let now = 1_000_000;
/** Moves the clock the rest inset's relearn window reads. */
export function advance(ms: number) {
  now += ms;
}
/** The scroll view's offset, as UIKit reports it. */
export function scrollTo(y: number) {
  offset.value = y;
}

export function installDotHarness() {
  beforeEach(() => {
    now = 1_000_000;
    spies.push(jest.spyOn(Date, 'now').mockImplementation(() => now));
    resetDotArrivalForTests();
    clock = () => false;
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    spies.push(
      jest
        .spyOn(AppState, 'addEventListener')
        .mockReturnValue({ remove: jest.fn() }),
    );
    const nativeShared = Reanimated.useSharedValue;
    spies.push(
      jest
        .spyOn(Reanimated, 'useSharedValue')
        .mockImplementation(function useStableShared<T>(value: T) {
          return useRef(nativeShared(value)).current;
        }),
      jest.spyOn(Reanimated, 'useDerivedValue').mockImplementation(
        (compute) =>
          ({
            get value() {
              return compute();
            },
            get: compute,
          }) as never,
      ),
      // Live getters for every key, as the UI thread would read them.
      jest
        .spyOn(Reanimated, 'useAnimatedStyle')
        .mockImplementation((compute) => {
          const style = {};
          for (const key of Object.keys(compute()))
            Object.defineProperty(style, key, {
              enumerable: true,
              get: () => (compute() as Record<string, unknown>)[key],
            });
          return style as never;
        }),
      jest
        .spyOn(Reanimated, 'useScrollOffset')
        .mockImplementation((_ref, provided) => {
          offset = provided!;
          return provided!;
        }),
      jest
        .spyOn(Reanimated, 'useAnimatedReaction')
        .mockImplementation((prepare) => {
          clock = prepare as () => boolean;
        }),
      jest
        .spyOn(Skia, 'Group')
        .mockImplementation(({ children }) => <>{children}</>),
      jest.spyOn(Skia.Skia.Path, 'MakeFromSVGString').mockReturnValue({
        contains: () => true,
      } as never),
    );
    act(() => {
      setWindowTraitsOverride(null);
      resetAdaptiveDeviceForTests();
    });
  });
  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore());
    Object.defineProperty(AppState, 'currentState', appState);
    act(() => {
      Dimensions.set({ window: originalWindow, screen: originalScreen });
      setWindowTraitsOverride(null);
      resetAdaptiveDeviceForTests();
    });
  });
}

export function windowOf(
  size: { width: number; height: number },
  fontScale = 1,
) {
  const value = { ...size, scale: 3, fontScale };
  Dimensions.set({ window: value, screen: value });
}

const navigation = {
  isFocused: () => true,
  addListener: () => () => undefined,
  setOptions: () => undefined,
  getState: () => undefined,
};

function Today() {
  const dots = useTodayDotsScroll();
  return (
    <Screen
      testID="today-screen"
      column="wide"
      grouped
      scrollRef={dots.scrollRef}
    >
      <Masthead
        now={new Date('2026-11-14T00:00:00Z')}
        mark={
          <AustraliaDots
            state={null}
            scroll={dots.scroll}
            expandedHeader={dots.expandedHeader}
          />
        }
      />
    </Screen>
  );
}
function page(header: number) {
  return (
    <NavigationContext.Provider value={navigation as never}>
      <HeaderHeightContext.Provider value={header}>
        <Today />
      </HeaderHeightContext.Provider>
    </NavigationContext.Provider>
  );
}

/** One Today, posed the way UIKit poses it. */
export function mount(size: { width: number; height: number }, header: number) {
  act(() => windowOf(size));
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(page(header));
  });
  const host = (id: string) =>
    tree.root.find((n) => typeof n.type === 'string' && n.props.testID === id);
  const view = {
    tree,
    /** The scroll view's frame: the window less any side rail. */
    layOut(width: number, height: number) {
      const scroll = tree.root.find(
        (n) =>
          typeof n.type !== 'string' &&
          n.props.testID === 'today-screen' &&
          typeof n.props.onLayout === 'function',
      );
      act(() =>
        scroll.props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width, height } },
        }),
      );
    },
    /** The bar reports its height (NativeStack's debounced header). */
    header(height: number) {
      act(() => tree.update(page(height)));
    },
    turn(size: { width: number; height: number }, fontScale = 1) {
      act(() => windowOf(size, fontScale));
    },
    /** UIKit's resting offset: minus the bar over the scroll view. */
    rest(bar: number) {
      offset.value = -bar;
    },
    drawn: () =>
      tree.root.findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.testID === 'today-australia-dots',
      ).length > 0,
    art: () => StyleSheet.flatten(host('today-australia-dots').props.style),
    clearance: () =>
      StyleSheet.flatten(host('today-australia-dots-clearance').props.style)
        .height as number,
    /** The column's leading padding in the scroll view. */
    gutter: () =>
      StyleSheet.flatten(
        tree.root.find(
          (n) =>
            typeof n.type !== 'string' &&
            n.props.testID === 'today-screen' &&
            n.props.contentContainerStyle !== undefined,
        ).props.contentContainerStyle,
      ).paddingHorizontal as number,
    /** Each dot row's opacity, top to bottom. */
    rows: () =>
      tree.root
        .findAllByType(Skia.Group)
        .map((g) => (g.props.opacity as { value: number }).value),
    /** Whether the frame clock (the walk) runs now. */
    clockActive: () => clock(),
  };
  return view;
}

export type View = ReturnType<typeof mount>;
/** The art at rest under a bar of `bar` points: drawn, whole and placed. */
export function expectAtRest(view: View, bar: number) {
  expect(view.drawn()).toBe(true);
  // Every row fully drawn: no fade, no drift.
  expect(Math.min(...view.rows())).toBe(1);
  const art = view.art();
  expect(art.opacity).toBe(1);
  expect(art.transform).toEqual([{ translateY: 0 }]);
  // 30 pt below the window's top: the masthead starts under the bar.
  expect(art.top).toBe(30 - bar - rhythm.block);
  // The date stays 8 pt clear of Tasmania.
  expect(view.clearance()).toBeCloseTo(
    art.top + StyleSheet.flatten(view.art()).height + 8,
    6,
  );
}
