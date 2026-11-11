import type { Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  counted,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
} from '../../design/format';
import { Icon } from '../../design/icon';
import { LinkRow, RowLink, Text } from '../../design/primitives';
import { symbols } from '../../design/symbols';
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

// Narrowest table width in points at scale 1 where name and value columns both fit without wrapping the value into a squeezed column.
const MIN_TWO_COLUMN_TABLE_WIDTH = 600;

/**
 * A concentration's share chart: the five largest named participants and
 * the rest, each a bar on a common 0 to 100% scale with its amount and
 * share in words beside it. Resolved suppliers open their records, and
 * Other opens the agency's supplier list. "Show as table" retains those
 * destinations and lists the same rows to the dollar, with record counts.
 */
export function ConcentrationChart({
  comparison,
  rowHref,
  testID,
}: {
  comparison: Concentration;
  rowHref?: (row: ChartRow) => Href | null;
  testID: string;
}) {
  const [table, setTable] = useState(false);
  const [tableWidth, setTableWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  // Two real columns only when both have room. Measure the table rather
  // than the window so iPad panes and readable columns follow the same rule.
  const stacked =
    isAccessibilityCategory(fontScale) ||
    tableWidth < MIN_TWO_COLUMN_TABLE_WIDTH * fontScale;
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
              <ChartRowTarget
                key={`${row.name}-${index}`}
                href={rowHref?.(row)}
                label={`${row.name}, ${value}`}
                testID={`${testID}-cell-${index}`}
              >
                <View
                  testID={`${testID}-cell-${index}-layout`}
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
              </ChartRowTarget>
            );
          })}
        </View>
      ) : (
        <View testID={`${testID}-bars`}>
          {comparison.rows.map((row, index) => (
            <ChartBar
              key={`${row.name}-${index}`}
              row={row}
              href={rowHref?.(row)}
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

/** A single accessible target, with the app's standard record navigation. */
function ChartRowTarget({
  href,
  label,
  testID,
  children,
}: {
  href?: Href | null;
  label: string;
  testID: string;
  children: ReactNode;
}) {
  const content = (
    <>
      <View style={styles.content}>{children}</View>
      {href ? (
        <Icon name={symbols.chevron} size={13} maxScale={1.5} tone="inkSoft" />
      ) : null}
    </>
  );
  return href ? (
    <RowLink href={href} preview={false}>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={label}
        testID={testID}
        style={({ pressed }) => [
          styles.target,
          pressed ? { backgroundColor: colors.sunken } : null,
        ]}
      >
        {content}
      </Pressable>
    </RowLink>
  ) : (
    <View
      accessible
      accessibilityLabel={label}
      testID={testID}
      style={styles.target}
    >
      {content}
    </View>
  );
}

function ChartBar({
  row,
  href,
  testID,
}: {
  row: ChartRow;
  href?: Href | null;
  testID: string;
}) {
  return (
    <ChartRowTarget href={href} label={chartRowLabel(row)} testID={testID}>
      <View style={styles.bar}>
        <View style={styles.barLabel} testID={`${testID}-label`}>
          <Text
            wordSafe
            variant={row.other ? 'body' : 'strong'}
            style={styles.grow}
          >
            {row.name}
          </Text>
          <View style={styles.figures} testID={`${testID}-figures`}>
            <Text
              variant="strong"
              tabular
              numberOfLines={1}
              style={styles.figure}
            >
              {formatMoneyCompact(row.value)}
            </Text>
            <Text
              variant="footnote"
              tabular
              numberOfLines={1}
              style={styles.figure}
            >
              {formatPercent(row.share)}
            </Text>
          </View>
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
    </ChartRowTarget>
  );
}

const styles = StyleSheet.create({
  chart: { gap: rhythm.tight },
  target: {
    minHeight: minimumTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  content: { flex: 1, minWidth: 0 },
  tableRow: { minHeight: minimumTarget, paddingVertical: rhythm.row },
  stackedRow: { flexDirection: 'column', gap: rhythm.line },
  columns: { flexDirection: 'row', alignItems: 'baseline', gap: rhythm.block },
  column: { flex: 1, minWidth: 0 },
  value: { textAlign: 'right' },
  grow: { flex: 1, minWidth: 0 },
  bar: {
    minHeight: minimumTarget,
    paddingVertical: rhythm.tight,
    gap: rhythm.line,
  },
  barLabel: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  figures: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    flexShrink: 0,
    alignItems: 'baseline',
    gap: rhythm.tight,
  },
  figure: { flexShrink: 0 },
  track: {
    height: 8,
    borderRadius: radii.bar,
    backgroundColor: colors[chartRoles.baseline],
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  fill: { height: 8 },
});
