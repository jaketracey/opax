import { StyleSheet, View } from 'react-native';
import { formatDate } from '../../design/format';
import { Icon } from '../../design/icon';
import { Pressable } from '../../design/pressable';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, radii, rhythm } from '../../design/tokens';
import { openTerm } from './tracker-open-term';
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

export function BillStageTracker({
  tracker,
  testID = 'bill-tracker',
}: {
  tracker: Tracker;
  testID?: string;
}) {
  const { steps } = tracker;
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
                <View
                  style={[
                    styles.line,
                    i === 0
                      ? styles.lineHidden
                      : reached(step.state)
                        ? styles.lineReached
                        : null,
                  ]}
                />
                <Mark state={step.state} />
                <View
                  style={[
                    styles.line,
                    i === steps.length - 1
                      ? styles.lineHidden
                      : reached(steps[i + 1]?.state)
                        ? styles.lineReached
                        : null,
                  ]}
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
const styles = StyleSheet.create({
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
});
