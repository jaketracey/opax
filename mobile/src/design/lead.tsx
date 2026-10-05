import { Pressable, StyleSheet, View } from 'react-native';
import { openSource } from '../navigation/external';
import { useAccessibilitySize } from './accessibility';
import { Divider } from './controls';
import {
  formatCount,
  formatMoney,
  formatPercent,
  moneyAccessibilityLabel,
} from './format';
import { Icon } from './icon';
import { AsAtLine } from './record';
import { Text } from './text';
import { colors, minimumTarget, spacing } from './tokens';
import type { AsAt } from './format';

// The shape of one signal in /discovery.json.
export interface LeadMetric {
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percent';
}
/**
 * One example record behind a lead, read from the export's evidence label
 * (features/leads/model.ts). A label that could not be read has no amount,
 * names or detail, and shows only its register link.
 */
export interface LeadEvidence {
  amount: string | null;
  amountSpoken: string | null;
  from: string | null;
  to: string | null;
  detail: string | null;
  /** Who holds the record: "AusTender register". */
  register: string;
  /** The register's own ID to look up: "record CN3407266". */
  record: string | null;
  url: string | null;
  kind: 'register' | 'record';
}
export interface Lead {
  id: string;
  title: string;
  summary?: string;
  metrics: LeadMetric[];
  evidence: LeadEvidence[];
  caveats: string[];
}

/** A metric as shown and as read: "$76,984,493", "76,984,493 dollars". */
export function leadMetricText(metric: LeadMetric): {
  text: string;
  spoken: string;
} {
  if (metric.format === 'currency')
    return {
      text: formatMoney(metric.value),
      spoken: moneyAccessibilityLabel(metric.value),
    };
  if (metric.format === 'percent') {
    const text = formatPercent(metric.value);
    return { text, spoken: `${text.slice(0, -1)} percent` };
  }
  const text = formatCount(metric.value);
  return { text, spoken: text };
}

/** "Australian Office of Financial Management to Westpac Banking Corporation". */
function evidenceSpoken(item: LeadEvidence) {
  return [
    item.amountSpoken,
    item.from && item.to ? `${item.from} to ${item.to}` : null,
    item.detail,
    item.register,
    item.record,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * One example record: its amount, who paid whom, what and when, then the
 * register that holds it, as one link. IOS-UX "Evidence links":
 * "$4,537,500 / Contract value · starts 6 Feb 2017 / AusTender register ·
 * record CN3407266".
 */
export function LeadEvidenceLink({
  item,
  testID,
}: {
  item: LeadEvidence;
  testID?: string;
}) {
  const citation = item.record
    ? `${item.register} · ${item.record}`
    : item.register;
  const body = (
    <>
      <View style={styles.evidenceText}>
        {item.amount ? <Text variant="figureInline">{item.amount}</Text> : null}
        {item.from && item.to ? (
          <Text wordSafe variant="body">
            {item.from} → {item.to}
          </Text>
        ) : null}
        {item.detail ? (
          <Text wordSafe variant="metadata">
            {item.detail}
          </Text>
        ) : null}
        <Text wordSafe variant="body" tone={item.url ? 'bronzeInk' : 'ink'}>
          {citation}
        </Text>
      </View>
      {item.url ? (
        <Icon name="arrow.up.right.square" size={16} tone="bronzeInk" />
      ) : null}
    </>
  );
  if (!item.url)
    return (
      <View
        accessible
        accessibilityLabel={evidenceSpoken(item)}
        testID={testID}
        style={styles.evidence}
      >
        {body}
      </View>
    );
  const url = item.url;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={evidenceSpoken(item)}
      accessibilityHint={
        item.kind === 'register' ? 'Opens the register' : 'Opens the source'
      }
      testID={testID}
      onPress={() => openSource(url, citation)}
      style={({ pressed }) => [
        styles.evidence,
        pressed ? styles.pressed : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

/**
 * A pattern in the record, always a lead and never a finding (P1). The
 * export's sentences and every caveat appear verbatim and in full: this
 * component never shortens, reorders or rewords them. Reading order is the
 * title, each metric as "label, value", every caveat, then the evidence.
 * With a `testID`, its parts carry `<testID>-title`, `-metric-N`,
 * `-caveat-N`, `-evidence-N` and `-as-at`.
 */
export function LeadCard({
  lead,
  category,
  asAt,
  testID,
}: {
  lead: Lead;
  /** The web's category name: "Companies in both", "Government contracts". */
  category: string;
  asAt?: AsAt;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const part = (name: string) => (testID ? `${testID}-${name}` : undefined);
  return (
    <View testID={testID} style={styles.card}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`Lead, ${category}. ${lead.title}`}
        testID={part('title')}
        style={styles.head}
      >
        <Text variant="kicker">Lead · {category}</Text>
        <Text wordSafe variant="subheading">
          {lead.title}
        </Text>
      </View>
      {lead.summary ? (
        <Text wordSafe variant="body" testID={part('summary')}>
          {lead.summary}
        </Text>
      ) : null}
      <View>
        {lead.metrics.map((metric, index) => {
          const { text, spoken } = leadMetricText(metric);
          return (
            <View key={`${metric.label}-${index}`}>
              {index > 0 ? <Divider variant="subtle" /> : null}
              <View
                accessible
                accessibilityLabel={`${metric.label}, ${spoken}`}
                testID={part(`metric-${index}`)}
                style={[styles.metric, stacked ? styles.metricStacked : null]}
              >
                <Text
                  variant="figureInline"
                  style={stacked ? null : styles.metricValue}
                >
                  {text}
                </Text>
                <Text wordSafe variant="metadata" style={styles.grow}>
                  {metric.label}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.caveats}>
        {lead.caveats.map((caveat, index) => (
          <Text
            key={index}
            wordSafe
            variant="fine"
            tone="ink"
            testID={part(`caveat-${index}`)}
          >
            {caveat}
          </Text>
        ))}
      </View>
      {lead.evidence.length ? (
        <View>
          <Text variant="kicker">
            Example records ({formatCount(lead.evidence.length)})
          </Text>
          {lead.evidence.map((item, index) => (
            <View key={index}>
              {index > 0 ? <Divider variant="subtle" /> : null}
              <LeadEvidenceLink
                item={item}
                testID={part(`evidence-${index}`)}
              />
            </View>
          ))}
        </View>
      ) : null}
      {asAt ? <AsAtLine {...asAt} testID={part('as-at')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.s4 },
  head: { gap: spacing.s1 },
  metric: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.s4,
    paddingVertical: spacing.s3,
  },
  metricStacked: { flexDirection: 'column', gap: spacing.s1 },
  metricValue: { minWidth: 140 },
  grow: { flex: 1 },
  caveats: { gap: spacing.s3 },
  evidence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: minimumTarget,
    paddingVertical: spacing.s3,
  },
  evidenceText: { flex: 1, gap: spacing.s1 },
  pressed: { backgroundColor: colors.sunken },
});
