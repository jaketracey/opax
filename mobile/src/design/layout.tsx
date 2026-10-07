import {
  Children,
  isValidElement,
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
import type { SFSymbol } from './icon';
import { InfoButton, type InfoNotes } from './info';
import { ROW_OWNS_PADDING } from './row-padding';
import { IconTile } from './rows';
import { Heading, Text, type TextTone } from './text';
import {
  accents,
  colors,
  hairline,
  layout,
  rhythm,
  spacing,
  type Accent,
} from './tokens';
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

/** The form owns keyboard space; UIKit retains navigation/tab insets. */
export function KeyboardStableScreen({
  testID,
  children,
  refreshControl,
  keyboardTarget,
  scrollRef,
}: {
  testID?: string;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  keyboardTarget: RefObject<View | null>;
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const ownScroll = useRef<ScrollView>(null);
  const scroll = scrollRef ?? ownScroll;
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
 * A major section: a default rule, then a header with an optional tinted
 * symbol tile (the category's accent), a serif heading, an optional ⓘ for
 * the block's methodology and caveats, and an optional trailing action ("All
 * bills"). No card or filled box marks the boundary; the rule and the
 * heading do. Heading to content is 12pt; blocks inside step 16pt.
 */
export function Section({
  title,
  icon,
  accent,
  info,
  action,
  children,
  testID,
  headingTestID,
  rule = true,
}: {
  /** False for the first section under a sheet's bar: no top rule. */
  rule?: boolean;
  title?: string;
  /** An SF Symbol for the section's subject, tinted with the accent. */
  icon?: SFSymbol;
  accent?: Accent;
  /** Long notes behind an ⓘ: methodology and caveats, shown in full there. */
  info?: InfoNotes & { testID?: string };
  /** A trailing link such as "All bills". */
  action?: ReactNode;
  children: ReactNode;
  testID?: string;
  headingTestID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[styles.section, rule ? null : styles.unruled]}
    >
      {title || action || info ? (
        <View style={styles.sectionHead}>
          {icon && title ? (
            <IconTile name={icon} accent={accent} size="section" />
          ) : null}
          {title ? (
            <Heading level={2} style={styles.grow} testID={headingTestID}>
              {title}
            </Heading>
          ) : (
            <View style={styles.grow} />
          )}
          {info ? <InfoButton {...info} /> : null}
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

/**
 * Rows separated by subtle hairlines: 10pt either side of content, 2pt
 * either side of a control row (LinkRow, Disclosure, PersonRow, a web link)
 * that carries its own 44pt height and padding, so a one-line row is 48pt.
 */
export function RowList({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View>
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 ? <Divider variant="subtle" /> : null}
          <View style={ownsPadding(row) ? styles.controlRow : styles.row}>
            {row}
          </View>
        </View>
      ))}
    </View>
  );
}
function ownsPadding(row: ReactNode) {
  if (!isValidElement(row) || typeof row.type === 'string') return false;
  return !!(row.type as unknown as Record<symbol, boolean>)[ROW_OWNS_PADDING];
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
export function StatRow({
  stats,
  accent,
}: {
  stats: readonly Stat[];
  /** Tints the figures with a category accent. */
  accent?: Accent;
}) {
  const stacked = useAccessibilitySize();
  const tone = accent ? (accents[accent].ink as TextTone) : undefined;
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
          <Text variant="figure" tone={tone}>
            {stat.value}
          </Text>
          <Text wordSafe variant="metadata">
            {stat.label}
          </Text>
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
    gap: rhythm.block,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerDefault,
    paddingTop: rhythm.block + rhythm.line,
  },
  unruled: { borderTopWidth: 0, paddingTop: 0 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading - rhythm.line,
    // Heading to content is 12pt: the section's 16pt gap, less 4.
    marginBottom: rhythm.heading - rhythm.block,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  subsection: {
    gap: rhythm.tight,
    marginTop: layout.subGap - rhythm.block,
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
    paddingTop: rhythm.heading,
  },
  row: { paddingVertical: layout.rowGap },
  controlRow: { paddingVertical: 2 },
  kvInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s4,
  },
  kvStacked: { gap: spacing.s1 },
  kvLabel: { flex: 1 },
  kvValue: { textAlign: 'right', flexShrink: 1, maxWidth: '60%' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: rhythm.block },
  statsStacked: { flexDirection: 'column' },
  stat: { minWidth: 96, flexGrow: 1, flexBasis: 96, gap: 2 },
});
