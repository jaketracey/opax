import { Pressable, StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from '../../../design/accessibility';
import { haptic } from '../../../design/haptics';
import { Icon } from '../../../design/icon';
import { InsetGroup } from '../../../design/layout';
import {
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
export function ChoiceList({
  q,
  value,
  revealed,
  onChange,
}: {
  q: Question;
  value: number | undefined;
  revealed: boolean;
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
  onPress,
  testID,
}: {
  label: string;
  portrait: boolean;
  chosen: boolean;
  correct: boolean;
  revealed: boolean;
  onPress: () => void;
  testID: string;
}) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  const cell = useRowCellStyle();
  useRowInset(portrait && !stacked ? 16 + 44 + rhythm.tight : 16);
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
      {portrait ? <CachedPortrait name={label} /> : null}
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
      {revealed ? (
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
