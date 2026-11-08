import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../../../design/haptics';
import { InsetGroup } from '../../../design/layout';
import {
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../../design/row-padding';
import { Text } from '../../../design/text';
import { colors, minimumTarget, rhythm } from '../../../design/tokens';
import { optionValueText, ordinal, type Question } from '../quiz-model';

const circle = 28;

/**
 * Tap-to-rank rows. Tapping an unranked row gives it the next free rank;
 * tapping a ranked row clears it and closes the gap. After the reveal the
 * rows sort into the right order, each with its value and, where the reader
 * put it elsewhere, where that was.
 */
export function RankList({
  q,
  value,
  revealed,
  onChange,
}: {
  q: Question;
  value: string[] | undefined;
  revealed: boolean;
  onChange: (order: string[]) => void;
}) {
  const options = q.options ?? [];
  const order = value ?? [];
  const toggle = (label: string) => {
    if (revealed) return;
    haptic('selection');
    onChange(
      order.includes(label)
        ? order.filter((item) => item !== label)
        : [...order, label],
    );
  };
  const rows = options.map((option, index) => ({ option, index }));
  if (revealed) {
    const right = q.answer as string[];
    rows.sort(
      (a, b) => right.indexOf(a.option.label) - right.indexOf(b.option.label),
    );
  }
  return (
    <InsetGroup testID="quiz-ranks">
      {rows.map(({ option, index }) => {
        const placed = order.indexOf(option.label);
        const right = (q.answer as string[]).indexOf(option.label);
        const rank = revealed ? right : placed;
        const detail = revealed
          ? [
              option.value !== undefined
                ? optionValueText(q, option.value)
                : null,
              placed >= 0 && placed !== right
                ? `You put this ${ordinal(placed + 1)}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : null;
        return (
          <RankRow
            key={option.label}
            label={option.label}
            rank={rank >= 0 ? rank + 1 : null}
            detail={detail || null}
            revealed={revealed}
            onPress={() => toggle(option.label)}
            testID={`quiz-answer-${index}`}
          />
        );
      })}
    </InsetGroup>
  );
}

function RankRow({
  label,
  rank,
  detail,
  revealed,
  onPress,
  testID,
}: {
  label: string;
  rank: number | null;
  detail: string | null;
  revealed: boolean;
  onPress: () => void;
  testID: string;
}) {
  const highlight = useRowHighlight();
  const cell = useRowCellStyle();
  useRowInset(16 + circle + rhythm.tight);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, detail].filter(Boolean).join(', ')}
      accessibilityValue={{ text: rank ? `Ranked ${rank}` : 'Not ranked' }}
      accessibilityState={{ selected: !!rank, disabled: revealed }}
      accessibilityActions={
        rank && !revealed ? [{ name: 'clear', label: 'Clear ranking' }] : []
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'clear') onPress();
      }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        cell,
        pressed && !revealed ? { backgroundColor: highlight } : null,
      ]}
    >
      <View
        style={[styles.circle, rank ? styles.filled : styles.empty]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {rank ? (
          <Text variant="capsule" tone="onBand" maxFontSizeMultiplier={1.5}>
            {String(rank)}
          </Text>
        ) : null}
      </View>
      <View style={styles.text}>
        <Text wordSafe variant={rank && !revealed ? 'strong' : 'body'}>
          {label}
        </Text>
        {detail ? (
          <Text wordSafe variant="secondary">
            {detail}
          </Text>
        ) : null}
      </View>
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
  circle: {
    width: circle,
    height: circle,
    borderRadius: circle / 2,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { borderWidth: 1.5, borderColor: colors.lineControl },
  filled: { backgroundColor: colors.navy },
  text: { flex: 1, gap: rhythm.line },
});
