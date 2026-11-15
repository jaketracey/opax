import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAccessibilitySize } from '../../design/accessibility';
import { ColumnWidth, useLayout } from '../../design/adaptive';
import { activeVerticalFold } from '../../design/fold';
import { ReservedRegionArea, useReservedRegions } from '../../design/fold-area';
import { rhythm } from '../../design/tokens';
import { todayColumns, type TodayOrder, type TodaySlot } from './order';

/**
 * One column on iPhone. Two columns from the split breakpoint on a regular
 * phone (iPhone Duo), in even halves, and on iPad at 900 pt and wider, 3:2.
 * The leading column carries the day's record, the trailing one the
 * reader's own (`todayColumns`). One column at accessibility sizes.
 */
export function TodayBody({
  order,
  slot,
}: {
  order: TodayOrder;
  slot: (name: TodaySlot) => ReactNode;
}) {
  const layout = useLayout();
  const large = useAccessibilitySize();
  const phone = layout.rule === 'phone-regular';
  const spread = phone ? layout.split : layout.regular && layout.width >= 900;
  if (!spread || large)
    return <View style={styles.column}>{order.slots.map(slot)}</View>;
  const { leading, trailing } = todayColumns(order);
  return (
    <View style={styles.column} testID="today-spread">
      <ReservedRegionArea>
        <TodaySpread
          leading={leading.map(slot)}
          trailing={trailing.map(slot)}
          even={phone}
        />
      </ReservedRegionArea>
      {slot('foot')}
    </View>
  );
}

/**
 * The iPad spread retains its 3:2 measure until a fold calls for an even
 * split. A regular phone's halves are always even: its cards are phone
 * cards, and its grids prefer an even split (duo/SPEC.md 5).
 */
function TodaySpread({
  leading,
  trailing,
  even = false,
}: {
  leading: ReactNode;
  trailing: ReactNode;
  even?: boolean;
}) {
  const { width } = useLayout();
  const { divisions } = useReservedRegions();
  const fold = activeVerticalFold(divisions);
  const gap = fold
    ? Math.max(32, width - 2 * fold.x, 2 * (fold.x + fold.width) - width)
    : 32;
  // Each side's width follows from the page's and the gap, as flex will
  // lay it out (3:2, or even halves). The sides say so to what they hold,
  // so a grid in one is the right size in its first frame (ColumnWidth).
  const [lead, trail] = todaySpreadWidths(width, gap, !!fold || even);
  return (
    <View style={[styles.columns, { gap }]}>
      <View
        style={[styles.column, fold || even ? styles.even : styles.leading]}
        testID="today-spread-leading"
      >
        <ColumnWidth width={lead}>{leading}</ColumnWidth>
      </View>
      <View
        style={[styles.column, fold || even ? styles.even : styles.trailing]}
        testID="today-spread-trailing"
      >
        <ColumnWidth width={trail}>{trailing}</ColumnWidth>
      </View>
    </View>
  );
}

/** The spread's two widths in a page `width` wide: 3:2, or even halves. */
export function todaySpreadWidths(
  width: number,
  gap: number,
  even: boolean,
): [number, number] {
  const room = Math.max(0, width - gap);
  return even ? [room / 2, room / 2] : [(room * 3) / 5, (room * 2) / 5];
}

const styles = StyleSheet.create({
  // Top-level blocks: section (36).
  column: { gap: rhythm.section },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  even: { flex: 1, minWidth: 0 },
  leading: { flex: 3, minWidth: 0 },
  trailing: { flex: 2, minWidth: 0 },
});
