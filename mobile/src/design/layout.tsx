import {
  Children,
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
  isValidElement,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import {
  ScrollView,
  Animated,
  useColorScheme,
  Pressable,
  Platform,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ViewProps,
} from 'react-native';
import { useReduceMotion, useAccessibilitySize } from './accessibility';
import {
  RegionProvider,
  Grid,
  isPad,
  SidebarSafe,
  columnBreakout,
  columns,
  useColumnChoice,
  useLayout,
  useMeasuredRegion,
} from './adaptive';
import { type InfoNotes } from './info';
import { type Href } from 'expo-router';
import {
  NavigationContext,
  HeaderHeightContext,
} from 'expo-router/react-navigation';
import { Icon } from './icon';
import { copy } from './copy';
import type { DateInput } from './format';
import { RowLink } from './row-link';
import { light, dark } from './palette';
import { designFlags } from './flags';
import { useInCard } from './card';
import {
  SurfaceContext,
  RowInsetContext,
  RowCellInsetContext,
} from './row-padding';
import { Heading, Text, type TextTone } from './text';
import {
  colors,
  accents,
  hairline,
  layout,
  rhythm,
  radii,
  minimumTarget,
  rhythmRegular,
  textStyles,
  motion,
  type Accent,
} from './tokens';
import { usePaneBar } from './split';
import { useStableKeyboard } from './useStableKeyboard';
import { useRefreshCommand } from './keyboard';

// The compatibility button's notes-only adapter now presents /rule.
export { InfoButton } from './info';

/**
 * The column a screen's content sits in. On compact width (every iPhone,
 * and a narrow iPad window) content uses the 16 or 20 pt screen margin. On regular width it is centred at `readable` (700pt,
 * long text) or `wide` (1180pt, front pages and grids), and the children
 * read the column's width from `useLayout()`. Screens built on a FlatList
 * use it directly: `onLayout` on the list, `content` in its
 * contentContainerStyle, `inner` in a `RegionProvider` around the rows, and
 * `bar` (a split pane's Back and actions, or null) first in the header.
 * `breakout` is how far a figure in a readable column may reach past each
 * side to fill the wide one (the money map's scene); 0 on compact.
 */
export function useScreenColumn(own: keyof typeof columns = 'readable') {
  const column = useColumnChoice(own);
  const [onLayout, region] = useMeasuredRegion();
  const outer = useLayout();
  const width = region?.width ?? outer.width;
  const regular = isPad && width >= columns.readable;
  const inset = regular
    ? Math.max(rhythmRegular.screen, Math.round((width - columns[column]) / 2))
    : width < 414
      ? 16
      : 20;
  const content = { paddingHorizontal: inset };
  const inner = region
    ? { width: region.width - inset * 2, height: region.height }
    : null;
  const breakout = columnBreakout(width, column);
  // Inside a split pane: its Back and actions, first in the content.
  const bar = usePaneBar();
  return { onLayout, content, inner, bar, breakout, regular };
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
  onScroll,
  column = 'readable',
  grouped = false,
  barTitle,
  offline,
}: {
  testID?: string;
  grouped?: boolean;
  barTitle?: string;
  offline?: { savedAt: DateInput | null } | null;
  scrollRef?: Ref<ScrollView>;
  onScroll?: (y: number) => void;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** The content column on regular width: `readable` (700pt) or `wide`. */
  column?: keyof typeof columns;
}) {
  const { onLayout, content, inner, bar, regular } = useScreenColumn(column);
  const ground = grouped && designFlags.groupedSurfaces ? 'sunken' : 'paper';
  const contentRoot = useRef<View>(null);
  const [anchorBottom, setAnchorBottom] = useState<number | null>(null);
  const titleScroll = useRef<TitleScrollHandler | null>(null);
  const suppliedBridge = useContext(ScreenTitleContext);
  const nativeBridge = useScreenBarTitle(barTitle, anchorBottom !== null);
  const titleBridge = suppliedBridge ?? nativeBridge;
  useEffect(() => {
    titleScroll.current =
      barTitle && titleBridge ? titleBridge(barTitle) : null;
  }, [barTitle, titleBridge]);
  useRefreshCommand(
    refreshControl?.props.onRefresh,
    !!refreshControl?.props.refreshing,
  );
  return (
    <SidebarSafe style={[styles.screen, { backgroundColor: colors[ground] }]}>
      <ScrollView
        ref={scrollRef}
        testID={testID}
        style={[styles.screen, { backgroundColor: colors[ground] }]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl}
        contentContainerStyle={[
          styles.content,
          content,
          regular ? { gap: rhythmRegular.section } : null,
        ]}
        onLayout={onLayout}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y;
          titleScroll.current?.(y, anchorBottom);
          onScroll?.(y);
        }}
        scrollEventThrottle={16}
      >
        <RegionProvider value={inner}>
          <SurfaceContext.Provider value={ground}>
            <TitleAnchorContext.Provider value={setAnchorBottom}>
              <TitleContentContext.Provider value={contentRoot}>
                <View
                  ref={contentRoot}
                  style={{
                    gap: regular ? rhythmRegular.section : rhythm.section,
                  }}
                >
                  {bar}
                  {anchorHeadings(withOffline(children, offline))}
                </View>
              </TitleContentContext.Provider>
            </TitleAnchorContext.Provider>
          </SurfaceContext.Provider>
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
  onScroll,
  column = 'readable',
}: {
  testID?: string;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  keyboardTarget: RefObject<View | null>;
  scrollRef?: RefObject<ScrollView | null>;
  /** The scroll offset, for a screen that scrolls a row into view itself. */
  onScroll?: (y: number) => void;
  column?: keyof typeof columns;
}) {
  const ownScroll = useRef<ScrollView>(null);
  const scroll = scrollRef ?? ownScroll;
  const keyboard = useStableKeyboard(scroll, keyboardTarget);
  const { onLayout, content, inner, bar } = useScreenColumn(column);
  useRefreshCommand(
    refreshControl?.props.onRefresh,
    !!refreshControl?.props.refreshing,
  );
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
        onScroll={(event) => {
          keyboard.onScroll(event);
          onScroll?.(event.nativeEvent.contentOffset.y);
        }}
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
  gap = rhythm.block,
  style,
  ...props
}: ViewProps & { gap?: number }) {
  return <View {...props} style={[{ gap }, style]} />;
}

export type SectionAction = {
  label?: string;
  accessibilityLabel: string;
  href?: Href;
  onPress?: () => void;
  testID?: string;
};
export function SectionHeader({
  title,
  action,
  testID,
  level = 2,
}: {
  title: string;
  action?: SectionAction;
  testID?: string;
  level?: 2 | 3;
}) {
  const stacked = useAccessibilitySize();
  const button = action ? (
    <Pressable
      accessibilityRole={action.href ? 'link' : 'button'}
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      testID={action.testID}
      style={({ pressed }) => [
        styles.sectionAction,
        pressed ? { backgroundColor: colors.sunken } : null,
      ]}
    >
      <Text wordSafe variant="strong" tone="navy">
        {action.label ?? 'See all'}
      </Text>
    </Pressable>
  ) : null;
  return (
    <View style={stacked ? styles.sectionHeadStacked : styles.sectionHead}>
      <Heading level={level} style={styles.grow} testID={testID}>
        {title}
      </Heading>
      {action?.href && button ? (
        <RowLink href={action.href}>{button}</RowLink>
      ) : (
        button
      )}
    </View>
  );
}
/** Section boundaries use space and a heading. Legacy props remain until wave 6. */
export function Section({
  title,
  action,
  children,
  testID,
  headingTestID,
}: {
  title?: string;
  action?: SectionAction | ReactNode;
  children: ReactNode;
  testID?: string;
  headingTestID?: string;
  /** @deprecated Section headers no longer draw a rule. */ rule?: boolean;
  /** @deprecated Use a SourceLine for notes. */ info?: InfoNotes & {
    testID?: string;
  };
  /** @deprecated Section headers have no accent. */ accent?: Accent;
}) {
  const isAction =
    action &&
    typeof action === 'object' &&
    !isValidElement(action) &&
    'accessibilityLabel' in action;
  return (
    <View testID={testID} style={styles.section}>
      {title ? (
        <SectionHeader
          title={title}
          action={isAction ? (action as SectionAction) : undefined}
          testID={headingTestID}
        />
      ) : null}
      {action && !isAction ? (action as ReactNode) : null}
      {children}
    </View>
  );
}
const InGroup = createContext(false);
function InsetRow({
  children,
  separator,
  grouped,
}: {
  children: ReactNode;
  separator: boolean;
  grouped: boolean;
}) {
  const [inset, setInset] = useState(16);
  return (
    <View>
      {separator ? (
        <View
          style={{
            marginLeft: grouped ? inset : 0,
            height: hairline,
            backgroundColor: colors.dividerSubtle,
          }}
        />
      ) : null}
      <View style={grouped ? { paddingHorizontal: 16 } : undefined}>
        <RowInsetContext.Provider value={setInset}>
          <RowCellInsetContext.Provider value={grouped ? 16 : 0}>
            {children}
          </RowCellInsetContext.Provider>
        </RowInsetContext.Provider>
      </View>
    </View>
  );
}
/** A short group of rows. Its surface comes from the enclosing Screen. */
export function InsetGroup({
  header,
  footer,
  children,
  testID,
}: {
  header?: string;
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const nested = useContext(InGroup);
  const inCard = useInCard();
  const surface = useContext(SurfaceContext);
  const rows = Children.toArray(children);
  const grouped = surface === 'sunken' && designFlags.groupedSurfaces;
  if (__DEV__ && (nested || inCard))
    console.warn(
      'InsetGroup is for a short list of rows, never inside a card or another group.',
    );
  return (
    <View testID={testID}>
      {header ? (
        <Text
          wordSafe
          variant="groupHeader"
          style={{ marginBottom: rhythm.groupHeader }}
        >
          {header}
        </Text>
      ) : null}
      <View style={grouped ? styles.insetGroup : undefined}>
        <InGroup.Provider value>
          <SurfaceContext.Provider value={grouped ? 'raised' : surface}>
            {rows.map((row, index) => (
              <InsetRow
                key={isValidElement(row) ? (row.key ?? index) : index}
                separator={index > 0}
                grouped={grouped}
              >
                {row}
              </InsetRow>
            ))}
          </SurfaceContext.Provider>
        </InGroup.Provider>
      </View>
      {footer ? (
        <View style={{ marginTop: rhythm.tight }}>
          {typeof footer === 'string' ? (
            <Text wordSafe variant="footnote">
              {footer}
            </Text>
          ) : (
            footer
          )}
        </View>
      ) : null}
    </View>
  );
}

/** A fallback for Screen; the shell may supply its shared title renderer. */
function ScreenBarTitle({ title, shown }: { title: string; shown: boolean }) {
  const reduced = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(shown ? 1 : 0));
  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: reduced ? 0 : motion.duration.crossfade,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, shown, reduced]);
  return (
    <Animated.Text
      numberOfLines={1}
      ellipsizeMode="tail"
      maxFontSizeMultiplier={1.353}
      allowFontScaling
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={{
        fontFamily: textStyles.inlineTitle.fontFamily,
        fontWeight: textStyles.inlineTitle.fontWeight,
        fontSize: textStyles.inlineTitle.fontSize,
        color: colors.ink,
        opacity,
      }}
    >
      {title}
    </Animated.Text>
  );
}
function useScreenBarTitle(title: string | undefined, anchored: boolean) {
  const navigation = useContext(NavigationContext);
  const header = useContext(HeaderHeightContext) || 44;
  const shown = useRef(false);
  useEffect(() => {
    if (title) navigation?.setOptions({ title });
  }, [navigation, title]);
  useEffect(() => {
    if (!title || !anchored) return;
    shown.current = false;
    navigation?.setOptions({
      headerTitle: () => <ScreenBarTitle title={title} shown={false} />,
    });
  }, [navigation, title, anchored]);
  return useCallback(
    (barTitle: string): TitleScrollHandler =>
      (y, bottom) => {
        if (bottom === null) return;
        const next = y + header > bottom;
        if (next === shown.current) return;
        shown.current = next;
        navigation?.setOptions(
          Platform.OS === 'android'
            ? { headerTitle: next ? barTitle : '' }
            : {
                headerTitle: () => (
                  <ScreenBarTitle title={barTitle} shown={next} />
                ),
              },
        );
      },
    [navigation, header],
  );
}

/** The shell lane installs its fading title renderer using this bridge. */
export type TitleScrollHandler = (
  y: number,
  anchorBottom: number | null,
) => void;
export const ScreenTitleContext = createContext<
  ((title: string) => TitleScrollHandler) | null
>(null);
export const TitleAnchorContext = createContext<
  ((bottom: number) => void) | null
>(null);
export const TitleContentContext = createContext<RefObject<View | null> | null>(
  null,
);
export function TitleAnchor({ children }: { children: ReactNode }) {
  const report = useContext(TitleAnchorContext);
  const content = useContext(TitleContentContext);
  const anchor = useRef<View>(null);
  return (
    <View
      ref={anchor}
      onLayout={(event) => {
        const fallback = () =>
          report?.(
            event.nativeEvent.layout.y + event.nativeEvent.layout.height,
          );
        if (anchor.current && content?.current)
          anchor.current.measureLayout(
            content.current,
            (_x, y, _width, height) => report?.(y + height + rhythm.block),
            fallback,
          );
        else fallback();
      }}
    >
      {children}
    </View>
  );
}
/** Marks the date or page heading that precedes the page's offline line. */
export function ScreenHeader({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
const offlineSymbol = 'wifi.slash';
function withOffline(
  children: ReactNode,
  offline: { savedAt: DateInput | null } | null | undefined,
) {
  if (!offline) return children;
  const items = Children.toArray(children);
  let index = 0;
  while (index < items.length) {
    const item = items[index];
    if (
      !isValidElement<{ screenHeader?: boolean }>(item) ||
      (item.type !== ScreenHeader && !item.props.screenHeader)
    )
      break;
    index++;
  }
  items.splice(
    index,
    0,
    <View
      key="screen-offline"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: rhythm.tight,
      }}
    >
      <Icon name={offlineSymbol} size={15} maxScale={1.5} tone="inkSoft" />
      <Text wordSafe variant="secondary" style={{ flexShrink: 1 }}>
        {offline.savedAt === null
          ? "You're offline."
          : copy.offline(offline.savedAt)}
      </Text>
    </View>,
  );
  return items;
}
// Also handle the existing direct Heading children while Heading adopts the context.
function anchorHeadings(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ level?: number; children?: ReactNode }>(child))
      return child;
    if (child.type === Heading && child.props.level === 1)
      return <TitleAnchor>{child}</TitleAnchor>;
    if (
      typeof child.type === 'string' ||
      child.type === View ||
      child.type === Group
    )
      return cloneElement(
        child,
        undefined,
        anchorHeadings(child.props.children),
      );
    return child;
  });
}

/**
 * A soft fade over the top edge of a scrolling panel, from the paper to
 * clear, so lines that have scrolled up read as "more above" rather than cut
 * off. Decorative; place it last inside a relatively positioned wrapper.
 */
/** @deprecated Native scroll edge effects replace this fade. */
export function EdgeFade({
  height = 32,
  testID,
}: {
  height?: number;
  testID?: string;
}) {
  const palette = useColorScheme() === 'dark' ? dark : light;
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
          experimental_backgroundImage: `linear-gradient(to bottom, ${palette.paper} 0%, ${palette.paper}00 100%)`,
        },
      ]}
    />
  );
}

/** A second list within a section: subtle rule and a subsection heading. */
/** @deprecated Use Heading level 3 and a tight gap. */
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
/** @deprecated Use InsetGroup. */
export function RowList({
  children,
  grid = false,
}: {
  children: ReactNode;
  grid?: boolean;
}) {
  const { regular } = useLayout();
  return grid && isPad && regular ? (
    <Grid minItemWidth={320}>{children}</Grid>
  ) : (
    <InsetGroup>{children}</InsetGroup>
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
/** @deprecated Use ValueRows in an InsetGroup. */
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
          <Text variant="secondary" style={stacked ? null : styles.kvLabel}>
            {item.label}
          </Text>
          <Text
            variant="strong"
            tabular
            style={stacked ? null : styles.kvValue}
          >
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
/** @deprecated Use StatStrip with a dated source for its block. */
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
          <Text wordSafe variant="secondary">
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
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section,
    gap: layout.sectionGap,
  },
  section: { gap: rhythm.heading },
  sectionAction: {
    minHeight: minimumTarget,
    justifyContent: 'center',
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
  },
  insetGroup: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    overflow: 'hidden',
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
    gap: rhythm.block,
  },
  kvStacked: { gap: rhythm.line },
  kvLabel: { flex: 1 },
  kvValue: { textAlign: 'right', flexShrink: 1, maxWidth: '60%' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: rhythm.block },
  // Never a wrapping column: Yoga lays its stretched tiles out at max-content
  // width, so their text measures one width and draws in another (blank or
  // clipped figures at AX5, the profile strip in build 33).
  statsStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
  stat: { minWidth: 96, flexGrow: 1, flexBasis: 96, gap: 2 },
});
