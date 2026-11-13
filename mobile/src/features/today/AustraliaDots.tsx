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
  outlineDotState,
  sampleDotRows,
  type DotHighlight,
  type DotRow,
  type DotState,
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
  const ios = Platform.OS === 'ios';
  const expandedHeader = useSharedValue(header);
  useLayoutEffect(() => {
    // Ignore NativeStack's initial inline estimate and retain the expanded
    // inset while UIKit collapses. Both bar appearances remain transparent.
    expandedHeader.value = Math.max(expandedHeader.value, header);
  }, [header, expandedHeader]);
  const scroll = useDerivedValue(() =>
    dotScrollDistance(raw.value, ios ? expandedHeader.value : 0),
  );
  return { scrollRef, scroll, expandedHeader };
}

/**
 * Decorative only. Hidden at AX sizes so the title and first card have room,
 * and on a regular phone (iPhone Duo): there the art fell under the large
 * title and the date, and text is never drawn over it.
 */
export function AustraliaDots(props: {
  state: DotState | null;
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
  scroll,
  expandedHeader,
}: {
  state: DotState | null;
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
  const inset = Math.max(0, (window.width - layout.width) / 2);
  const rows = useMemo(() => dotRows(), []);
  const time = useSharedValue(0);
  const highlight = useSharedValue<DotHighlight>({
    target: state ? dotStates.indexOf(state) : -1,
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
  useEffect(() => {
    const target = state ? dotStates.indexOf(state) : -1;
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
  }, [state, highlight, time, calm]);
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
  return (
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
});
