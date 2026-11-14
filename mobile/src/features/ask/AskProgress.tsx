import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotionSetting } from '../../design/accessibility';
import { MachinePill } from '../../design/labels';
import { motion, rhythm } from '../../design/tokens';
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

const parse = (text: string) =>
  text ? parseAnswer(text, { streaming: true }) : [];

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
  const blocks = useMemo(() => parse(text), [text]);
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
 * place as the line fades, then each piece fades in as it arrives. Stop is
 * the composer's trailing button.
 */
export function AskProgress({
  stage,
  steps = [],
  announcement = stage ?? 'Reading your question',
  streaming,
}: {
  stage: AskStage | null;
  steps?: readonly AskStep[];
  announcement?: string;
  streaming: string;
}) {
  const blocks = useMemo(() => parse(streaming), [streaming]);
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
    <View style={styles.progress} testID="ask-progress">
      {!started || leaving ? (
        <Animated.View
          // Out of flow as it goes: the text starts where the line was.
          pointerEvents={leaving ? 'none' : 'auto'}
          accessibilityElementsHidden={leaving}
          importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
          style={[leaving ? styles.leaving : null, fading]}
          testID="ask-status-slot"
        >
          <AskStatus stage={stage} steps={steps} announcement={announcement} />
        </Animated.View>
      ) : null}
      {started ? (
        <FadeIn animate={leaving} style={styles.block} testID="ask-streamed">
          <MachinePill note={machineNote} />
          <StreamedBlocks blocks={blocks} reveal testID="ask-streaming" />
        </FadeIn>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  progress: { gap: rhythm.heading },
  block: { gap: rhythm.tight },
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
});
