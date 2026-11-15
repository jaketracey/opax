import { use, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  useAnimatedValue,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { AnimatedHeaderHeightContext } from 'expo-router/build/react-navigation/native-stack/utils/useAnimatedHeaderHeight';
import { useSolidBar } from './accessibility';
import type { GroundFadeGround } from './ground-fade';

// React Native exports this without a type: it binds a native view's event
// to an Animated value with the native driver.
const attachNativeEvent = (
  view: unknown,
  event: string,
  mapping: readonly unknown[],
): { detach(): void } =>
  (
    Animated as unknown as {
      attachNativeEvent(
        view: unknown,
        event: string,
        mapping: readonly unknown[],
      ): { detach(): void };
    }
  ).attachNativeEvent(view, event, mapping);

/** How far below the bar's foot the fade runs out (pt). */
export const BAR_FADE_TAIL = 16;
/** The fade starts this far above the bar's foot (pt): the title sits above. */
const BAR_FADE_LEAD = 12;
/** Content travels this far under the bar's foot before the fade is whole. */
export const BAR_FADE_RAMP = 24;
/** Taller than any bar, so one layer serves the large title and the inline. */
const BAR_FADE_HEIGHT = 480;
/** Before the first scroll event: far above rest, so nothing shows. */
const UNKNOWN_OFFSET = -100000;

/**
 * The scroll position a bar fade follows, kept by UIKit's scroll events on
 * the UI thread: no state, no render and no commit while the page scrolls.
 * The owner passes `onScroll` its scroll events; the first one says which
 * native view is scrolling, and the events are bound to `y` there.
 */
export function useBarFadeScroll(enabled: boolean) {
  const y = useAnimatedValue(UNKNOWN_OFFSET);
  const bound = useRef<{ detach(): void } | null>(null);
  useEffect(() => {
    if (enabled) return;
    // A fade that comes back (a legibility setting turned off, a pane
    // closed) starts unseen until the page next reports where it is.
    bound.current?.detach();
    bound.current = null;
    y.setValue(UNKNOWN_OFFSET);
  }, [enabled, y]);
  useEffect(
    () => () => {
      bound.current?.detach();
      bound.current = null;
    },
    [],
  );
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!enabled || bound.current) return;
      const view: unknown = event.currentTarget ?? event.target;
      if (view == null) return;
      y.setValue(event.nativeEvent.contentOffset.y);
      bound.current = attachNativeEvent(view, 'onScroll', [
        { nativeEvent: { contentOffset: { y } } },
      ]);
    },
    [enabled, y],
  );
  return { y, onScroll };
}

/**
 * A page under a clear bar fades into its own ground behind the bar: opaque
 * behind the status strip and the title, clear just below the bar's foot.
 * No edge and no hairline, and at rest nothing shows. UIKit's soft scroll
 * edge alone left the inline title printed over barely softened text (Bills,
 * iOS 27), and at accessibility sizes over large blurred words (iOS 26.3).
 *
 * It is always mounted under a clear root bar and never re-rendered by
 * scrolling. Its foot follows the bar's own height as UIKit reports it (the
 * stack's animated header height), so it tracks a large title's collapse
 * frame for frame; while the title collapses the page moves with the bar and
 * nothing is under it, so the fade stays clear. It comes up over the next
 * `ramp` points of scroll, as content goes under the bar's foot. `bottom` is
 * the bar's foot as last measured, for a page outside a native stack.
 */
export function BarFade({
  y,
  bottom,
  ground = 'paper',
  tail = BAR_FADE_TAIL,
  ramp = BAR_FADE_RAMP,
  hidden = 0,
  cover = 0,
}: {
  y: Animated.Value;
  bottom: number;
  ground?: GroundFadeGround;
  /** 0 where a pinned band holds at the bar's foot: it is its own ground. */
  tail?: number;
  ramp?: number;
  /**
   * How much of the bar UIKit reports is not on screen (pt). An open Ask
   * thread shows the inline bar while UIKit keeps the large-title band in
   * the bar's height: the fade must end at the bar the reader sees.
   */
  hidden?: number;
  /**
   * How far below the measured foot the ground stays whole (pt), for a page
   * whose native top edge is hidden (`useRootBarOwnFade`): the bar's glass
   * buttons reach below the height the stack reports, and with no native
   * edge the text passing behind their lower half showed through. The fade
   * still comes up from the same point of scroll, and is clear at rest.
   */
  cover?: number;
}) {
  const measured = use(AnimatedHeaderHeightContext);
  // The measured height when there is one; `bottom` only outside a stack.
  const fallback = measured ? 0 : bottom;
  const style = useMemo(() => {
    const header: Animated.AnimatedNode | number = measured
      ? hidden
        ? Animated.add(measured, -hidden)
        : measured
      : fallback;
    return {
      opacity: Animated.add(y, header).interpolate({
        inputRange: [0, ramp],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      transform: [
        { translateY: Animated.add(header, cover + tail - BAR_FADE_HEIGHT) },
      ],
    };
  }, [y, measured, fallback, hidden, tail, ramp, cover]);
  // Loaded on first use, not with every page: the fade module reads an
  // accessibility setting as it loads, and Screen imports this file.
  const { GroundFade } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./ground-fade') as typeof import('./ground-fade');
  return (
    <Animated.View
      pointerEvents="none"
      testID="bar-fade"
      style={[layer, style]}
    >
      <GroundFade
        side="top"
        ground={ground}
        hold={(BAR_FADE_HEIGHT - tail - BAR_FADE_LEAD) / BAR_FADE_HEIGHT}
        style={fill}
      />
    </Animated.View>
  );
}

const layer = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: BAR_FADE_HEIGHT,
} as const;
const fill = { flex: 1 } as const;

/**
 * The fade for a bar that is clear unless a legibility setting makes it
 * solid (Reduce Transparency, Increase Contrast): a solid bar covers its own
 * content and the page starts below it.
 */
export function ClearBarFade(props: Parameters<typeof BarFade>[0]) {
  return useSolidBar() ? null : <BarFade {...props} />;
}
