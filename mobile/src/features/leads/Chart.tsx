import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Group,
  Heading,
  Icon,
  RowList,
  SegmentedControl,
  StatRow,
  Text,
} from '../../design/primitives';
import {
  formatCount,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  moneyAccessibilityLabel,
} from '../../design/format';
import { colors, minimumTarget, radius, spacing } from '../../design/tokens';
import { useAccessibilitySize } from '../../design/accessibility';
import { openOnWeb, webPageUrl } from '../../navigation/external';
import { chartRowLabel, type ChartRow, type LeadComparison } from './model';

type Concentration = Extract<LeadComparison, { type: 'concentration' }>;
type Overlap = Extract<LeadComparison, { type: 'overlap' }>;

/**
 * The web's share chart (app.js discoveryChartHTML): the five largest named
 * participants and the remainder, each as a bar on a common 0 to 100% scale.
 * Each row is one VoiceOver element with its name, amount and share; the
 * bars are decorative. A supplier's row opens its profile on opax.com.au, as
 * the web's chart links it. "Table" shows the same rows to the dollar, with
 * record counts.
 */
export function ConcentrationChart({
  comparison,
  testID,
}: {
  comparison: Concentration;
  testID: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const stacked = useAccessibilitySize();
  return (
    <Group testID={testID}>
      <View style={[styles.head, stacked ? styles.headStacked : null]}>
        <Heading level={2} style={styles.grow}>
          {comparison.chartTitle}
        </Heading>
        <Text
          wordSafe
          variant="figureInline"
          accessibilityLabel={`${moneyAccessibilityLabel(comparison.total, true)} total`}
          testID={`${testID}-total`}
        >
          {formatMoneyCompact(comparison.total)} total
        </Text>
      </View>
      <SegmentedControl
        segments={[
          { value: 'chart', label: 'Chart', testID: `${testID}-show-chart` },
          { value: 'table', label: 'Table', testID: `${testID}-show-table` },
        ]}
        value={view}
        onChange={setView}
        testID={`${testID}-view`}
      />
      {view === 'chart' ? (
        <View testID={`${testID}-bars`}>
          {comparison.rows.map((row, index) => (
            <ChartBar
              key={`${row.name}-${index}`}
              row={row}
              testID={`${testID}-row-${index}`}
            />
          ))}
        </View>
      ) : (
        <RowList>
          {comparison.rows.map((row, index) => {
            const records =
              row.records === null
                ? null
                : `${formatCount(row.records)} ${row.records === 1 ? 'record' : 'records'}`;
            return (
              <View
                key={`${row.name}-${index}`}
                accessible
                accessibilityLabel={[
                  row.name,
                  `value ${moneyAccessibilityLabel(row.value)}`,
                  `share ${formatPercent(row.share).slice(0, -1)} percent`,
                  records,
                ]
                  .filter(Boolean)
                  .join(', ')}
                testID={`${testID}-cell-${index}`}
                style={styles.cell}
              >
                <Text wordSafe variant="strong">
                  {row.name}
                </Text>
                <Text wordSafe variant="figureInline">
                  {formatMoney(row.value)}
                </Text>
                <Text wordSafe variant="metadata">
                  {[`${formatPercent(row.share)} of the total`, records]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            );
          })}
        </RowList>
      )}
    </Group>
  );
}

function ChartBar({ row, testID }: { row: ChartRow; testID: string }) {
  // Only a supplier profile the link guard accepts becomes a link.
  const path =
    row.supplierPath && webPageUrl(row.supplierPath) ? row.supplierPath : null;
  const body = (
    <>
      <View style={styles.barText}>
        <View style={styles.barLabel}>
          <Text
            wordSafe
            variant={row.other ? 'body' : 'strong'}
            style={styles.grow}
          >
            {row.name}
          </Text>
          {path ? <Icon name="safari" size={16} tone="bronzeInk" /> : null}
        </View>
        <Text wordSafe variant="figureInline">
          {formatMoneyCompact(row.value)} · {formatPercent(row.share)}
        </Text>
        <View
          style={styles.track}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={[
              styles.fill,
              {
                width: `${Math.max(0, Math.min(100, row.share))}%`,
                backgroundColor: row.other ? colors.inkSoft : colors.navy,
              },
            ]}
          />
        </View>
      </View>
    </>
  );
  if (!path)
    return (
      <View
        accessible
        accessibilityLabel={chartRowLabel(row)}
        testID={testID}
        style={styles.bar}
      >
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={chartRowLabel(row)}
      accessibilityHint="Opens the supplier profile on opax.com.au"
      testID={testID}
      onPress={() => openOnWeb(path, row.name)}
      style={({ pressed }) => [styles.bar, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  );
}

/**
 * Companies in both: the two recorded money flows side by side, never summed
 * (app.js discoveryDetailHTML, "Separate recorded money flows").
 */
export function OverlapFlows({
  comparison,
  testID,
}: {
  comparison: Overlap;
  testID: string;
}) {
  const flows = [
    { label: 'Party receipts', ...comparison.receipts, id: 'receipts' },
    { label: 'Government contracts', ...comparison.contracts, id: 'contracts' },
  ];
  return (
    <View testID={testID}>
      <StatRow
        stats={flows.map((flow) => {
          const records = `${formatCount(flow.records)} ${flow.records === 1 ? 'record' : 'records'}`;
          return {
            value: formatMoneyCompact(flow.value),
            valueLabel: moneyAccessibilityLabel(flow.value, true),
            label: `${flow.label} · ${records}`,
            testID: `${testID}-${flow.id}`,
          };
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  headStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  grow: { flexGrow: 1, flexShrink: 1 },
  bar: {
    minHeight: minimumTarget,
    paddingVertical: spacing.s3,
  },
  barText: { gap: spacing.s1 },
  barLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  track: {
    height: 8,
    borderRadius: radius,
    backgroundColor: colors.sunken,
    overflow: 'hidden',
    marginTop: spacing.s1,
  },
  fill: { height: 8 },
  pressed: { backgroundColor: colors.raised },
  cell: { gap: spacing.s1 },
});
