import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { LeadEvidence } from '../../design/lead';
import { leadMetricText } from '../../design/lead';
import {
  Card,
  Icon,
  SourceSheet,
  Text,
  useAccessibilitySize,
  type SourceOriginal,
} from '../../design/primitives';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { leadRoute } from '../../navigation/routes';
import { evidenceLink, leadFigure, type LeadView } from './model';

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
 * its title in the export's words, its one figure (the subject's), its one
 * sentence, then "Evidence (n) ›" (design pass 5, P2-13). The card's upper
 * part opens the comparison; "Evidence" opens a sheet with its example
 * records, every caveat verbatim and in full, and the as-at date. The
 * caveats are said there and on the comparison, not on every card. A lead
 * is a reason to look closer, never a finding: the words are the export's.
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
  const [sheet, setSheet] = useState(false);
  const stacked = useAccessibilitySize();
  const metric = leadFigure(lead);
  const figure = metric
    ? { label: metric.label, ...leadMetricText(metric) }
    : null;
  const evidence = evidenceLink(lead.evidence.length);
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
    figure ? `${figure.label}, ${figure.spoken}` : null,
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
        {figure ? (
          <View
            testID={`${testID}-figure`}
            style={[styles.figure, stacked ? styles.stacked : null]}
          >
            {/* Word-safe only in the stacked column's fixed frame: a
                hugging figure's width follows its own size. */}
            <Text wordSafe={stacked} variant="heading" tabular tone="bronzeInk">
              {figure.text}
            </Text>
            <Text wordSafe={stacked} variant="metadata">
              {figure.label}
            </Text>
          </View>
        ) : null}
        {lead.summary ? (
          <Text wordSafe variant="body" testID={`${testID}-summary`}>
            {lead.summary}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={evidence.spoken}
        accessibilityHint="Opens the example records and every caveat"
        testID={`${testID}-source`}
        onPress={() => setSheet(true)}
        hitSlop={{ top: 6, bottom: 6 }}
        style={({ pressed: down }) => [
          styles.evidence,
          stacked ? styles.evidenceStacked : null,
          down ? styles.evidencePressed : null,
        ]}
      >
        <Text
          wordSafe={stacked}
          variant="strong"
          tone="bronzeInk"
          accessible={false}
          style={styles.evidenceText}
        >
          {evidence.text}
        </Text>
        <Icon name="chevron.right" size={13} tone="bronzeInk" />
      </Pressable>
      <SourceSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Evidence and caveats"
        asOf={asOf}
        citation={lead.citation}
        originals={originals}
        notes={[...lead.caveats, ...unlinked]}
        testID={`${testID}-source-sheet`}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: rhythm.tight },
  figure: { paddingVertical: rhythm.line, alignSelf: 'flex-start' },
  stacked: { alignSelf: 'stretch' },
  // "Evidence (2) ›": a 44pt target that hugs its words, the column's full
  // width at accessibility sizes so its word-safe text has a fixed frame.
  evidence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.line,
    alignSelf: 'flex-start',
    minHeight: minimumTarget,
    marginTop: rhythm.tight,
    paddingHorizontal: rhythm.line,
    marginHorizontal: -rhythm.line,
    borderRadius: rhythm.line,
  },
  evidenceStacked: { alignSelf: 'stretch' },
  evidenceText: { flexShrink: 1 },
  evidencePressed: { backgroundColor: colors.sunken },
});
