import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotionSetting } from '../../design/accessibility';
import { moveAccessibilityFocus } from '../../design/keyboard';
import { MachinePill } from '../../design/labels';
import { colors, motion, rhythm } from '../../design/tokens';
import { parseAnswer, type Block } from './answer-markdown';
import { AnswerBody } from './AnswerBody';
import { machineNote } from './AnswerView';
import type { AskStage, AskStep } from './stream';
import { AskStatus } from './AskStatus';
import { revealLength, revealWindow } from './stream-reveal';

/** One fade for each arriving piece, and for the status line giving way. */
export const STREAM_FADE_MS = motion.duration.crossfade;
const timing = {
  duration: STREAM_FADE_MS,
  easing: Easing.bezier(...motion.easing.standard),
};

/** Opacity only, from clear to drawn on mount: nothing moves. */
function FadeIn({
  animate = true,
  children,
  style,
  testID,
}: {
  animate?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  // Decided at mount: a later render never restarts or skips the fade.
  const [from] = useState(animate ? 0 : 1);
  const opacity = useSharedValue(from);
  useEffect(() => {
    if (from === 0) opacity.value = withTiming(1, timing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const drawn = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[style, drawn]} testID={testID}>
      {children}
    </Animated.View>
  );
}

/**
 * Streamed blocks, each arriving piece fading in over text already laid out.
 * The settled layer holds the whole text in flow with the newest piece drawn
 * clear; a second layer on top draws only that piece and fades in. Both break
 * lines identically, so the reveal moves nothing. Pieces that arrive during
 * a fade wait for it and share the next one. Reduce Motion appends at once.
 */
function StreamedBlocks({
  blocks,
  reveal,
  testID,
}: {
  blocks: Block[];
  reveal: boolean;
  testID?: string;
}) {
  const total = useMemo(() => revealLength(blocks), [blocks]);
  const motionOn = useReduceMotionSetting() === false;
  const animate = reveal && motionOn;
  // Text present at mount is already seen: a remount never fades it again.
  const [held, setHeld] = useState<{ settled: number; target: number | null }>({
    settled: total,
    target: null,
  });
  // Moved on while rendering, so a new piece is never drawn before its fade.
  let seen = held;
  if (!animate || total < held.settled) {
    // Reduce Motion or a rewrite: everything shown is settled.
    if (held.settled !== total || held.target !== null)
      seen = { settled: total, target: null };
  } else if (held.target === null && total > held.settled)
    seen = { settled: held.settled, target: total };
  if (seen !== held) setHeld(seen);
  const { settled, target } = seen;
  useEffect(() => {
    if (seen.target === null) return;
    const timer = setTimeout(
      () =>
        setHeld((now) => ({
          settled: now.target ?? now.settled,
          target: null,
        })),
      STREAM_FADE_MS,
    );
    return () => clearTimeout(timer);
  }, [seen.target]);
  const base = useMemo(
    () => (settled < total ? revealWindow(blocks, 0, settled) : blocks),
    [blocks, settled, total],
  );
  const fresh = useMemo(
    () =>
      target !== null && target > settled
        ? revealWindow(blocks, settled, target)
        : null,
    [blocks, settled, target],
  );
  return (
    <View accessibilityLiveRegion="none">
      <AnswerBody blocks={base} streaming testID={testID} />
      {fresh ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
          testID="ask-streaming-layer"
        >
          <FadeIn key={target} testID="ask-streaming-fresh">
            <AnswerBody blocks={fresh} streaming />
          </FadeIn>
        </View>
      ) : null}
    </View>
  );
}

/** A gap this long after the last piece shows the tail's indicator. */
export const STREAM_QUIET_MS = 1000;
export const streamTailLabel = 'Writing the answer';

/**
 * The quiet row under the streamed text: the turn's busy element once the
 * status line has given way. Its height is fixed and reserved from the first
 * text, so the indicator appearing moves nothing. The indicator waits for a
 * second with no new piece, so a fast replay never shows one; once it has
 * appeared it stays, under the last line, until the answer lands, so slow
 * pieces never make it blink. It fades in once: the small system spinner, or
 * three still dots with no fade under Reduce Motion. Never a live region:
 * the stage was announced, and the answer is when it lands. It sits outside
 * the text's fade, so it is opaque when VoiceOver lands.
 */
function StreamTail({
  text,
  claimFocus,
  still,
}: {
  text: string;
  /** True, once, when VoiceOver should follow the status line here. */
  claimFocus: () => boolean;
  still: boolean;
}) {
  const row = useRef<View>(null);
  useEffect(() => {
    // After the commit is on screen, so the row exists for VoiceOver.
    const frame = requestAnimationFrame(() => {
      if (claimFocus()) moveAccessibilityFocus(row.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [claimFocus]);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown) return;
    // Each piece restarts the wait until the indicator first appears.
    const timer = setTimeout(() => setShown(true), STREAM_QUIET_MS);
    return () => clearTimeout(timer);
  }, [text, shown]);
  return (
    <View
      ref={row}
      accessible
      accessibilityLabel={streamTailLabel}
      accessibilityState={{ busy: true }}
      accessibilityLanguage="en-AU"
      accessibilityLiveRegion="none"
      style={styles.tail}
      testID="ask-stream-tail"
    >
      {!shown ? null : still ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.dots}
          testID="ask-stream-tail-dots"
        >
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      ) : (
        <FadeIn testID="ask-stream-tail-indicator">
          <ActivityIndicator
            size="small"
            color={colors.inkSoft}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID="ask-stream-tail-spinner"
          />
        </FadeIn>
      )}
    </View>
  );
}

let parsed: { text: string; blocks: Block[] } = { text: '', blocks: [] };
/** The streamed text's blocks; the latest text is parsed once for all views. */
function streamedBlocks(text: string): Block[] {
  if (parsed.text !== text)
    parsed = {
      text,
      blocks: text ? parseAnswer(text, { streaming: true }) : [],
    };
  return parsed.blocks;
}
/**
 * True once streamed text draws something and the status row has given way
 * to it. Text that is not blank can still parse to nothing ("**", "## ", a
 * table's first row), so this, not the raw text, is the one signal.
 */
export const streamStarted = (text: string) => streamedBlocks(text).length > 0;

/**
 * Streamed text under its one pill, through the same reader as the final
 * answer with links inert and no marks: while it is written, and when a
 * stream stops partway (journeys/ask.md 4.4 step 3, 4.14).
 */
export function StreamedAnswer({
  text,
  pillTestID,
  testID,
}: {
  text: string;
  pillTestID?: string;
  testID?: string;
}) {
  const blocks = streamedBlocks(text);
  if (!blocks.length) return null;
  return (
    <View style={styles.block}>
      <MachinePill note={machineNote} testID={pillTestID} />
      <StreamedBlocks blocks={blocks} reveal={false} testID={testID} />
    </View>
  );
}

/**
 * The live half of an Ask turn (journeys/ask.md 4.4 step 2, 13 item 9):
 * until text arrives, one status line naming the stage beside a system
 * activity indicator and nothing else. The first text takes the line's
 * place as the line fades, then each piece fades in as it arrives, over a
 * quiet tail row that keeps the busy state (and VoiceOver's focus) until the
 * answer lands. Stop is the composer's trailing button.
 */
export function AskProgress({
  stage,
  steps = [],
  announcement = stage ?? 'Reading your question',
  streaming,
  onTailFocus,
  onBottom,
}: {
  stage: AskStage | null;
  steps?: readonly AskStep[];
  announcement?: string;
  streaming: string;
  /** VoiceOver moved to the tail row, which reads the stage itself. */
  onTailFocus?: () => void;
  /** The block's bottom edge within its turn, as the answer grows. */
  onBottom?: (edge: number) => void;
}) {
  const blocks = streamedBlocks(streaming);
  const started = blocks.length > 0;
  const motionOn = useReduceMotionSetting() === false;
  // Set while rendering, so the line never drops out for a frame before its
  // fade. Text already there at mount (a remount mid-answer) hands over
  // nothing.
  const [was, setWas] = useState(started);
  const [leaving, setLeaving] = useState(false);
  if (was !== started) {
    setWas(started);
    setLeaving(started && motionOn);
  }
  // VoiceOver follows the status line to the tail row only where it was put
  // on the line: this view's row took the send's focus request (a composer
  // send, a follow-up and a retry make none, and of several mounted Ask
  // stacks one takes it), this screen has navigation focus, and it has not
  // already moved for this answer (a server retry brings the line back and
  // hands over again).
  const navigation = useContext(NavigationContext);
  const focus = useRef({ owned: false, moved: false });
  const tookFocus = useCallback(() => {
    focus.current = { owned: true, moved: false };
  }, []);
  const claimFocus = useCallback(() => {
    const { owned, moved } = focus.current;
    if (!owned || moved || !(navigation?.isFocused() ?? true)) return false;
    focus.current.moved = true;
    onTailFocus?.();
    return true;
  }, [navigation, onTailFocus]);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), STREAM_FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  const status = useSharedValue(1);
  useEffect(() => {
    status.value = leaving ? withTiming(0, timing) : 1;
  }, [leaving, status]);
  const fading = useAnimatedStyle(() => ({ opacity: status.value }));
  return (
    <View
      style={styles.progress}
      onLayout={
        onBottom
          ? ({ nativeEvent: { layout } }) => onBottom(layout.y + layout.height)
          : undefined
      }
      testID="ask-progress"
    >
      {!started || leaving ? (
        <Animated.View
          // Out of flow as it goes: the text starts where the line was.
          pointerEvents={leaving ? 'none' : 'auto'}
          accessibilityElementsHidden={leaving}
          importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
          style={[leaving ? styles.leaving : null, fading]}
          testID="ask-status-slot"
        >
          <AskStatus
            stage={stage}
            steps={steps}
            announcement={announcement}
            onTookFocus={tookFocus}
          />
        </Animated.View>
      ) : null}
      {started ? (
        <View style={styles.block}>
          <FadeIn animate={leaving} style={styles.block} testID="ask-streamed">
            <MachinePill note={machineNote} />
            <StreamedBlocks blocks={blocks} reveal testID="ask-streaming" />
          </FadeIn>
          <StreamTail
            text={streaming}
            claimFocus={claimFocus}
            still={!motionOn}
          />
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  progress: { gap: rhythm.heading },
  block: { gap: rhythm.tight },
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
  // The small system spinner's height, at every text size.
  tail: { height: 20, flexDirection: 'row', alignItems: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    borderCurve: 'continuous',
    backgroundColor: colors.inkSoft,
  },
});
