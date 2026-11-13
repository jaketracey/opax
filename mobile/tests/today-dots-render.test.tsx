import type * as SkiaTypes from '@shopify/react-native-skia';
import {
  HeaderHeightContext,
  NavigationContext,
} from 'expo-router/react-navigation';
import React, { act, Profiler, useRef } from 'react';
import { AppState, Dimensions, Platform, StyleSheet } from 'react-native';
import type * as ReanimatedTypes from 'react-native-reanimated';
import TestRenderer from 'react-test-renderer';
import { RegionProvider } from '../src/design/adaptive';
import { rhythm } from '../src/design/tokens';
import { light } from '../src/design/tokens.generated';
import {
  AustraliaDots,
  useTodayDotsScroll,
} from '../src/features/today/AustraliaDots';
import { Masthead } from '../src/features/today/Masthead';
import {
  androidDotScale,
  dotHeight,
  dotWidth,
} from '../src/features/today/australia-dots-model';

const Skia = jest.requireMock('@shopify/react-native-skia') as typeof SkiaTypes;
const Reanimated = jest.requireMock(
  'react-native-reanimated',
) as typeof ReanimatedTypes;

let mockReduced: boolean | null = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => mockReduced,
}));

test('Today holds, crossfades and stops its actual frame callback at each visibility boundary', () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');
  const appState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
  Dimensions.set({
    window: { width: 402, height: 874, scale: 3, fontScale: 1 },
    screen: { width: 402, height: 874, scale: 3, fontScale: 1 },
  });
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'active',
  });
  let appChanged: (status: string) => void = () => {};
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      appChanged = listener as typeof appChanged;
      return { remove: jest.fn() };
    });
  const nativeShared = Reanimated.useSharedValue;
  const shared = jest
    .spyOn(Reanimated, 'useSharedValue')
    .mockImplementation(function useStableShared<T>(value: T) {
      return useRef(nativeShared(value)).current;
    });
  const derived = jest.spyOn(Reanimated, 'useDerivedValue').mockImplementation(
    (compute) =>
      ({
        get value() {
          return compute();
        },
        get: compute,
      }) as never,
  );
  const group = jest
    .spyOn(Skia, 'Group')
    .mockImplementation(({ children }) => <>{children}</>);
  const animatedStyle = jest
    .spyOn(Reanimated, 'useAnimatedStyle')
    .mockImplementation(
      (compute) =>
        ({
          get top() {
            return compute().top;
          },
          get transform() {
            return compute().transform;
          },
        }) as never,
    );
  const path = jest.spyOn(Skia.Skia.Path, 'MakeFromSVGString').mockReturnValue({
    contains: (x: number, y: number) => x < 20 && y < 20,
  } as never);
  let tick: (info: {
    timeSincePreviousFrame: number | null;
  }) => void = () => {};
  const clock = { setActive: jest.fn(), isActive: false, callbackId: 1 };
  const frame = jest
    .spyOn(Reanimated, 'useFrameCallback')
    .mockImplementation((callback) => {
      tick = callback as typeof tick;
      return clock;
    });
  let prepare: () => boolean = () => false;
  let react: (value: boolean, previous: boolean | null) => void = () => {};
  const reaction = jest
    .spyOn(Reanimated, 'useAnimatedReaction')
    .mockImplementation((next, callback) => {
      prepare = next as typeof prepare;
      react = callback as typeof react;
    });
  let previous: boolean | null = null;
  const drive = () => {
    const next = prepare();
    react(next, previous);
    previous = next;
    return next;
  };
  const listeners = new Map<string, () => void>();
  const navigation = {
    isFocused: () => true,
    addListener: (name: string, listener: () => void) => {
      listeners.set(name, listener);
      return () => listeners.delete(name);
    },
  };
  const scroll = nativeShared(0);
  const header = nativeShared(160);
  const painted = jest.fn();
  const page = (state: 'nsw' | 'vic' | null) => (
    <NavigationContext.Provider value={navigation as never}>
      <RegionProvider value={{ width: 370, height: 874 }}>
        <Profiler id="dots" onRender={painted}>
          <Masthead
            now={new Date('2026-11-09T00:00:00Z')}
            mark={
              <AustraliaDots
                state={state}
                scroll={scroll}
                expandedHeader={header}
              />
            }
          />
        </Profiler>
      </RegionProvider>
    </NavigationContext.Provider>
  );
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  try {
    act(() => {
      renderer = TestRenderer.create(page('nsw'));
    });
    const root = () => renderer!.root;
    const art = () =>
      root().findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.testID === 'today-australia-dots',
      )[0]!;
    const paint = () => root().findAllByType(Skia.Points);
    expect(art().props).toMatchObject({
      pointerEvents: 'none',
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(StyleSheet.flatten(art().props.style)).toMatchObject({
      position: 'absolute',
      width: 192,
      left: -8 - 16,
      top: 30 - 160 - rhythm.block,
    });
    expect(paint()[0]!.props.opacity.value).toBe(0);
    expect(paint()[1]!.props.opacity.value).toBe(0.76);
    expect(paint()[0]!.props.color).toBe(light.navy);
    expect(paint()[1]!.props.color).toBe(light.todayDotBronze);
    expect(drive()).toBe(false); // Saved NSW is held from its first frame.
    const sampledOnce = path.mock.calls.length;
    act(() => renderer!.update(page('vic')));
    expect(path).toHaveBeenCalledTimes(sampledOnce);
    expect(drive()).toBe(true);
    const renders = painted.mock.calls.length;
    tick({ timeSincePreviousFrame: null });
    tick({ timeSincePreviousFrame: 450 });
    expect(paint()[1]!.props.opacity.value).toBeCloseTo(0.38);
    expect(painted).toHaveBeenCalledTimes(renders); // No React render per frame.
    tick({ timeSincePreviousFrame: 451 });
    expect(drive()).toBe(false);
    expect(clock.setActive).toHaveBeenLastCalledWith(false);
    expect(paint()[0]!.props.opacity.value).toBe(0.23);
    expect(paint()[1]!.props.opacity.value).toBe(0);

    act(() => renderer!.update(page(null)));
    expect(drive()).toBe(true);
    scroll.value = 90;
    expect(drive()).toBe(false);
    const fadedPosition = StyleSheet.flatten(art().props.style).transform;
    scroll.value = 10000;
    expect(StyleSheet.flatten(art().props.style).transform).toEqual(
      fadedPosition,
    );
    expect(drive()).toBe(false);
    scroll.value = 40;
    expect(drive()).toBe(true);
    expect(StyleSheet.flatten(art().props.style).transform).toEqual([
      { translateY: 22 },
    ]);
    listeners.get('blur')!();
    expect(drive()).toBe(false);
    listeners.get('focus')!();
    expect(drive()).toBe(true);
    appChanged('background');
    expect(drive()).toBe(false);
    appChanged('active');
    expect(drive()).toBe(true);

    scroll.value = 90;
    act(() => renderer!.update(page('nsw')));
    expect(drive()).toBe(false);
    const pausedLight = paint()[1]!.props.opacity.value;
    tick({ timeSincePreviousFrame: 1000 });
    expect(paint()[1]!.props.opacity.value).toBe(pausedLight);
    scroll.value = 40;
    expect(drive()).toBe(true);
    tick({ timeSincePreviousFrame: 300 });
    expect(paint()[1]!.props.opacity.value).toBeGreaterThan(0);
    expect(paint()[1]!.props.opacity.value).toBeLessThan(0.76);
    mockReduced = true;
    act(() => renderer!.update(page('nsw')));
    expect(drive()).toBe(false);
    expect(paint()[1]!.props.opacity.value).toBe(0.76);
    mockReduced = false;
    act(() => renderer!.update(page('nsw')));
    expect(drive()).toBe(false);
    expect(paint()[1]!.props.opacity.value).toBe(0.76);

    mockReduced = true;
    act(() => renderer!.update(page(null)));
    expect(drive()).toBe(false);
    expect(StyleSheet.flatten(art().props.style).transform).toEqual([
      { translateY: 0 },
    ]);
    for (const row of root().findAllByType(Skia.Group))
      expect(row.props.opacity.value).toBeCloseTo(1 - 40 / 90);
    act(() => {
      Dimensions.set({
        window: { ...Dimensions.get('window'), fontScale: 3.571 },
        screen: { ...Dimensions.get('screen'), fontScale: 3.571 },
      });
    });
    expect(
      root().findAllByProps({ testID: 'today-australia-dots' }),
    ).toHaveLength(0);
    expect(
      root().findAllByProps({ testID: 'today-screen-message' }).length,
    ).toBeGreaterThan(0);
    expect(clock.setActive).toHaveBeenLastCalledWith(false);
  } finally {
    if (renderer) act(() => renderer!.unmount());
    subscription.mockRestore();
    shared.mockRestore();
    derived.mockRestore();
    group.mockRestore();
    animatedStyle.mockRestore();
    path.mockRestore();
    frame.mockRestore();
    reaction.mockRestore();
    Object.defineProperty(AppState, 'currentState', appState);
    Dimensions.set({ window: originalWindow, screen: originalScreen });
    mockReduced = false;
  }
});

test('the UI scroll observer retains the expanded inset through native title collapse', () => {
  let dots: ReturnType<typeof useTodayDotsScroll>;
  let offset: ReanimatedTypes.SharedValue<number>;
  const observe = jest
    .spyOn(Reanimated, 'useScrollOffset')
    .mockImplementation((_ref, provided) => {
      offset = provided!;
      return provided!;
    });
  const nativeShared = Reanimated.useSharedValue;
  const shared = jest
    .spyOn(Reanimated, 'useSharedValue')
    .mockImplementation(function useStableShared<T>(value: T) {
      return useRef(nativeShared(value)).current;
    });
  const derived = jest.spyOn(Reanimated, 'useDerivedValue').mockImplementation(
    (compute) =>
      ({
        get value() {
          return compute();
        },
      }) as never,
  );
  function Probe() {
    dots = useTodayDotsScroll();
    return null;
  }
  const page = (height: number) => (
    <HeaderHeightContext.Provider value={height}>
      <Probe />
    </HeaderHeightContext.Provider>
  );
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  try {
    act(() => {
      renderer = TestRenderer.create(page(68));
    });
    expect(dots!.scroll.value).toBe(0);
    act(() => renderer!.update(page(160)));
    offset!.value = -160;
    expect(dots!.scroll.value).toBe(0);
    offset!.value = -120;
    act(() => renderer!.update(page(68)));
    expect(dots!.expandedHeader.value).toBe(160);
    expect(dots!.scroll.value).toBe(40);
    expect(observe).toHaveBeenLastCalledWith(dots!.scrollRef, offset!);
  } finally {
    if (renderer) act(() => renderer!.unmount());
    observe.mockRestore();
    shared.mockRestore();
    derived.mockRestore();
  }
});

test('Android reserves a separate art column beside the date, without a native header offset', () => {
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  const platform = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  const animatedStyle = jest
    .spyOn(Reanimated, 'useAnimatedStyle')
    .mockImplementation((compute) => compute());
  const window = { width: 402, height: 874, scale: 3, fontScale: 1 };
  Dimensions.set({ window, screen: window });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  function Page() {
    const scroll = Reanimated.useSharedValue(0);
    const header = Reanimated.useSharedValue(100);
    return (
      <RegionProvider value={{ width: 370, height: 874 }}>
        <Masthead
          now={new Date('2026-11-10T00:00:00Z')}
          mark={
            <AustraliaDots
              state={null}
              scroll={scroll}
              expandedHeader={header}
            />
          }
        />
      </RegionProvider>
    );
  }
  try {
    act(() => {
      renderer = TestRenderer.create(<Page />);
    });
    const host = (id: string) =>
      renderer!.root.find(
        (n) => typeof n.type === 'string' && n.props.testID === id,
      );
    expect(
      StyleSheet.flatten(host('today-masthead-date').props.style),
    ).toMatchObject({
      paddingRight: dotWidth * androidDotScale + rhythm.tight,
      minHeight: dotHeight * androidDotScale,
    });
    expect(
      StyleSheet.flatten(host('today-australia-dots').props.style),
    ).toMatchObject({
      left: 370 - dotWidth,
      top: 0,
      transformOrigin: 'top right',
      transform: [{ translateY: 0 }, { scale: androidDotScale }],
    });
    act(() => {
      Dimensions.set({
        window: { ...window, fontScale: 2 },
        screen: { ...window, fontScale: 2 },
      });
    });
    expect(
      renderer!.root.findAllByProps({ testID: 'today-masthead-date' }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ testID: 'today-australia-dots' }),
    ).toHaveLength(0);
    expect(host('today-screen-message')).toBeDefined();
  } finally {
    if (renderer) act(() => renderer!.unmount());
    animatedStyle.mockRestore();
    subscription.mockRestore();
    Dimensions.set({ window: originalWindow, screen: originalScreen });
    Object.defineProperty(Platform, 'OS', platform);
  }
});

test('iOS starts the date line 8 pt below the art, so Tasmania never touches it (sweep 2, 11)', () => {
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  const platform = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const animatedStyle = jest
    .spyOn(Reanimated, 'useAnimatedStyle')
    .mockImplementation((compute) => compute());
  const window = { width: 402, height: 874, scale: 3, fontScale: 1 };
  Dimensions.set({ window, screen: window });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  function Page({ expanded }: { expanded: number }) {
    const scroll = Reanimated.useSharedValue(0);
    const header = Reanimated.useSharedValue(expanded);
    return (
      <RegionProvider value={{ width: 370, height: 874 }}>
        <Masthead
          now={new Date('2026-11-13T00:00:00Z')}
          mark={
            <AustraliaDots
              state={null}
              scroll={scroll}
              expandedHeader={header}
            />
          }
        />
      </RegionProvider>
    );
  }
  try {
    for (const expanded of [116, 160, 172]) {
      act(() => {
        renderer?.unmount();
        renderer = TestRenderer.create(<Page expanded={expanded} />);
      });
      const host = (id: string) =>
        renderer!.root.find(
          (n) => typeof n.type === 'string' && n.props.testID === id,
        );
      const masthead = host('today-masthead');
      // The box is in the masthead's flow, ahead of the date (pre-order).
      const order = masthead
        .findAll(
          (n) =>
            typeof n.type === 'string' &&
            ['today-australia-dots-clearance', 'today-screen-message'].includes(
              n.props.testID,
            ),
        )
        .map((n) => n.props.testID);
      expect(order).toEqual([
        'today-australia-dots-clearance',
        'today-screen-message',
      ]);
      const box = StyleSheet.flatten(
        host('today-australia-dots-clearance').props.style,
      );
      const gap = StyleSheet.flatten(masthead.props.style).gap as number;
      // The date's top, measured from the masthead's top.
      const dateTop = box.height + box.marginBottom + gap;
      const art = StyleSheet.flatten(host('today-australia-dots').props.style);
      // The art keeps its place: the box starts where the masthead does.
      expect(art).toMatchObject({
        position: 'absolute',
        top: 30 - expanded - rhythm.block,
        left: -8 - 16,
      });
      // Tasmania is the art's lowest edge.
      expect(dateTop - (art.top + dotHeight)).toBeGreaterThanOrEqual(8);
      expect(dateTop - (art.top + dotHeight)).toBeCloseTo(8, 6);
    }
    // When the art ends well above the masthead, the date does not move.
    act(() => {
      renderer?.unmount();
      renderer = TestRenderer.create(<Page expanded={400} />);
    });
    const box = StyleSheet.flatten(
      renderer!.root.find(
        (n) =>
          typeof n.type === 'string' &&
          n.props.testID === 'today-australia-dots-clearance',
      ).props.style,
    );
    expect(box.height).toBe(0);
    expect(box.marginBottom).toBe(-rhythm.tight);
    // At accessibility sizes the art is hidden and the date is first.
    act(() => {
      Dimensions.set({
        window: { ...window, fontScale: 2 },
        screen: { ...window, fontScale: 2 },
      });
    });
    expect(
      renderer!.root.findAllByProps({
        testID: 'today-australia-dots-clearance',
      }),
    ).toHaveLength(0);
  } finally {
    if (renderer) act(() => renderer!.unmount());
    animatedStyle.mockRestore();
    subscription.mockRestore();
    Dimensions.set({ window: originalWindow, screen: originalScreen });
    Object.defineProperty(Platform, 'OS', platform);
  }
});
