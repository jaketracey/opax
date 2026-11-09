import { StyleSheet, View } from 'react-native';
import { Text } from '../../../design/text';
import { colors, rhythm } from '../../../design/tokens';
import { counted } from '../../../design/format';
import { progressLine } from '../quiz-model';

/**
 * Eight segments, answered, current and to come, and "3 of 8 · 240
 * points". The strip shows status and does not act, so it has no tint; the
 * line carries the meaning, so the segments are decorative.
 */
export function ProgressStrip({
  index,
  total,
  points,
}: {
  index: number;
  total: number;
  points: number;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`Question ${index + 1} of ${total}. ${counted(points, 'point', 'points')}.`}
      testID="quiz-progress"
      style={styles.block}
    >
      <View style={styles.segments}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              {
                backgroundColor:
                  i < index
                    ? colors.inkSoft
                    : i === index
                      ? colors.ink
                      : colors.dividerDefault,
              },
            ]}
          />
        ))}
      </View>
      <Text variant="footnote" style={styles.line}>
        {progressLine(index, total, points)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.tight },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2, borderCurve: 'continuous' },
  line: { alignSelf: 'flex-end' },
});
