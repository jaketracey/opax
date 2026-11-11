import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
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
import Svg, { Circle, Path } from 'react-native-svg';
import {
  useAccessibilitySize,
  useReduceMotionSetting,
} from '../../design/accessibility';
import { ShimmerText } from '../../design/ShimmerText';
import { AnimalLoader } from '../../design/menagerie/AnimalLoader';
import { Text } from '../../design/text';
import { colors, minimumTarget, motion, rhythm } from '../../design/tokens';
import type { AskStage, AskStep, AskTrailStep } from './stream';
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

type StatusProps = {
  stage: AskStage | null;
  steps: readonly AskStep[];
  announcement: string;
};

export function AskStatus({
  waiting = false,
  ...props
}: StatusProps & { waiting?: boolean }) {
  return waiting ? <AskWait {...props} /> : <StatusLine {...props} />;
}

function AskWait({ stage, steps, announcement }: StatusProps) {
  const snapshot = steps.flatMap((step) => step.trail ?? [step]);
  const [history, setHistory] = useState({
    input: steps,
    stage,
    trail: snapshot,
  });
  // Writing clears the controller's lookups before the first text arrives.
  const trail =
    (stage === 'Reading your question' && !steps.length) ||
    (stage === 'Searching again' && history.stage !== stage)
      ? []
      : snapshot.length
        ? snapshot
        : history.trail;
  if (history.input !== steps || history.stage !== stage)
    setHistory({ input: steps, stage, trail });
  return (
    <View style={styles.wait}>
      <StatusLine
        stage={stage}
        steps={trail}
        announcement={announcement}
        animal
      />
      <StepList steps={trail} writing={stage === 'Writing the answer'} />
    </View>
  );
}

// Wording and tool units match portal/public/ask-steps.js on the web.
const units: Record<string, readonly [string, string]> = {
  search: ['passage', 'passages'],
  read_passage: ['passage', 'passages'],
  find_quotes: ['passage', 'passages'],
  find_people: ['person', 'people'],
  member_votes: ['vote', 'votes'],
  party_donations: ['record', 'records'],
  speech_trend: ['period', 'periods'],
  electorates_rank: ['electorate', 'electorates'],
};
function stepMeta(step: AskTrailStep) {
  if (step.state === 'running') return '';
  const parts: string[] = [];
  if (step.state === 'failed' || step.state === 'error') parts.push('Failed');
  else if (step.results !== undefined) {
    const [one, many] = units[step.tool ?? ''] ?? ['result', 'results'];
    parts.push(
      step.results === 0
        ? `No ${many}`
        : `${Math.round(step.results).toLocaleString('en-AU')} ${step.results === 1 ? one : many}`,
    );
  }
  if (step.ms !== undefined) {
    const seconds = step.ms / 1000;
    parts.push(
      seconds < 0.1
        ? '<0.1 s'
        : `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`,
    );
  }
  return parts.join(' · ');
}

function StepList({
  steps,
  writing,
}: {
  steps: readonly AskTrailStep[];
  writing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const stacked = useAccessibilitySize();
  const earlier = steps.slice(0, -5).filter((s) => s.state !== 'running');
  const hidden = expanded ? [] : earlier;
  const visible = steps.filter((s) => !hidden.includes(s));
  if (writing && steps.length)
    visible.push({
      id: 'writing',
      label: 'Writing the answer',
      state: 'running',
    });
  if (!steps.length) {
    if (expanded) setExpanded(false);
    return null;
  }
  return (
    <View testID="ask-steps" accessibilityLabel="Steps" style={styles.steps}>
      {earlier.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((open) => !open)}
          style={styles.toggle}
          testID="ask-steps-toggle"
        >
          <Text variant="footnote" tone="link">
            {expanded
              ? 'Hide earlier steps'
              : hidden.length
                ? `Show ${hidden.length} earlier ${hidden.length === 1 ? 'step' : 'steps'}`
                : 'Show all steps'}
          </Text>
        </Pressable>
      ) : null}
      {visible.map((step, index) => {
        const meta = stepMeta(step);
        const failed = step.state === 'failed' || step.state === 'error';
        const words = step.arg ? `${step.label} · ${step.arg}` : step.label;
        const state =
          step.state === 'running' ? 'working' : failed ? 'failed' : 'done';
        return (
          <View key={step.id}>
            {step.round &&
            step.round > 1 &&
            visible[index - 1]?.round !== step.round ? (
              <View style={styles.round}>
                <Text variant="footnote" tone="inkFaint">
                  Round {step.round}
                </Text>
                <View style={styles.rule} />
              </View>
            ) : null}
            <View
              accessible
              accessibilityLabel={[
                step.label,
                step.arg,
                state,
                failed ? meta.replace(/^Failed(?: · )?/, '') : meta,
              ]
                .filter(Boolean)
                .join(', ')}
              accessibilityLanguage="en-AU"
              testID={`ask-step-${step.id}`}
              style={styles.step}
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Svg
                  width={16}
                  height={16}
                  viewBox="0 0 16 16"
                  accessible={false}
                >
                  <Circle
                    cx={8}
                    cy={8}
                    r={6.5}
                    fill={step.state === 'done' ? colors.bronzeWash : 'none'}
                    stroke={failed ? colors.inkFaint : colors.bronzeInk}
                    strokeWidth={1.1}
                    strokeDasharray={failed ? '2.2 2.2' : undefined}
                  />
                  {step.state === 'done' ? (
                    <Path
                      d="M4.9 8.3 L7.1 10.5 L11.2 6"
                      fill="none"
                      stroke={colors.bronzeInk}
                      strokeWidth={1.3}
                    />
                  ) : failed ? (
                    <Path
                      d="M5.5 8 H10.5"
                      stroke={colors.inkFaint}
                      strokeWidth={1.3}
                    />
                  ) : (
                    <Circle cx={8} cy={8} r={2} fill={colors.bronzeInk} />
                  )}
                </Svg>
              </View>
              <View
                style={[
                  styles.stepWords,
                  stacked ? styles.stacked : styles.stepInline,
                ]}
              >
                <Text
                  variant="footnote"
                  tone={
                    step.state === 'running'
                      ? 'ink'
                      : failed
                        ? 'inkFaint'
                        : 'inkSoft'
                  }
                  numberOfLines={stacked ? undefined : 1}
                  style={stacked ? undefined : styles.stepLabel}
                >
                  {words}
                </Text>
                {meta ? (
                  <Text variant="footnote" tone="inkSoft" tabular>
                    {meta}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StatusLine({
  stage,
  steps,
  announcement,
  animal = false,
}: StatusProps & { animal?: boolean }) {
  const stacked = useAccessibilitySize();
  const reduceMotion = useReduceMotionSetting() !== false;
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
      accessible
      accessibilityLabel={announcement}
      accessibilityLanguage="en-AU"
      accessibilityLiveRegion="polite"
      testID="ask-status-row"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.status, stacked ? styles.stacked : null]}
      >
        {animal ? (
          <AnimalLoader />
        ) : (
          <ActivityIndicator
            size="small"
            color={colors.inkSoft}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        )}
        <View style={styles.lines}>
          {previous && !reduceMotion ? (
            <Animated.View
              style={[styles.previous, outgoing]}
              testID="ask-status-outgoing"
            >
              {animal ? (
                <Text variant="secondary">{previous}</Text>
              ) : (
                <ShimmerText text={previous} />
              )}
            </Animated.View>
          ) : null}
          <Animated.View style={incoming} testID="ask-status-incoming">
            {animal ? (
              <Text variant="secondary" testID="ask-status">
                {current}
              </Text>
            ) : (
              <ShimmerText text={current} testID="ask-status" />
            )}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wait: { gap: rhythm.tight },
  steps: { gap: rhythm.line },
  toggle: { minHeight: minimumTarget, justifyContent: 'center' },
  round: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    marginTop: rhythm.tight,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.dividerSubtle,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: 28,
  },
  stepWords: { flex: 1, gap: rhythm.tight },
  stepInline: { flexDirection: 'row', alignItems: 'center' },
  stepLabel: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  lines: { flexShrink: 1, alignSelf: 'stretch', justifyContent: 'center' },
  previous: { position: 'absolute', top: 0, left: 0, right: 0 },
});
