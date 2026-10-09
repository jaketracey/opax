import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import {
  Button,
  Group,
  Icon,
  MachineLabel,
  Text,
} from '../../design/primitives';
import { useReduceMotion } from '../../design/accessibility';
import { colors, hairline, rhythm, spacing } from '../../design/tokens';
import { machineNote } from './AnswerView';
import type { AskStage } from './stream';

const stages = [
  'Reading your question',
  'Searching the record',
  'Writing the answer',
] as const;
type StageState = 'done' | 'active' | 'waiting';
const mark = 20;

/**
 * The live half of an Ask turn: the three stages as a timeline with the
 * current one pulsing, what the answer is reading, then the streaming text.
 * Cancel sits under it, never on its own.
 */
export function AskProgress({
  stage,
  reading,
  streaming,
  onCancel,
}: {
  stage: AskStage | null;
  reading: string[];
  streaming: string;
  onCancel: () => void;
}) {
  const active =
    stage === 'Reading your question'
      ? 0
      : stage === 'Searching the record'
        ? 1
        : 2;
  return (
    <Group gap={rhythm.block} testID="ask-progress">
      <View testID="ask-stages">
        {stages.map((label, i) => (
          <StageRow
            key={label}
            index={i}
            label={label}
            state={i < active ? 'done' : i === active ? 'active' : 'waiting'}
            last={i === stages.length - 1}
            detail={
              i === 2 && stage === 'Reading the record again.'
                ? stage
                : i === 2 && reading.length
                  ? `Reading ${reading.join(' · ')}`
                  : undefined
            }
          />
        ))}
      </View>
      {streaming ? (
        <Group gap={rhythm.tight}>
          <MachineLabel explanation={machineNote} />
          <Text
            selectable
            testID="ask-streaming"
            accessibilityLiveRegion="none"
          >
            {streaming}
          </Text>
        </Group>
      ) : null}
      <Button
        label="Cancel"
        icon="xmark"
        size="compact"
        onPress={onCancel}
        testID="ask-cancel"
      />
    </Group>
  );
}

function StageRow({
  index,
  label,
  state,
  last,
  detail,
}: {
  index: number;
  label: string;
  state: StageState;
  last: boolean;
  detail?: string;
}) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}, ${
        state === 'done'
          ? 'done'
          : state === 'active'
            ? 'in progress'
            : 'not started'
      }${detail ? `. ${detail}` : ''}`}
      testID={`ask-stage-${index}${state === 'active' ? '-active' : ''}`}
    >
      <View style={styles.rail}>
        <StageMark state={state} />
        {last ? null : (
          <View
            style={[
              styles.line,
              state === 'done' ? styles.lineDone : styles.lineWaiting,
            ]}
          />
        )}
      </View>
      <View style={[styles.body, last ? null : styles.bodySpaced]}>
        <Text
          wordSafe
          variant={state === 'active' ? 'strong' : 'metadata'}
          tone={state === 'waiting' ? 'inkFaint' : undefined}
        >
          {label}
        </Text>
        {detail ? (
          <Text wordSafe variant="metadata" testID="ask-reading">
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function StageMark({ state }: { state: StageState }) {
  if (state === 'done')
    return (
      <View style={[styles.mark, styles.markDone]}>
        <Icon name="checkmark" size={11} tone="onNavy" maxScale={1} />
      </View>
    );
  if (state === 'waiting')
    return <View style={[styles.mark, styles.markWaiting]} />;
  return <Pulse />;
}

/** The current stage: a navy ring whose core breathes; still under Reduce Motion. */
function Pulse() {
  const reduced = useReduceMotion();
  const [beat] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      beat.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(beat, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat, reduced]);
  return (
    <View style={[styles.mark, styles.markActive]}>
      <Animated.View
        style={[
          styles.core,
          {
            opacity: beat.interpolate({
              inputRange: [0, 1],
              outputRange: [0.35, 1],
            }),
            transform: [
              {
                scale: beat.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 1],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.s4 - spacing.s1 },
  rail: { width: mark, alignItems: 'center', paddingTop: 2 },
  mark: {
    width: mark,
    height: mark,
    borderRadius: mark / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDone: { backgroundColor: colors.navy },
  markActive: { borderWidth: 2, borderColor: colors.navy },
  markWaiting: { borderWidth: hairline * 1.5, borderColor: colors.lineStrong },
  core: {
    width: mark - 10,
    height: mark - 10,
    borderRadius: (mark - 10) / 2,
    backgroundColor: colors.navy,
  },
  line: { flex: 1, width: 2, marginVertical: spacing.s1, borderRadius: 1 },
  lineDone: { backgroundColor: colors.navy },
  lineWaiting: { backgroundColor: colors.line },
  body: { flex: 1, gap: 2 },
  bodySpaced: { paddingBottom: spacing.s5 - spacing.s1 },
});
