import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type ColorValue,
} from 'react-native';
import { useReduceMotionSetting } from '../../../design/accessibility';
import { Text } from '../../../design/text';
import { colors, motion, rhythm } from '../../../design/tokens';
import { counted } from '../../../design/format';
import { progressLine } from '../quiz-model';

/**
 * Eight segments, answered, current and to come, and "3 of 8 · 240
 * points". The strip shows status and does not act, so it has no tint; the
 * line carries the meaning, so the segments are decorative. A question
 * answered right keeps a bronze segment, which fills from its leading edge
 * as the answer lands (sweep 3, item 6); one answered wrong stays grey.
 */
export function ProgressStrip({
  index,
  total,
  points,
  results = [],
}: {
  index: number;
  total: number;
  points: number;
  /** Whether each answered question was right, in order. */
  results?: readonly boolean[];
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
          <Segment
            key={i}
            right={results[i] === true}
            ground={
              i < index
                ? colors.inkSoft
                : i === index
                  ? colors.ink
                  : colors.dividerDefault
            }
            testID={`quiz-progress-segment-${i}`}
          />
        ))}
      </View>
      <Text variant="footnote" style={styles.line}>
        {progressLine(index, total, points)}
      </Text>
    </View>
  );
}

/**
 * One segment. Right, it is bronze. Turning right while on screen, the
 * bronze fills across it once; drawn already right (a resumed round), or
 * with Reduce Motion on or not yet known, it is simply bronze.
 */
function Segment({
  right,
  ground,
  testID,
}: {
  right: boolean;
  ground: ColorValue;
  testID: string;
}) {
  const reduced = useReduceMotionSetting();
  const [was, setWas] = useState(right);
  const [filling, setFilling] = useState(false);
  if (was !== right) {
    setWas(right);
    setFilling(right && reduced === false);
  }
  const [fill] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!filling) return;
    fill.setValue(0);
    const sweep = Animated.timing(fill, {
      toValue: 1,
      duration: motion.duration.gentle,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    sweep.start(() => setFilling(false));
    return () => sweep.stop();
  }, [filling, fill]);
  return (
    <View
      testID={testID}
      style={[
        styles.segment,
        { backgroundColor: right && !filling ? colors.bronzeInk : ground },
      ]}
    >
      {filling ? (
        <Animated.View
          testID={`${testID}-fill`}
          style={[
            StyleSheet.absoluteFill,
            styles.fill,
            { transform: [{ scaleX: fill }] },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: rhythm.tight },
  segments: { flexDirection: 'row', gap: 4 },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  fill: { backgroundColor: colors.bronzeInk, transformOrigin: 'left center' },
  line: { alignSelf: 'flex-end' },
});
