import { StyleSheet, View } from 'react-native';
import { formatDate } from '../../design/format';
import { Icon } from '../../design/icon';
import { Pressable } from '../../design/pressable';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, radii, rhythm } from '../../design/tokens';
import { explainTerm } from './TermTip';
import {
  stepTerm,
  trackerSteps,
  type StepState,
  type TrackerStage,
  type TrackerStep,
} from './tracker-model';

/**
 * The bill-stage tracker (newcomer design pass; prototype): six steps down
 * the page, so it reads the same at AX5 and in a 300 pt pane, where a
 * left-to-right ruler runs out of room. Done steps are filled, the step the
 * bill is at now carries the bronze ring and "Now", and a bill that stopped
 * says where and why. Each step is a button that opens its explainer.
 *
 * VoiceOver: one summary first ("Step 5 of 6: the Senate, now"), then each
 * step as "Second reading, done, 19 August 2026. Explains this stage."
 */
const spoken: Record<StepState, string> = {
  done: 'done',
  current: 'now',
  upcoming: 'to come',
  skipped: 'skipped',
  ended: 'stopped here',
  unreached: 'not reached',
};

export function trackerSummary(steps: readonly TrackerStep[]): string {
  const at = steps.findIndex(
    (s) => s.state === 'current' || s.state === 'ended',
  );
  if (at < 0) return `All ${steps.length} steps done: this bill is law.`;
  const step = steps[at]!;
  return step.state === 'ended'
    ? `Stopped at step ${at + 1} of ${steps.length}: ${step.label}. ${step.note}.`
    : `Step ${at + 1} of ${steps.length}: ${step.label}, now.`;
}

function Dot({ state }: { state: StepState }) {
  if (state === 'done')
    return (
      <View style={[styles.dot, styles.dotDone]}>
        <Icon
          name={symbols.selected}
          size={11}
          tone="onNavy"
          weight="bold"
          maxScale={1}
        />
      </View>
    );
  if (state === 'current') return <View style={[styles.dot, styles.dotNow]} />;
  if (state === 'ended')
    return (
      <View style={[styles.dot, styles.dotEnded]}>
        <Icon
          name={symbols.close}
          size={10}
          tone="onNavy"
          weight="bold"
          maxScale={1}
        />
      </View>
    );
  if (state === 'skipped') return <View style={styles.dotSkipped} />;
  return <View style={[styles.dot, styles.dotOpen]} />;
}

export function StageTracker({
  stages,
  status,
  testID = 'bill-stage-tracker',
}: {
  stages: readonly TrackerStage[];
  status?: string | null;
  testID?: string;
}) {
  const steps = trackerSteps(stages, status);
  return (
    <View testID={testID} style={styles.card}>
      <Text
        variant="footnote"
        tone="inkSoft"
        accessibilityLabel={trackerSummary(steps)}
        testID={`${testID}-summary`}
      >
        {trackerSummary(steps)}
      </Text>
      <View>
        {steps.map((step, i) => {
          const faint = step.state === 'unreached' || step.state === 'upcoming';
          const line =
            step.date != null ? formatDate(step.date) : (step.note ?? null);
          return (
            <Pressable
              key={step.id}
              accessibilityRole="button"
              accessibilityLabel={[
                step.label,
                spoken[step.state],
                step.date ? formatDate(step.date) : step.note,
              ]
                .filter(Boolean)
                .join(', ')}
              accessibilityHint="Explains this stage"
              onPress={() => explainTerm(stepTerm[step.id])}
              testID={`${testID}-${step.id}`}
              style={({ pressed }) => [
                styles.step,
                pressed ? { backgroundColor: colors.sunken } : null,
              ]}
            >
              <View style={styles.rail}>
                <View
                  style={[
                    styles.line,
                    i === 0 ? styles.lineHidden : null,
                    steps[i]!.state === 'done' ||
                    steps[i]!.state === 'current' ||
                    steps[i]!.state === 'ended' ||
                    steps[i]!.state === 'skipped'
                      ? styles.lineDone
                      : null,
                  ]}
                />
                <Dot state={step.state} />
                <View
                  style={[
                    styles.line,
                    i === steps.length - 1 ? styles.lineHidden : null,
                    steps[i + 1] &&
                    ['done', 'current', 'ended', 'skipped'].includes(
                      steps[i + 1]!.state,
                    )
                      ? styles.lineDone
                      : null,
                  ]}
                />
              </View>
              <View style={styles.words}>
                <Text
                  wordSafe
                  variant={
                    step.state === 'current' || step.state === 'ended'
                      ? 'strong'
                      : 'body'
                  }
                  tone={
                    faint || step.state === 'skipped' ? 'inkSoft' : undefined
                  }
                >
                  {step.label}
                </Text>
                {line ? (
                  <Text
                    wordSafe
                    variant="footnote"
                    tone={step.state === 'ended' ? 'danger' : 'inkSoft'}
                  >
                    {line}
                  </Text>
                ) : null}
              </View>
              <Icon
                name={symbols.help}
                size={16}
                tone="inkSoft"
                maxScale={1.3}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const D = 22;
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
  rail: { width: D, alignItems: 'center' },
  line: { flex: 1, width: 2, backgroundColor: colors.dividerSubtle },
  lineDone: { backgroundColor: colors.navy },
  lineHidden: { backgroundColor: 'transparent' },
  dot: {
    width: D,
    height: D,
    borderRadius: D / 2,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.navy },
  dotNow: {
    backgroundColor: colors.bronzeWash,
    borderWidth: 3,
    borderColor: colors.bronze,
  },
  dotEnded: { backgroundColor: colors.danger },
  dotOpen: {
    backgroundColor: colors.raised,
    borderWidth: 2,
    borderColor: colors.dividerDefault,
  },
  dotSkipped: {
    width: 8,
    height: 8,
    marginVertical: 7,
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: colors.dividerDefault,
  },
  words: { flex: 1, justifyContent: 'center', paddingVertical: rhythm.tight },
});
