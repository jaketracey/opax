import { StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from '../../../design/accessibility';
import { Text } from '../../../design/text';
import {
  colors,
  hairline,
  minimumTarget,
  rhythm,
} from '../../../design/tokens';
import type { Question } from '../quiz-model';

/**
 * Higher or lower: the shown subject with its figure, and the hidden one
 * with "?" until the reveal. The reveal's source line covers both figures.
 */
export function ComparisonTiles({
  q,
  revealed,
}: {
  q: Question;
  revealed: boolean;
}) {
  const stacked = useAccessibilitySize();
  const c = q.comparison;
  if (!c) return null;
  return (
    <View
      testID="quiz-comparison"
      style={[styles.strip, stacked ? styles.stacked : null]}
    >
      <View
        accessible
        accessibilityLabel={`${c.shownLabel}, ${c.shownDisplay}`}
        style={stacked ? styles.tile : [styles.tile, styles.half]}
      >
        <Text wordSafe variant="tileFigure">
          {c.shownDisplay}
        </Text>
        <Text wordSafe variant="footnote">
          {c.shownLabel}
        </Text>
      </View>
      <View
        style={
          stacked
            ? styles.ruleAcross
            : [styles.ruleDown, { backgroundColor: colors.dividerSubtle }]
        }
      />
      <View
        accessible
        accessibilityLabel={
          revealed
            ? `${c.hiddenLabel}, ${c.hiddenDisplay}`
            : `${c.hiddenLabel}, hidden until you answer`
        }
        testID="quiz-hidden-figure"
        style={stacked ? styles.tile : [styles.tile, styles.half]}
      >
        <Text wordSafe variant="tileFigure" tone={revealed ? 'ink' : 'inkSoft'}>
          {revealed ? c.hiddenDisplay : '?'}
        </Text>
        <Text wordSafe variant="footnote">
          {c.hiddenLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: rhythm.block },
  stacked: { flexDirection: 'column', gap: rhythm.block },
  tile: { minHeight: minimumTarget, gap: rhythm.line },
  half: { flex: 1 },
  ruleDown: { width: hairline },
  ruleAcross: { height: hairline, backgroundColor: colors.dividerSubtle },
});
