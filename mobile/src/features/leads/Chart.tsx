import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  counted,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
} from '../../design/format';
import { LinkRow, Text } from '../../design/primitives';
import {
  accents,
  chartRoles,
  colors,
  isAccessibilityCategory,
  minimumTarget,
  radii,
  rhythm,
} from '../../design/tokens';
import { chartRowLabel, type ChartRow, type LeadComparison } from './model';

type Concentration = Extract<LeadComparison, { type: 'concentration' }>;

/**
 * A concentration's share chart: the five largest named participants and
 * the rest, each a bar on a common 0 to 100% scale with its amount and
 * share in words beside it. The bars are a picture of the rows, not links
 * (the lead's subject row and its example records are the ways on). "Show
 * as table" lists the same rows to the dollar, with record counts.
 */
export function ConcentrationChart({
  comparison,
  testID,
}: {
  comparison: Concentration;
  testID: string;
}) {
  const [table, setTable] = useState(false);
  const [tableWidth, setTableWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  // Two real columns only when both have room. Measure the table rather
  // than the window so iPad panes and readable columns follow the same rule.
  const stacked =
    isAccessibilityCategory(fontScale) || tableWidth < 600 * fontScale;
  return (
    <View testID={testID} style={styles.chart}>
      {table ? (
        <View
          testID={`${testID}-table`}
          onLayout={(event) => setTableWidth(event.nativeEvent.layout.width)}
        >
          {comparison.rows.map((row, index) => {
            const value = [
              formatMoney(row.value),
              formatPercent(row.share),
              row.records === null
                ? null
                : `${counted(row.records, 'record', 'records')}`,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View
                key={`${row.name}-${index}`}
                accessible
                accessibilityLabel={`${row.name}, ${value}`}
                testID={`${testID}-cell-${index}`}
                style={[
                  styles.tableRow,
                  stacked ? styles.stackedRow : styles.columns,
                ]}
              >
                <Text
                  wordSafe
                  variant="body"
                  style={stacked ? undefined : styles.column}
                >
                  {row.name}
                </Text>
                <Text
                  wordSafe
                  variant="strong"
                  tabular
                  style={stacked ? undefined : [styles.column, styles.value]}
                >
                  {value}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View testID={`${testID}-bars`}>
          {comparison.rows.map((row, index) => (
            <ChartBar
              key={`${row.name}-${index}`}
              row={row}
              testID={`${testID}-row-${index}`}
            />
          ))}
        </View>
      )}
      <LinkRow
        title={table ? 'Show as chart' : 'Show as table'}
        accessory="none"
        onPress={() => setTable((t) => !t)}
        testID="lead-table-toggle"
      />
    </View>
  );
}

function ChartBar({ row, testID }: { row: ChartRow; testID: string }) {
  return (
    <View
      accessible
      accessibilityLabel={chartRowLabel(row)}
      testID={testID}
      style={styles.bar}
    >
      <View style={styles.barLabel}>
        <Text
          wordSafe
          variant={row.other ? 'body' : 'strong'}
          style={styles.grow}
        >
          {row.name}
        </Text>
        <Text variant="strong" tabular>
          {formatMoneyCompact(row.value)}
        </Text>
        <Text variant="footnote" tabular>
          {formatPercent(row.share)}
        </Text>
      </View>
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
              backgroundColor: row.other
                ? colors[chartRoles.contrast]
                : colors[accents.money.ink],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: rhythm.tight },
  tableRow: { minHeight: minimumTarget, paddingVertical: rhythm.row },
  stackedRow: { flexDirection: 'column', gap: rhythm.line },
  columns: { flexDirection: 'row', alignItems: 'baseline', gap: rhythm.block },
  column: { flex: 1, minWidth: 0 },
  value: { textAlign: 'right' },
  grow: { flexGrow: 1, flexShrink: 1 },
  bar: {
    minHeight: minimumTarget,
    paddingVertical: rhythm.tight,
    gap: rhythm.line,
  },
  barLabel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: rhythm.tight,
  },
  track: {
    height: 8,
    borderRadius: radii.bar,
    backgroundColor: colors[chartRoles.baseline],
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  fill: { height: 8 },
});
