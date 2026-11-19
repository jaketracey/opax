import { Animated, StyleSheet, View } from 'react-native';
import { formatDate } from '../../design/format';
import { Icon } from '../../design/icon';
import { Pressable } from '../../design/pressable';
import { useSettle } from '../../design/settle';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { minimumTarget, radii, rhythm } from '../../design/tokens';
import { makeStyles } from '../../design/use-colors';
import { openTerm } from '../learn/open-term';
import {
  trackerStepTerm,
  type Tracker,
  type TrackerStep,
  type TrackerStepState,
} from './tracker-model';

/**
 * How it moved: the bill's six steps down the page (README §8.3), so it reads
 * the same at AX5, on a Duo's outer screen and in a 300 pt iPad pane, where a
 * ruler across the page runs out of room. Done steps are filled and dated,
 * the step the bill is at carries the bronze ring, an optional step it went
 * past is a small dot, and a bill that stopped says where and why.
 *
 * The summary line comes first, on screen and for VoiceOver. Each step is a
 * button that opens its stage's explainer in the guide.
 *
 * The first time a bill's tracker is drawn (`settleKey`, the bill's key),
 * the navy rail draws down through the stages the bill has reached, one
 * length after another. Marks, labels and dates are final from the first
 * frame, and with Reduce Motion the rail is simply there.
 */
function spoken(step: TrackerStep): string {
  const when = step.date ? formatDate(step.date) : null;
  switch (step.state) {
    case 'done':
      return `${step.label}, done, ${when ?? 'no date recorded'}`;
    case 'current':
      return step.note && step.note !== 'Now'
        ? `${step.label}, now: ${step.note}`
        : `${step.label}, now`;
    case 'upcoming':
      return `${step.label}, to come`;
    case 'skipped':
      return `${step.label}, none recorded`;
    case 'ended':
      return [step.label, 'stopped here', step.note, when]
        .filter(Boolean)
        .join(', ');
    case 'unreached':
      return `${step.label}, not reached`;
  }
}

/** The line under a step's label, as drawn. */
function stepLine(step: TrackerStep): string | null {
  const when = step.date ? formatDate(step.date, 'short') : null;
  if (step.state === 'ended') {
    return [step.note, when].filter(Boolean).join(' · ') || null;
  }
  if (step.state === 'done') return when ?? step.note;
  return step.note;
}

/** Whether the rail is drawn solid through a step: the bill has got there. */
const reached = (state: TrackerStepState | undefined) =>
  state === 'done' ||
  state === 'current' ||
  state === 'ended' ||
  state === 'skipped';

function Mark({ state }: { state: TrackerStepState }) {
  const styles = useStyles();

  if (state === 'done') {
    return (
      <View style={[styles.mark, styles.markDone]}>
        <Icon
          name={symbols.selected}
          size={11}
          tone="onNavy"
          weight="bold"
          maxScale={1}
        />
      </View>
    );
  }
  if (state === 'ended') {
    return (
      <View style={[styles.mark, styles.markEnded]}>
        <Icon
          name={symbols.close}
          size={10}
          tone="onNavy"
          weight="bold"
          maxScale={1}
        />
      </View>
    );
  }
  if (state === 'current')
    return <View style={[styles.mark, styles.markNow]} />;
  if (state === 'skipped') return <View style={styles.markSkipped} />;
  return <View style={[styles.mark, styles.markOpen]} />;
}

/** How long each reached length of rail takes to draw, and the cap. */
export const RAIL_LENGTH_MS = 90;
export const RAIL_MAX_MS = 720;
/** A beat for the page's own crossfade to finish first. */
export const RAIL_DELAY_MS = 200;

/** The reached lengths of rail, top to bottom: `${step}-above` and `-below`. */
export function railLengths(steps: readonly TrackerStep[]): string[] {
  return steps.flatMap((step, i) => [
    ...(i > 0 && reached(step.state) ? [`${step.id}-above`] : []),
    ...(i < steps.length - 1 && reached(steps[i + 1]?.state)
      ? [`${step.id}-below`]
      : []),
  ]);
}

/** One length of rail: plain, reached, or reached and drawing in its turn. */
function Line({
  hidden,
  reached: solid,
  settle,
  turn,
  turns,
  testID,
}: {
  hidden: boolean;
  reached: boolean;
  settle: Animated.Value | null;
  turn: number;
  turns: number;
  testID: string;
}) {
  const styles = useStyles();

  if (hidden) return <View style={[styles.line, styles.lineHidden]} />;
  if (!solid) return <View style={styles.line} />;
  if (!settle || turn < 0)
    return <View style={[styles.line, styles.lineReached]} />;
  return (
    <View style={styles.line}>
      <Animated.View
        testID={testID}
        style={[
          StyleSheet.absoluteFill,
          styles.ink,
          {
            transform: [
              {
                scaleY: settle.interpolate({
                  inputRange: [turn / turns, (turn + 1) / turns],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

export function BillStageTracker({
  tracker,
  settleKey,
  testID = 'bill-tracker',
}: {
  tracker: Tracker;
  /** The bill's key: its rail draws once, the first time it is shown. */
  settleKey?: string | null;
  testID?: string;
}) {
  const styles = useStyles();

  const { steps } = tracker;
  const lengths = railLengths(steps);
  const settle = useSettle(
    lengths.length && settleKey ? `rail:${settleKey}` : null,
    {
      duration: Math.min(RAIL_MAX_MS, lengths.length * RAIL_LENGTH_MS),
      delay: RAIL_DELAY_MS,
      easing: 'linear',
    },
  );
  return (
    <View testID={testID} style={styles.card}>
      <Text variant="strong" wordSafe testID={`${testID}-summary`}>
        {tracker.summary}
      </Text>
      <View>
        {steps.map((step, i) => {
          const line = stepLine(step);
          const faint =
            step.state === 'upcoming' ||
            step.state === 'unreached' ||
            step.state === 'skipped';
          const lead = step.state === 'current' || step.state === 'ended';
          return (
            <Pressable
              key={step.id}
              accessibilityRole="button"
              accessibilityLabel={spoken(step)}
              accessibilityHint="Explains this stage"
              onPress={() => openTerm(trackerStepTerm(step.id, tracker.first))}
              testID={`${testID}-${step.id}`}
              style={({ pressed }) => [
                styles.step,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.rail}>
                <Line
                  hidden={i === 0}
                  reached={reached(step.state)}
                  settle={settle}
                  turn={lengths.indexOf(`${step.id}-above`)}
                  turns={lengths.length}
                  testID={`${testID}-${step.id}-rail-above`}
                />
                <Mark state={step.state} />
                <Line
                  hidden={i === steps.length - 1}
                  reached={reached(steps[i + 1]?.state)}
                  settle={settle}
                  turn={lengths.indexOf(`${step.id}-below`)}
                  turns={lengths.length}
                  testID={`${testID}-${step.id}-rail-below`}
                />
              </View>
              <View style={styles.words}>
                <Text
                  wordSafe
                  variant={lead ? 'strong' : 'body'}
                  tone={faint ? 'inkSoft' : undefined}
                >
                  {step.label}
                </Text>
                {line ? (
                  <Text
                    variant="footnote"
                    tone={step.state === 'ended' ? 'danger' : 'inkSoft'}
                    tabular
                  >
                    {line}
                  </Text>
                ) : null}
              </View>
              <View style={styles.help}>
                <Icon
                  name={symbols.help}
                  size={16}
                  tone="inkSoft"
                  maxScale={1.3}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const MARK = 22;
const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.raised,
      borderRadius: radii.container,
      borderCurve: 'continuous',
      paddingHorizontal: rhythm.block,
      paddingTop: rhythm.row,
      paddingBottom: rhythm.tight,
      gap: rhythm.line,
    },
    step: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: rhythm.row,
      minHeight: minimumTarget,
      borderRadius: radii.thumb,
      borderCurve: 'continuous',
    },
    pressed: { backgroundColor: colors.sunken },
    rail: { width: MARK, alignItems: 'center' },
    line: { flex: 1, width: 2, backgroundColor: colors.dividerSubtle },
    lineReached: { backgroundColor: colors.navy },
    // The navy drawn over a plain length, from its top edge down.
    ink: { backgroundColor: colors.navy, transformOrigin: 'top' },
    lineHidden: { backgroundColor: 'transparent' },
    mark: {
      width: MARK,
      height: MARK,
      borderRadius: MARK / 2,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
    },
    markDone: { backgroundColor: colors.navy },
    markNow: {
      backgroundColor: colors.bronzeWash,
      borderWidth: 3,
      borderColor: colors.bronze,
    },
    markEnded: { backgroundColor: colors.danger },
    markOpen: {
      backgroundColor: colors.raised,
      borderWidth: 2,
      borderColor: colors.dividerDefault,
    },
    markSkipped: {
      width: 8,
      height: 8,
      marginVertical: (MARK - 8) / 2,
      borderRadius: 4,
      borderCurve: 'continuous',
      backgroundColor: colors.dividerDefault,
    },
    words: { flex: 1, justifyContent: 'center', paddingVertical: rhythm.tight },
    // Centred on the step, not its first line (design pass §10).
    help: { justifyContent: 'center' },
  }),
);
