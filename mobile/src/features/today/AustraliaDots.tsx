import { Group, Points, Skia } from '@shopify/react-native-skia';
import {
  HeaderHeightContext,
  NavigationContext,
} from 'expo-router/react-navigation';
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useReduceMotionSetting } from '../../design/accessibility';
import { useLayout } from '../../design/adaptive';
import { SizedCanvas } from '../../design/canvas';
import { ScreenGutterContext } from '../../design/layout';
import { paletteFor } from '../../design/palette';
import { isAccessibilityCategory, motion, rhythm } from '../../design/tokens';
import outline from './australia-outline.json';
import {
  dotClockNeeded,
  dotFadeDistance,
  dotLevel,
  dotRowOpacity,
  dotScrollDistance,
  dotStates,
  dotWidth,
  dotHeight,
  androidDotScale,
  dotArrival,
  dotTarget,
  nextRestInset,
  outlineDotState,
  restInsetShown,
  sampleDotRows,
  type DotHighlight,
  type DotRow,
  type DotState,
  type RestInset,
} from './australia-dots-model';

const height = dotHeight;
// Whether the dots have drawn once this session: only that first draw fades.
let arrivedThisSession = false;
/** Tests only: a fresh session. */
export function resetDotArrivalForTests() {
  arrivedThisSession = false;
}
let sampled: DotRow[] | undefined;
function dotRows() {
  // Like SeatInvitation: use the ABS SVG paths directly, without new artwork.
  // The grid and containment tests run only once, never in an animation frame.
  sampled ??= sampleDotRows(
    outline.width,
    outline.height,
    outline.states.flatMap((state) => {
      const path = Skia.Path.MakeFromSVGString(state.d);
      const group = outlineDotState(state.code);
      return path && group
        ? [
            {
              state: group,
              contains: (x: number, y: number) => path.contains(x, y),
            },
          ]
        : [];
    }),
  );
  return sampled;
}

/** Observe Screen's existing native ScrollView directly on the UI thread. */
export function useTodayDotsScroll() {
  const scrollRef = useAnimatedRef<ScrollView>();
  const raw = useSharedValue(Number.NaN);
  useScrollOffset(scrollRef, raw);
  const header = useContext(HeaderHeightContext) ?? 0;
  const { width, height: tall, fontScale } = useWindowDimensions();
  const window = `${width}x${tall}@${fontScale}`;
  const ios = Platform.OS === 'ios';
  const navigation = useContext(NavigationContext);
  const expandedHeader = useSharedValue(header);
  const rest = useRef<RestInset | null>(null);
  useLayoutEffect(() => {
    // The bar's height at rest in this window (nextRestInset): it ignores
    // NativeStack's first inline estimate and the collapse as Today scrolls,
    // and starts again when the window turns, resizes or changes text size.
    // A session-wide maximum kept portrait's inset in landscape, so every
    // row read as scrolled past its fade (lane ad-home-map-rotation). Turned
    // while covered, Today's bar is reported only when it is shown again.
    rest.current = nextRestInset(
      rest.current,
      header,
      window,
      Date.now(),
      navigation?.isFocused() ?? true,
    );
    if (expandedHeader.value !== rest.current.inset)
      expandedHeader.value = rest.current.inset;
  }, [header, window, expandedHeader, navigation]);
  useEffect(
    () =>
      navigation?.addListener('focus', () => {
        rest.current = restInsetShown(rest.current, Date.now());
      }),
    [navigation],
  );
  const scroll = useDerivedValue(() =>
    dotScrollDistance(raw.value, ios ? expandedHeader.value : 0),
  );
  return { scrollRef, scroll, expandedHeader };
}

/**
 * Decorative only. Hidden at AX sizes so the title and first card have room,
 * and on a regular phone (iPhone Duo): there the art fell under the large
 * title and the date, and text is never drawn over it.
 *
 * Today draws it from the first frame, `neutral` while the seat is read, so
 * its clearance holds the date where it will stay (sweep 3, item 1: the date
 * dropped 16 pt when the map arrived with the seat).
 */
export function AustraliaDots(props: {
  state: DotState | null;
  /** The seat is not known yet: no tint and no walk until it is. */
  neutral?: boolean;
  scroll: SharedValue<number>;
  expandedHeader: SharedValue<number>;
}) {
  const { fontScale } = useWindowDimensions();
  const { rule } = useLayout();
  if (isAccessibilityCategory(fontScale) || rule === 'phone-regular')
    return null;
  return <DotField {...props} />;
}

function DotField({
  state,
  neutral = false,
  scroll,
  expandedHeader,
}: {
  state: DotState | null;
  neutral?: boolean;
  scroll: SharedValue<number>;
  expandedHeader: SharedValue<number>;
}) {
  const navigation = useContext(NavigationContext);
  const reduceSetting = useReduceMotionSetting();
  const reduced = reduceSetting !== false;
  const arrival = useSharedValue(
    dotArrival(arrivedThisSession, reduceSetting) === 'shown' ? 1 : 0,
  );
  useEffect(() => {
    const how = dotArrival(arrivedThisSession, reduceSetting);
    if (how === 'wait') {
      // The setting normally answers within a frame; never hide the art
      // for longer than a moment if it does not.
      const fallback = setTimeout(() => {
        arrivedThisSession = true;
        arrival.set(1);
      }, 300);
      return () => clearTimeout(fallback);
    }
    arrivedThisSession = true;
    arrival.set(
      how === 'fade'
        ? withTiming(1, { duration: motion.duration.crossfade })
        : 1,
    );
  }, [reduceSetting, arrival]);
  const scheme = useColorScheme();
  const palette = paletteFor(scheme === 'dark' ? 'dark' : 'light');
  const layout = useLayout();
  const window = useWindowDimensions();
  const android = Platform.OS === 'android';
  // The art bleeds 8 pt past the scroll view's leading edge. Measured from
  // the Screen's column, not the window: an iPad sidebar or the Duo's rail
  // takes a side of the window, and the art slid under it.
  const gutter = useContext(ScreenGutterContext);
  const inset = gutter ?? Math.max(0, (window.width - layout.width) / 2);
  const rows = useMemo(() => dotRows(), []);
  const time = useSharedValue(0);
  const highlight = useSharedValue<DotHighlight>({
    target: dotTarget(state, neutral),
    from: [],
    changedAt: -1,
  });
  const calm = useSharedValue(reduced);
  const focused = useSharedValue(navigation?.isFocused() ?? false);
  const foreground = useSharedValue(AppState.currentState === 'active');

  useEffect(() => {
    runOnUI(() => {
      calm.value = reduced;
      if (reduced)
        highlight.value = {
          target: highlight.value.target,
          from: [],
          changedAt: -1,
        };
    })();
  }, [calm, reduced, highlight]);
  // A new target crossfades from the levels drawn now (from neutral, the
  // seat's tint fades in); under Reduce Motion it is held at once.
  useEffect(() => {
    const target = dotTarget(state, neutral);
    runOnUI(() => {
      if (highlight.value.target === target) return;
      const from = dotStates.map((_, group) =>
        dotLevel(group, time.value, highlight.value, calm.value),
      );
      highlight.value = {
        target,
        from,
        changedAt: calm.value ? -1 : time.value,
      };
    })();
  }, [state, neutral, highlight, time, calm]);
  useEffect(() => {
    focused.value = navigation?.isFocused() ?? false;
    const focus = navigation?.addListener('focus', () => {
      focused.value = true;
    });
    const blur = navigation?.addListener('blur', () => {
      focused.value = false;
    });
    const app = AppState.addEventListener('change', (status) => {
      foreground.value = status === 'active';
    });
    return () => {
      focus?.();
      blur?.();
      app.remove();
    };
  }, [navigation, focused, foreground]);

  const frame = useFrameCallback((info) => {
    if (
      !dotClockNeeded(
        scroll.value < dotFadeDistance,
        focused.value,
        foreground.value,
        calm.value,
        time.value,
        highlight.value,
      )
    )
      return;
    time.set(time.get() + (info.timeSincePreviousFrame ?? 0) / 1000);
  }, false);
  const setActive = useCallback(
    (active: boolean) => frame.setActive(active),
    [frame],
  );
  useAnimatedReaction(
    () =>
      dotClockNeeded(
        scroll.value < dotFadeDistance,
        focused.value,
        foreground.value,
        calm.value,
        time.value,
        highlight.value,
      ),
    (active, previous) => {
      // Only the start/stop boundary crosses to JS. No per-frame React work,
      // and no registered frame callback while reading further down Today.
      if (active !== previous) runOnJS(setActive)(active);
    },
  );
  useEffect(() => () => frame.setActive(false), [frame]);

  const position = useAnimatedStyle(() => ({
    opacity: arrival.value,
    top: android ? 0 : 30 - expandedHeader.value - rhythm.block,
    // The art lives in scroll content: give back 55% for a net 0.45 drift.
    transform: [
      // Invisible after the fade: its bounds must stop travelling down Today.
      {
        translateY: calm.value
          ? 0
          : Math.min(scroll.value, dotFadeDistance) * 0.55,
      },
      ...(android ? [{ scale: androidDotScale }] : []),
    ],
  }));
  const art = (
    <Animated.View
      testID="today-australia-dots"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.art,
        android
          ? { left: layout.width - dotWidth, transformOrigin: 'top right' }
          : { left: -8 - inset },
        position,
      ]}
    >
      <SizedCanvas width={dotWidth} height={height}>
        {rows.map((row) => (
          <DotRowDrawing
            key={row.y}
            row={row}
            scroll={scroll}
            time={time}
            highlight={highlight}
            calm={calm}
            navy={palette.navy}
            bronze={palette.todayDotBronze}
          />
        ))}
      </SizedCanvas>
    </Animated.View>
  );
  if (android) return art;
  return <DateClearance expandedHeader={expandedHeader}>{art}</DateClearance>;
}

/** The gap kept between the art's lower edge (Tasmania) and the date line. */
export const DATE_CLEARANCE = 8;

/**
 * iOS: the art hangs from the large title and its lowest dots, Tasmania,
 * reached the date line ("Friday 13 November:", sweep 2, 11). This box sits
 * in the masthead's flow ahead of the date, as tall as the art reaches below
 * the masthead's top plus 8 pt, so the date starts clear of every dot. Its
 * negative margin cancels the masthead's gap, so a box of no height leaves
 * the date where it was. The art inside keeps its own position and motion.
 * Android sets its date beside the art instead (Masthead `androidDate`).
 */
function DateClearance({
  expandedHeader,
  children,
}: {
  expandedHeader: SharedValue<number>;
  children: ReactNode;
}) {
  const clearance = useAnimatedStyle(() => ({
    height: dateClearance(expandedHeader.value),
  }));
  return (
    <Animated.View
      testID="today-australia-dots-clearance"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.clearance, clearance]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * How far the iOS art reaches below the masthead's top, plus the clearance:
 * the art's top is `30 - expandedHeader - rhythm.block` (DotField).
 */
export function dateClearance(expandedHeader: number): number {
  'worklet';
  return Math.max(
    0,
    30 - expandedHeader - rhythm.block + height + DATE_CLEARANCE,
  );
}

function DotRowDrawing({
  row,
  scroll,
  time,
  highlight,
  calm,
  navy,
  bronze,
}: {
  row: DotRow;
  scroll: SharedValue<number>;
  time: SharedValue<number>;
  highlight: SharedValue<DotHighlight>;
  calm: SharedValue<boolean>;
  navy: string;
  bronze: string;
}) {
  const opacity = useDerivedValue(() =>
    calm.value
      ? Math.max(0, 1 - scroll.value / dotFadeDistance)
      : dotRowOpacity(row.y / height, scroll.value),
  );
  return (
    <Group opacity={opacity}>
      {row.groups.map(({ state, points }) => (
        <StateDots
          key={state}
          group={dotStates.indexOf(state)}
          points={points}
          time={time}
          highlight={highlight}
          calm={calm}
          navy={navy}
          bronze={bronze}
        />
      ))}
    </Group>
  );
}

function StateDots({
  group,
  points,
  time,
  highlight,
  calm,
  navy,
  bronze,
}: {
  group: number;
  points: { x: number; y: number }[];
  time: SharedValue<number>;
  highlight: SharedValue<DotHighlight>;
  calm: SharedValue<boolean>;
  navy: string;
  bronze: string;
}) {
  const level = useDerivedValue(() =>
    dotLevel(group, time.value, highlight.value, calm.value),
  );
  const base = useDerivedValue(() => 0.23 * (1 - level.value));
  const lit = useDerivedValue(() => 0.76 * level.value);
  const width = useDerivedValue(() => 2.5 * (1 + 0.18 * level.value));
  // Round points batch each row's circles into two paints, including the
  // mock's slight bronze growth. No path construction during animation.
  return (
    <>
      <Points
        points={points}
        mode="points"
        strokeCap="round"
        strokeWidth={2.5}
        color={navy}
        opacity={base}
      />
      <Points
        points={points}
        mode="points"
        strokeCap="round"
        strokeWidth={width}
        color={bronze}
        opacity={lit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  art: { position: 'absolute', width: dotWidth, height },
  clearance: { marginBottom: -rhythm.tight },
});
