import { Pressable, StyleSheet, View } from 'react-native';
import { Section, SourceLine, Text } from '../../design/primitives';
import { counted, formatCount, formatPercent } from '../../design/format';
import { colors, rhythm } from '../../design/tokens';
import type { DecadeBucket, decodeTide } from './model';
import type { ReadMeta } from './parts';
import { TIDE_CITATION } from './topic-copy';

type Tide = ReturnType<typeof decodeTide>;
const BAR_HEIGHT = 96;

/**
 * "Over time" (specs/search.md 5.3): this topic's share of labelled federal
 * speeches in each decade, from `/api/tide`. Each bar is a button: it sets
 * the Speeches filter to its decade, and tapping the chosen bar clears it.
 */
export function TopicTide({
  tide,
  meta,
  slug,
  chosen,
  onChoose,
}: {
  tide: Tide;
  meta: ReadMeta;
  slug: string;
  chosen: DecadeBucket | null;
  onChoose: (decade: DecadeBucket | null) => void;
}) {
  const bars = (tide.topics[slug] ?? []).flatMap((point) => {
    const decade = tide.decades.find((d) => d.slug === point.decade);
    return decade ? [{ ...point, decade }] : [];
  });
  if (!bars.length) return null;
  const max = Math.max(...bars.map((b) => b.share), Number.EPSILON);
  return (
    <Section title="Over time" testID="topic-tide">
      <View style={styles.bars}>
        {bars.map((bar, i) => {
          const selected = chosen?.slug === bar.decade.slug;
          const share = formatPercent(bar.share * 100);
          return (
            <Pressable
              key={bar.decade.slug}
              accessibilityRole="button"
              accessibilityLabel={`${bar.decade.label}, ${share} of labelled federal speeches, ${counted(bar.count, 'speech', 'speeches')}`}
              accessibilityHint={
                selected
                  ? 'Shows speeches from every year'
                  : 'Shows this decade’s speeches'
              }
              accessibilityState={{ selected }}
              onPress={() => onChoose(selected ? null : bar.decade)}
              testID={`topic-tide-bar-${i}`}
              style={styles.column}
            >
              <Text wordSafe variant="secondary" tabular>
                {share}
              </Text>
              <View style={styles.track}>
                <View
                  style={{
                    height: Math.max(2, (bar.share / max) * BAR_HEIGHT),
                    backgroundColor: colors.navy,
                    opacity: chosen && !selected ? 0.35 : 1,
                  }}
                />
              </View>
              <Text
                wordSafe
                variant={selected ? 'strong' : 'secondary'}
                tone={selected ? 'navy' : undefined}
              >
                {bar.decade.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <SourceLine
        asOf={meta.asOf}
        savedAt={meta.savedAt}
        citation={TIDE_CITATION}
        coverage="Federal speeches"
        title="About these bars"
        notes={[
          'Each bar is this topic’s share of the federal speeches that carry any topic label in that decade. Federal Hansard is the longest record OPAX holds, so it is the one compared over time.',
          ...tide.decades.map(
            (d) =>
              `${d.label}: ${formatCount(d.labelled)} of ${formatCount(d.total)} federal speeches labelled (${formatPercent(d.coverage * 100)}).`,
          ),
        ]}
        testID="topic-tide-source"
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', gap: rhythm.tight, alignItems: 'flex-end' },
  column: { flex: 1, gap: rhythm.line, alignItems: 'center', minHeight: 44 },
  track: {
    alignSelf: 'stretch',
    height: BAR_HEIGHT,
    justifyContent: 'flex-end',
  },
});
