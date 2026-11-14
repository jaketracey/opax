import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  useAccessibilitySize,
  useReduceMotionSetting,
} from '../../design/accessibility';
import { useAccessibilityFocusRequest } from '../../design/keyboard';
import { ShimmerText } from '../../design/ShimmerText';
import { colors, motion, rhythm } from '../../design/tokens';
import type { AskStage, AskStep } from './stream';
import { askStatusText } from './status';

export const STATUS_HOLD_MS = 600;
export const STAGE_ANNOUNCEMENT_MS = 2000;

/** Holds the current value for a full interval; only the latest waits. */
export function useHeldLine(text: string, interval: number) {
  const [line, setLine] = useState(() => ({
    current: text,
    previous: null as string | null,
    at: Date.now(),
    version: 0,
  }));
  const { current, previous, at } = line;
  useEffect(() => {
    if (text === current) return;
    const timer = setTimeout(
      () => {
        setLine((shown) => ({
          current: text,
          previous: current,
          at: Date.now(),
          version: shown.version + 1,
        }));
      },
      Math.max(0, interval - (Date.now() - at)),
    );
    return () => clearTimeout(timer);
  }, [text, interval, current, at]);
  useEffect(() => {
    if (!previous) return;
    const timer = setTimeout(
      () => setLine((shown) => ({ ...shown, previous: null })),
      motion.duration.crossfade,
    );
    return () => clearTimeout(timer);
  }, [previous, at]);
  return line;
}

/** Kept at screen scope so a pending final writing announcement survives
 * the answer arriving. A null stage never replaces the latest pending stage. */
export function useAskStageAnnouncement(stage: AskStage | null) {
  const [announced, setAnnounced] = useState<AskStage>('Reading your question');
  const active = useRef(false);
  const last = useRef<string | null>(null);
  const at = useRef(-Infinity);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    active.current = stage !== null;
    if (!stage) return;
    if (timer.current !== null) clearTimeout(timer.current);
    if (stage === last.current) return;
    timer.current = setTimeout(
      () => {
        last.current = stage;
        at.current = Date.now();
        setAnnounced(stage);
        // Android uses the row's live region while it exists. If the answer
        // has already landed, deliver the pending final stage explicitly.
        if (Platform.OS === 'ios' || !active.current)
          AccessibilityInfo.announceForAccessibilityWithOptions(stage, {
            queue: true,
          });
      },
      Math.max(0, STAGE_ANNOUNCEMENT_MS - (Date.now() - at.current)),
    );
  }, [stage]);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return announced;
}

export function AskStatus({
  stage,
  steps,
  announcement,
}: {
  stage: AskStage | null;
  steps: readonly AskStep[];
  announcement: string;
}) {
  const stacked = useAccessibilitySize();
  const reduceMotion = useReduceMotionSetting() !== false;
  // A tapped question that asks at once (`askNow`) lands here, not on the
  // composer.
  const focusView = useAccessibilityFocusRequest('ask-status');
  const { current, previous, version } = useHeldLine(
    askStatusText(stage, steps),
    STATUS_HOLD_MS,
  );
  const progress = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(progress);
    if (reduceMotion || !version) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: motion.duration.crossfade,
      easing: Easing.bezier(...motion.easing.standard),
    });
    return () => cancelAnimation(progress);
  }, [version, reduceMotion, progress]);
  const incoming = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: reduceMotion ? 0 : rhythm.line * (1 - progress.value) },
    ],
  }));
  const outgoing = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateY: reduceMotion ? 0 : -rhythm.line * progress.value },
    ],
  }));
  return (
    <View
      ref={focusView}
      accessible
      accessibilityLabel={announcement}
      accessibilityState={{ busy: true }}
      accessibilityLanguage="en-AU"
      accessibilityLiveRegion="polite"
      testID="ask-status-row"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.status, stacked ? styles.stacked : null]}
      >
        <ActivityIndicator
          size="small"
          color={colors.inkSoft}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View style={styles.lines}>
          {previous && !reduceMotion ? (
            <Animated.View
              style={[styles.previous, outgoing]}
              testID="ask-status-outgoing"
            >
              <ShimmerText text={previous} />
            </Animated.View>
          ) : null}
          <Animated.View style={incoming} testID="ask-status-incoming">
            <ShimmerText text={current} testID="ask-status" />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  lines: { flexShrink: 1, alignSelf: 'stretch', justifyContent: 'center' },
  previous: { position: 'absolute', top: 0, left: 0, right: 0 },
});
