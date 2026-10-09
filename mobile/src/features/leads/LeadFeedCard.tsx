import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { LeadEvidence } from '../../design/lead';
import { leadMetricText } from '../../design/lead';
import {
  Card,
  SourceLine,
  Text,
  useAccessibilitySize,
  type SourceOriginal,
} from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';
import { leadRoute } from '../../navigation/routes';
import {
  exampleRecords,
  leadCaveat,
  leadFigures,
  type LeadView,
} from './model';

/** "$1,803 from Westpac Banking Corporation to Australian Labor Party (ALP) · AEC annual receipt · FY 2024–25". */
export function evidenceRecord(item: LeadEvidence): string | undefined {
  const flow =
    item.from && item.to
      ? `${item.amount ? `${item.amount} from` : 'From'} ${item.from} to ${item.to}`
      : item.amount;
  const text = [flow, item.detail, item.record].filter(Boolean).join(' · ');
  return text || undefined;
}

/**
 * One lead in the feed, as a card (a unit you can pick up): its category,
 * its title in the export's words, its figure, its one sentence, then one
 * caveat line and one source line. The card's upper part opens the
 * comparison; the source line opens its example records, every caveat and
 * the as-at date. A lead is a reason to look closer, never a finding: the
 * words are the export's, verbatim.
 */
export function LeadFeedCard({
  lead,
  asOf,
  testID,
}: {
  lead: LeadView;
  /** The export's date; the feed says it once, the sheet repeats it. */
  asOf: string;
  testID: string;
}) {
  const [pressed, setPressed] = useState(false);
  const stacked = useAccessibilitySize();
  const figures = leadFigures(lead).map((metric) => ({
    label: metric.label,
    ...leadMetricText(metric),
  }));
  const caveat = leadCaveat(lead);
  const originals: SourceOriginal[] = lead.evidence.flatMap((item) =>
    item.url
      ? [{ label: item.register, url: item.url, record: evidenceRecord(item) }]
      : [],
  );
  // A record whose link the source guard refused is still listed, unlinked.
  const unlinked = lead.evidence
    .filter((item) => !item.url)
    .map((item) =>
      [item.register, evidenceRecord(item)].filter(Boolean).join(': '),
    );
  const spoken = [
    `Lead, ${lead.categoryLabel}. ${lead.title}`,
    ...figures.map((figure) => `${figure.label}, ${figure.spoken}`),
    lead.summary,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <Card ground={pressed ? colors.sunken : undefined} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens the comparison"
        testID={`${testID}-open`}
        onPress={() => router.push(leadRoute(lead.id))}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={styles.head}
      >
        <Text wordSafe variant="label" tone="bronzeInk">
          {lead.categoryLabel}
        </Text>
        <Text wordSafe variant="subheading" testID={`${testID}-title`}>
          {lead.title}
        </Text>
        <View style={[styles.figures, stacked ? styles.stacked : null]}>
          {figures.map((figure, index) => (
            <View
              key={`${figure.label}-${index}`}
              testID={`${testID}-figure-${index}`}
              style={stacked ? null : styles.figure}
            >
              {/* Word-safe only in the stacked column's fixed frame: a
                  hugging figure's width follows its own size. */}
              <Text
                wordSafe={stacked}
                variant="heading"
                tabular
                tone="bronzeInk"
              >
                {figure.text}
              </Text>
              <Text wordSafe={stacked} variant="metadata">
                {figure.label}
              </Text>
            </View>
          ))}
        </View>
        {lead.summary ? (
          <Text wordSafe variant="body" testID={`${testID}-summary`}>
            {lead.summary}
          </Text>
        ) : null}
      </Pressable>
      <View style={styles.foot}>
        {caveat ? (
          <Text
            wordSafe
            variant="fine"
            tone="ink"
            testID={`${testID}-caveat`}
          >
            {caveat}
          </Text>
        ) : null}
        <SourceLine
          title="Example records and caveats"
          dateLabel={
            lead.evidence.length ? exampleRecords(lead.evidence.length) : null
          }
          asOf={asOf}
          citation={lead.citation}
          originals={originals}
          notes={[...lead.caveats, ...unlinked]}
          testID={`${testID}-source`}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: rhythm.tight },
  figures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: rhythm.group,
    rowGap: rhythm.tight,
    paddingVertical: rhythm.line,
  },
  stacked: { flexDirection: 'column' },
  figure: { flexShrink: 1 },
  foot: { gap: rhythm.tight, paddingTop: rhythm.heading },
});
