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
  Platform,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ViewProps,
} from 'react-native';
import { useAccessibilitySize } from './accessibility';
import {
  RegionProvider,
  SidebarSafe,
  columns,
  readableInset,
  useLayout,
  useMeasuredRegion,
} from './adaptive';
import { Divider } from './controls';
import { InfoButton, type InfoNotes } from './info';
import { ROW_OWNS_PADDING } from './row-padding';
import { Heading, Text, type TextTone } from './text';
import {
  accents,
  colors,
  light,
  hairline,
  layout,
  rhythm,
  spacing,
  type Accent,
} from './tokens';
import { usePaneBar } from './split';
import { useStableKeyboard } from './useStableKeyboard';

/**
 * The column a screen's content sits in. On compact width (every iPhone,
 * and a narrow iPad window) content runs edge to edge inside the 20pt
 * margin, as before. On regular width it is centred at `readable` (700pt,
 * long text) or `wide` (1180pt, front pages and grids), and the children
 * read the column's width from `useLayout()`. Screens built on a FlatList
 * use it directly: `onLayout` on the list, `content` in its
 * contentContainerStyle, `inner` in a `RegionProvider` around the rows, and
 * `bar` (a split pane's Back and actions, or null) first in the header.
 */
export function useScreenColumn(column: keyof typeof columns = 'readable') {
  const [onLayout, region] = useMeasuredRegion();
  const outer = useLayout();
  const width = region?.width ?? outer.width;
  const inset = readableInset(width, columns[column]);
  const content =
    inset === layout.screenMargin ? null : { paddingHorizontal: inset };
  const inner = region
    ? { width: region.width - inset * 2, height: region.height }
    : null;
  // Inside a split pane: its Back and actions, first in the content.
  const bar = usePaneBar();
  return { onLayout, content, inner, bar };
}

/**
 * A scrolling screen on paper, under the native navigation bar. It is the
 * first scroll view in the screen, so the large title collapses and the
 * content clears the bars. Root screens take their title from the stack.
 * On iPad regular width its content is a centred column (`column`).
 */
export function Screen({
  testID,
  children,
  refreshControl,
  scrollRef,
  column = 'readable',
}: {
  testID?: string;
  scrollRef?: Ref<ScrollView>;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** The content column on regular width: `readable` (700pt) or `wide`. */
  column?: keyof typeof columns;
}) {
  const { onLayout, content, inner, bar } = useScreenColumn(column);
  return (
    <SidebarSafe style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        testID={testID}
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl}
        contentContainerStyle={[styles.content, content]}
        onLayout={onLayout}
      >
        <RegionProvider value={inner}>
          {bar}
          {children}
        </RegionProvider>
      </ScrollView>
    </SidebarSafe>
  );
}

/** The form owns keyboard space; UIKit retains navigation/tab insets. */
export function KeyboardStableScreen({
  testID,
  children,
  refreshControl,
  keyboardTarget,
  scrollRef,
  column = 'readable',
}: {
  testID?: string;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  keyboardTarget: RefObject<View | null>;
  scrollRef?: RefObject<ScrollView | null>;
  column?: keyof typeof columns;
}) {
  const ownScroll = useRef<ScrollView>(null);
  const scroll = scrollRef ?? ownScroll;
  const keyboard = useStableKeyboard(scroll, keyboardTarget);
  const { onLayout, content, inner, bar } = useScreenColumn(column);
  return (
    <SidebarSafe style={styles.screen}>
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
        contentContainerStyle={[styles.content, content, keyboard.contentStyle]}
        onLayout={(event) => {
          onLayout(event);
          keyboard.onLayout(event);
        }}
        onScroll={keyboard.onScroll}
        scrollEventThrottle={16}
      >
        <RegionProvider value={inner}>
          {bar}
          {children}
        </RegionProvider>
      </ScrollView>
    </SidebarSafe>
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
 * A major section: a default rule, then a serif heading, an optional ⓘ for
 * the block's methodology and caveats, and an optional trailing action ("All
 * bills"). No card, filled box or icon tile marks the boundary; the rule and
 * the heading do (TestFlight, 8 Oct: an icon on a section heading is too
 * busy). A category `accent` draws a short 2pt mark in its ink over the
 * start of the rule. Heading to content is 12pt; blocks inside step 16pt.
 */
export function Section({
  title,
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
  /** The category's accent, as a short mark over the rule. */
  accent?: Accent;
  /** Long notes behind an ⓘ: methodology and caveats, shown in full there. */
  info?: InfoNotes & { testID?: string };
  /** A trailing link such as "All bills". */
  action?: ReactNode;
  children: ReactNode;
  testID?: string;
  headingTestID?: string;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View
      testID={testID}
      style={[styles.section, rule ? null : styles.unruled]}
    >
      {rule && accent ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.accentMark,
            { backgroundColor: colors[accents[accent].ink] },
          ]}
        />
      ) : null}
      {title || action || info ? (
        stacked && title && (action || (info && Platform.OS !== 'android')) ? (
          // At accessibility sizes the title takes the whole line and the
          // ⓘ and action sit on their own line below: a large "See all"
          // never squeezes the heading into a narrow column.
          <View style={styles.sectionHeadStacked}>
            <Heading level={2} testID={headingTestID}>
              {title}
            </Heading>
            <View style={styles.sectionTools}>
              {/* A column of fixed width for the action's word-safe label. */}
              {action ? <View style={styles.grow}>{action}</View> : null}
              {info ? <InfoButton {...info} /> : null}
            </View>
          </View>
        ) : (
          <View style={[styles.sectionHead, styles.sectionHeadSpaced]}>
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
        )
      ) : null}
      {children}
    </View>
  );
}

/**
 * A soft fade over the top edge of a scrolling panel, from the paper to
 * clear, so lines that have scrolled up read as "more above" rather than cut
 * off. Decorative; place it last inside a relatively positioned wrapper.
 */
export function EdgeFade({
  height = 32,
  testID,
}: {
  height?: number;
  testID?: string;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[
        styles.fade,
        {
          height,
          experimental_backgroundImage: `linear-gradient(to bottom, ${light.paper} 0%, ${light.paper}00 100%)`,
        },
      ]}
    />
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
  // Sits over the start of the hairline rule, which it replaces there.
  accentMark: {
    position: 'absolute',
    top: -hairline - 0.5,
    left: 0,
    width: 28,
    height: 2,
    borderRadius: 1,
  },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  // Heading to content is 12pt: the section's 16pt gap, less 4.
  sectionHeadSpaced: { marginBottom: rhythm.heading - rhythm.block },
  sectionHeadStacked: {
    gap: rhythm.line,
    marginBottom: rhythm.heading - rhythm.block,
  },
  sectionTools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
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
