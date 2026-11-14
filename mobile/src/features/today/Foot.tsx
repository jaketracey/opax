import { StyleSheet, View } from 'react-native';
import { copy } from '../../design/copy';
import { PageFoot } from '../../design/record';
import { Text } from '../../design/text';
import { colors, hairline, rhythm } from '../../design/tokens';
import { mastheadDate } from './Masthead';
import { nextSitting } from './sitting';
import type { SittingRead } from './SittingLine';

/**
 * The foot of Today (`PageFoot`, Today variant): the independence line,
 * then "Report a correction". The edition's source is in its card and the
 * "leads, not findings" line lives on Leads and About. The containers keep
 * the journeys' ids: `today-foot`, and `today-independence` and
 * `today-screen-footer` for the independence line's block.
 *
 * With `ending`, the page ends on a sentence above them (sweep 3, item 7):
 * a short bronze rule, then "That's the record for Saturday 14 November."
 * and the next sitting day when the calendar says. Today passes it only
 * when the page shows today's record: not with nothing saved, and not while
 * the masthead says it is showing a saved copy.
 */
export function TodayFoot({
  ending,
}: {
  /** Today's clock and its sitting calendar read (`useSittingRead`). */
  ending?: { now: Date; sitting: SittingRead | null };
}) {
  return (
    <View
      testID="today-foot"
      collapsable={false}
      style={ending ? styles.foot : undefined}
    >
      {ending ? <TodayEnding {...ending} /> : null}
      <View testID="today-independence" collapsable={false}>
        <View testID="today-screen-footer" collapsable={false}>
          <PageFoot variant="today" correctionTestID="today-correction" />
        </View>
      </View>
    </View>
  );
}

/**
 * The closing line, drawn once the sitting calendar's read answers so the
 * sentence never grows under the reader. It is the sitting line's own read
 * (one request, revalidated with it on a pull); no calendar is the date
 * alone. One text, so VoiceOver reads it in one pass; the rule is decoration.
 */
function TodayEnding({
  now,
  sitting,
}: {
  now: Date;
  sitting: SittingRead | null;
}) {
  if (!sitting) return null;
  const file = sitting.record?.data ?? null;
  const line = copy.todayEnding(
    mastheadDate(now),
    file ? nextSitting(file, now) : null,
  );
  return (
    <View testID="today-ending" style={styles.ending}>
      <View
        testID="today-ending-rule"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.rule}
      />
      <Text
        wordSafe
        variant="secondary"
        testID="today-ending-line"
        style={styles.centred}
      >
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The ending, then the independence block 24 pt under it.
  foot: { gap: rhythm.group },
  ending: { alignItems: 'center', gap: rhythm.block },
  // The masthead map's bronze, as a 40 pt hairline: the page's last mark
  // answers its first. Decorative, so no contrast pair applies.
  rule: {
    width: 40,
    height: hairline,
    backgroundColor: colors.todayDotBronze,
  },
  centred: { textAlign: 'center' },
});
