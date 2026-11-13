import { useContext, useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  useAccessibilitySize,
  useReduceMotionSetting,
} from '../../../design/accessibility';
import { useDrawnColour } from '../../../design/engraving';
import { haptic } from '../../../design/haptics';
import { Icon } from '../../../design/icon';
import { InsetGroup } from '../../../design/layout';
import {
  RowCellInsetContext,
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../../design/row-padding';
import { Text } from '../../../design/text';
import { minimumTarget, rhythm } from '../../../design/tokens';
import { CachedPortrait } from '../../CachedPortrait';
import type { Question } from '../quiz-model';
import { marks } from './marks';

/**
 * Full-width single-choice rows. The chosen row shows a trailing checkmark.
 * After the reveal the control locks, nothing greys out, and the marks say
 * which row is right and which was the reader's, by symbol and word.
 */
/**
 * A portrait choice's portrait: the size passed to CachedPortrait and the
 * points it draws at, which the row's text inset adds. Spec 4.4 asks for
 * 56 pt, shared with the row inset.
 */
export const choicePortrait = { size: 56, drawn: 56 } as const;

export function ChoiceList({
  q,
  value,
  revealed,
  landing = false,
  onChange,
}: {
  q: Question;
  value: number | undefined;
  revealed: boolean;
  /** The answer is being checked on this page (not a reopened reveal). */
  landing?: boolean;
  onChange: (index: number) => void;
}) {
  return (
    <InsetGroup testID="quiz-choices">
      {(q.options ?? []).map((option, i) => (
        <ChoiceRow
          key={`${i}-${option.label}`}
          label={option.label}
          portrait={q.kind === 'portrait'}
          chosen={value === i}
          correct={!!option.correct}
          revealed={revealed}
          landing={landing}
          onPress={() => {
            if (revealed || value === i) return;
            haptic('selection');
            onChange(i);
          }}
          testID={`quiz-answer-${i}`}
        />
      ))}
    </InsetGroup>
  );
}

function ChoiceRow({
  label,
  portrait,
  chosen,
  correct,
  revealed,
  landing,
  onPress,
  testID,
}: {
  label: string;
  portrait: boolean;
  chosen: boolean;
  correct: boolean;
  revealed: boolean;
  landing: boolean;
  onPress: () => void;
  testID: string;
}) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cell = useRowCellStyle();
  // The text column starts after the cell's own leading padding, and the
  // portrait and its gap when they sit beside it.
  const leading = useContext(RowCellInsetContext);
  useRowInset(
    portrait && !stacked
      ? leading + choicePortrait.drawn + rhythm.tight
      : leading,
  );
  // The reader's right answer: as the reveal lands, its check is struck
  // again, once (sweep 3, item 6). Every other mark, a wrong answer, a
  // reopened reveal and Reduce Motion (on, or not yet known) stay still.
  const reduced = useReduceMotionSetting();
  const [was, setWas] = useState(revealed);
  const [drawing, setDrawing] = useState(false);
  if (was !== revealed) {
    setWas(revealed);
    setDrawing(revealed && landing && chosen && correct && reduced === false);
  }
  const mark = revealed
    ? correct
      ? chosen
        ? 'Your answer'
        : 'Correct answer'
      : chosen
        ? 'Your answer'
        : null
    : null;
  const spoken = [
    label,
    revealed && correct ? 'Correct answer' : null,
    revealed && chosen ? 'Your answer' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected: chosen, disabled: revealed }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        cell,
        stacked && portrait ? styles.stacked : null,
        pressed && !revealed ? { backgroundColor: highlight } : null,
      ]}
    >
      {portrait ? (
        <CachedPortrait name={label} size={choicePortrait.size} />
      ) : null}
      <View style={styles.text}>
        <Text wordSafe variant={chosen ? 'strong' : 'body'}>
          {label}
        </Text>
        {mark ? (
          <Text wordSafe variant="secondary">
            {mark}
          </Text>
        ) : null}
      </View>
      {drawing ? (
        <DrawnCheck
          size={17}
          onDone={() => setDrawing(false)}
          testID={`${testID}-drawn`}
        />
      ) : revealed ? (
        correct ? (
          <Icon name={marks.correct} size={17} tone="navy" />
        ) : chosen ? (
          <Icon name={marks.wrong} size={17} tone="inkSoft" />
        ) : null
      ) : chosen ? (
        <Icon name={marks.correct} size={17} tone="navy" />
      ) : null}
    </Pressable>
  );
}

// The tick, on the 24-unit square the disc is drawn in, and its length.
const TICK = 'M7.4 12.5L10.6 15.7L16.6 8.7';
const TICK_LENGTH = 13.8;
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The correct mark, drawn: the navy disc with its tick struck on as one
 * stroke over about a quarter of a second. It stands in for the symbol only
 * while it draws (ChoiceRow swaps the symbol back at the end), at the
 * symbol's size and Dynamic Type scale.
 */
function DrawnCheck({
  size,
  onDone,
  testID,
}: {
  size: number;
  onDone: () => void;
  testID: string;
}) {
  const { fontScale } = useWindowDimensions();
  const scaled = Math.round(size * Math.min(Math.max(fontScale, 1), 1.5));
  const disc = useDrawnColour('navy');
  const tick = useDrawnColour('raised');
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const draw = Animated.timing(progress, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    // Ended or interrupted, the symbol takes its place.
    draw.start(() => onDone());
    return () => draw.stop();
    // Once, as it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Svg
      width={scaled}
      height={scaled}
      viewBox="0 0 24 24"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Circle cx={12} cy={12} r={11} fill={disc} />
      <AnimatedPath
        d={TICK}
        fill="none"
        stroke={tick}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={TICK_LENGTH}
        strokeDashoffset={progress.interpolate({
          inputRange: [0, 1],
          outputRange: [TICK_LENGTH, 0],
        })}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  text: { flex: 1, gap: rhythm.line },
});
