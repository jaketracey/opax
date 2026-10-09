import { StyleSheet, View, type ColorValue } from 'react-native';
import type { EditionView } from '../../api/catalogs';
import { Text, useAccessibilitySize } from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';
import { shortWrittenDay } from './parts';

type Stage = EditionView['facts']['events'][number];

/** What the stage line says to VoiceOver: how many stages, first to latest. */
export function stageLineLabel(events: readonly Stage[]): string {
  const first = events[0]!;
  const last = events.at(-1)!;
  if (events.length === 1) return `${last.text}, ${last.date}`;
  return `${events.length} stages: ${first.text}, ${first.date}, to ${last.text}, ${last.date}`;
}

/**
 * The edition's timeline as one stage line: the first date at the start of
 * a rule in the subject's accent and the latest stage at its end ("12 Aug
 * ●——● Royal Assent 18 Sep"). The full history is one tap away on the
 * record. At accessibility sizes the two ends stack under the rule, each on
 * its own line; nothing is cut short.
 */
export function StageLine({
  events,
  color,
  testID,
}: {
  events: readonly Stage[];
  /** The subject's accent: the rule and its dots. */
  color: ColorValue;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const first = events[0]!;
  const last = events.at(-1)!;
  const single = events.length === 1;
  return (
    <View
      accessible
      accessibilityLabel={stageLineLabel(events)}
      style={styles.line}
      testID={testID}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.track}
      >
        {single ? null : (
          <>
            <View
              style={[
                styles.dot,
                { borderColor: color, backgroundColor: colors.raised },
              ]}
            />
            <View style={[styles.rule, { backgroundColor: color }]} />
          </>
        )}
        <View
          style={[styles.dot, { borderColor: color, backgroundColor: color }]}
        />
      </View>
      <View style={[styles.ends, stacked ? styles.endsStacked : null]}>
        {single ? null : (
          <Text wordSafe variant="metadata" testID={`${testID}-first`}>
            {shortWrittenDay(first.date)}
          </Text>
        )}
        <Text
          wordSafe
          variant="metadata"
          tone="ink"
          style={[styles.last, stacked || single ? null : styles.lastEnd]}
          testID={`${testID}-latest`}
        >
          {`${last.text} ${shortWrittenDay(last.date)}`}
        </Text>
      </View>
    </View>
  );
}

const DOT = 10;
const styles = StyleSheet.create({
  line: { gap: rhythm.tight },
  track: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2 },
  rule: { flex: 1, height: 2 },
  ends: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: rhythm.heading,
    rowGap: rhythm.line,
  },
  endsStacked: { flexDirection: 'column' },
  last: { flexShrink: 1 },
  lastEnd: { textAlign: 'right', marginStart: 'auto' },
});
