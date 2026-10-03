import { StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from './accessibility';
import { Divider } from './controls';
import {
  formatCount,
  formatMoney,
  formatPercent,
  moneyAccessibilityLabel,
} from './format';
import { SourceLink, AsAtLine } from './record';
import { Text } from './text';
import { spacing } from './tokens';
import type { AsAt } from './format';

// The shape of one signal in /discovery.json.
export interface LeadMetric {
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percent';
}
export interface LeadEvidence {
  label: string;
  url: string;
  link_scope: 'source_register' | 'record' | string;
  record_id?: string;
}
export interface Lead {
  id: string;
  title: string;
  summary?: string;
  metrics: LeadMetric[];
  evidence: LeadEvidence[];
  caveats: string[];
}

function metricText(metric: LeadMetric): { text: string; spoken: string } {
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

/**
 * A pattern in the record, always a lead and never a finding (P1). The
 * export's sentences and every caveat appear verbatim and in full: this
 * component never shortens, reorders or rewords them. Reading order is the
 * title, each metric as "label, value", every caveat, then the evidence.
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
  return (
    <View testID={testID} style={styles.card}>
      <View accessible accessibilityRole="header" style={styles.head}>
        <Text variant="kicker">Lead · {category}</Text>
        <Text variant="subheading">{lead.title}</Text>
      </View>
      {lead.summary ? <Text variant="body">{lead.summary}</Text> : null}
      <View>
        {lead.metrics.map((metric, index) => {
          const { text, spoken } = metricText(metric);
          return (
            <View key={`${metric.label}-${index}`}>
              {index > 0 ? <Divider variant="subtle" /> : null}
              <View
                accessible
                accessibilityLabel={`${metric.label}, ${spoken}`}
                style={[styles.metric, stacked ? styles.metricStacked : null]}
              >
                <Text
                  variant="figureInline"
                  style={stacked ? null : styles.metricValue}
                >
                  {text}
                </Text>
                <Text variant="metadata" style={styles.grow}>
                  {metric.label}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.caveats}>
        {lead.caveats.map((caveat, index) => (
          <Text key={index} variant="fine" tone="ink">
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
            <SourceLink
              key={`${item.url}-${index}`}
              citation={item.label}
              url={item.url}
              kind={
                item.link_scope === 'source_register' ? 'register' : 'record'
              }
            />
          ))}
        </View>
      ) : null}
      {asAt ? <AsAtLine {...asAt} /> : null}
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
});
