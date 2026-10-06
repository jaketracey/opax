import {
  Children,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ViewProps,
} from 'react-native';
import { useAccessibilitySize } from './accessibility';
import { Divider } from './controls';
import { Heading, Text } from './text';
import { colors, hairline, layout, spacing } from './tokens';
import { useStableKeyboard } from './useStableKeyboard';

/**
 * A scrolling screen on paper, under the native navigation bar. It is the
 * first scroll view in the screen, so the large title collapses and the
 * content clears the bars. Root screens take their title from the stack.
 */
export function Screen({
  testID,
  children,
  refreshControl,
  scrollRef,
}: {
  testID?: string;
  scrollRef?: Ref<ScrollView>;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  return (
    <ScrollView
      ref={scrollRef}
      testID={testID}
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      refreshControl={refreshControl}
      contentContainerStyle={styles.content}
    >
      {children}
    </ScrollView>
  );
}

/** Search's form owns keyboard space; UIKit retains navigation/tab insets. */
export function KeyboardStableScreen({
  testID,
  children,
  refreshControl,
  keyboardTarget,
}: {
  testID?: string;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  keyboardTarget: RefObject<View | null>;
}) {
  const scroll = useRef<ScrollView>(null);
  const keyboard = useStableKeyboard(scroll, keyboardTarget);
  return (
    <ScrollView
      ref={scroll}
      testID={testID}
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={false}
      scrollToOverflowEnabled
      keyboardDismissMode="on-drag"
      refreshControl={refreshControl}
      contentContainerStyle={[styles.content, keyboard.contentStyle]}
      onLayout={keyboard.onLayout}
      onScroll={keyboard.onScroll}
      scrollEventThrottle={16}
    >
      {children}
    </ScrollView>
  );
}

/** Vertical spacing for related items (16pt by default). */
export function Group({
  gap = spacing.s4,
  style,
  ...props
}: ViewProps & { gap?: number }) {
  return <View {...props} style={[{ gap }, style]} />;
}

/**
 * A major section: a default rule, a serif heading and its content. No card
 * or filled box marks the boundary; the rule and the heading do.
 */
export function Section({
  title,
  action,
  children,
  testID,
}: {
  title?: string;
  /** A trailing link such as "All bills". */
  action?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.section}>
      {title || action ? (
        <View style={styles.sectionHead}>
          {title ? (
            <Heading level={2} style={styles.grow}>
              {title}
            </Heading>
          ) : null}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A second list within a section: subtle rule and a subsection heading. */
export function SubSection({
  title,
  children,
  testID,
}: {
  title: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.subsection}>
      <Heading level={3}>{title}</Heading>
      {children}
    </View>
  );
}

/** Rows separated by subtle hairlines, 8pt either side. */
export function RowList({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View>
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 ? <Divider variant="subtle" /> : null}
          <View style={styles.row}>{row}</View>
        </View>
      ))}
    </View>
  );
}

export interface KeyValue {
  label: string;
  value: string;
  /** Overrides "label, value" when the value needs words ("4,537,500 dollars"). */
  accessibilityLabel?: string;
  testID?: string;
}
/**
 * Facts as label and value. Side by side at ordinary sizes; stacked at
 * accessibility sizes so neither is squeezed.
 */
export function KeyValueList({ items }: { items: readonly KeyValue[] }) {
  const stacked = useAccessibilitySize();
  return (
    <RowList>
      {items.map((item) => (
        <View
          key={item.label}
          accessible
          accessibilityLabel={
            item.accessibilityLabel ?? `${item.label}, ${item.value}`
          }
          testID={item.testID}
          style={stacked ? styles.kvStacked : styles.kvInline}
        >
          <Text variant="metadata" style={stacked ? null : styles.kvLabel}>
            {item.label}
          </Text>
          <Text variant="figureInline" style={stacked ? null : styles.kvValue}>
            {item.value}
          </Text>
        </View>
      ))}
    </RowList>
  );
}

export interface Stat {
  value: string;
  label: string;
  /** What VoiceOver reads for the value: "4.2 million dollars". */
  valueLabel?: string;
  testID?: string;
}
/**
 * Figures with their labels, wrapping into a row of tiles; one per line at
 * accessibility sizes. Each tile reads "value, label".
 */
export function StatRow({ stats }: { stats: readonly Stat[] }) {
  const stacked = useAccessibilitySize();
  return (
    <View style={[styles.stats, stacked ? styles.statsStacked : null]}>
      {stats.map((stat) => (
        <View
          key={stat.label}
          accessible
          accessibilityLabel={`${stat.valueLabel ?? stat.value}, ${stat.label}`}
          testID={stat.testID}
          style={stacked ? null : styles.stat}
        >
          <Text variant="figure">{stat.value}</Text>
          <Text variant="metadata">{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s7,
    gap: layout.sectionGap,
  },
  section: {
    gap: spacing.s4,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerDefault,
    paddingTop: spacing.s4,
  },
  sectionHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  subsection: {
    gap: spacing.s3,
    marginTop: layout.subGap - spacing.s4,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
    paddingTop: spacing.s3,
  },
  row: { paddingVertical: layout.rowGap },
  kvInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s4,
  },
  kvStacked: { gap: spacing.s1 },
  kvLabel: { flex: 1 },
  kvValue: { textAlign: 'right', flexShrink: 1, maxWidth: '60%' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s4 },
  statsStacked: { flexDirection: 'column' },
  stat: { minWidth: 140, flexGrow: 1, flexBasis: 140, gap: spacing.s1 },
});
