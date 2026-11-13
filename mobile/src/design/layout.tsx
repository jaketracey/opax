import { Pressable } from './pressable';
import { type Href } from 'expo-router';
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  type ViewProps,
} from 'react-native';
import { opaqueBar } from '../navigation/chrome';
import { useAndroidRootScroll } from '../navigation/useAndroidRootScroll';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useSafeSetOptions } from '../navigation/preview';
import { useFloatingBarClearance } from '../navigation/floating-bar';
import { useRootBarAppearance } from '../navigation/useRootBarAppearance';
import { useTitleOnScroll } from '../navigation/useTitleOnScroll';
import { useAccessibilitySize } from './accessibility';
import {
  columnBreakout,
  columns,
  sizeClassFor,
  RegionProvider,
  SidebarSafe,
  useColumnChoice,
  useAdaptiveDevice,
  useLayout,
  useMeasuredRegion,
} from './adaptive';
import { useInCard } from './card';
import { copy } from './copy';
import { designFlags } from './flags';
import type { DateInput } from './format';
import { Icon } from './icon';
import { useRefreshCommand } from './keyboard';
import { RowLink } from './row-link';
import {
  RowCellInsetContext,
  RowInsetContext,
  SurfaceContext,
} from './row-padding';
import { usePaneBar, useSplitPane } from './split';
import { ScreenSectionGapContext, StatePageProvider } from './states';
import { Heading, Text } from './text';
import {
  colors,
  hairline,
  layout,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
  rhythmRegular,
} from './tokens';
import { useStableKeyboard } from './useStableKeyboard';

// The compatibility button's notes-only adapter now presents /rule.

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
export function useScreenColumn(
  own: keyof typeof columns = 'readable',
  automaticInsets = true,
) {
  const column = useColumnChoice(own);
  const [onLayout, region] = useMeasuredRegion();
  const outer = useLayout();
  const insets = useContext(SafeAreaInsetsContext);
  const inPane = useSplitPane() !== null;
  const adaptive = useAdaptiveDevice();
  // SidebarSafe and split panes already own their horizontal safe area.
  // UIKit adjusts a phone scroll view on each side, including a vertical bar.
  // On an adaptive iPhone (Duo) Screen's SidebarSafe already pads each side
  // by the screen's own insets, vertical bars included (the window-level
  // insets here do not see them), so this applies only to other phones.
  const nativeSides =
    Platform.OS === 'ios' &&
    outer.rule !== 'pad' &&
    !inPane &&
    !adaptive &&
    insets?.left !== insets?.right;
  const left = nativeSides ? (insets?.left ?? 0) : 0;
  const right = nativeSides ? (insets?.right ?? 0) : 0;
  const width = Math.max(0, (region?.width ?? outer.width) - left - right);
  const regular = sizeClassFor(width, outer.rule) === 'regular';
  const inset = regular
    ? Math.max(rhythmRegular.screen, Math.round((width - columns[column]) / 2))
    : width < 414
      ? 16
      : 20;
  const content = {
    paddingHorizontal: inset,
    ...(!automaticInsets
      ? { paddingLeft: inset + left, paddingRight: inset + right }
      : {}),
  };
  const inner = region
    ? { width: Math.max(0, width - inset * 2), height: region.height }
    : null;
  const breakout = columnBreakout(width, column, outer.rule);
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
  centred = false,
  barTitle,
  offline,
  onLayout: onPageLayout,
  onContentLayout,
  maintainVisibleContentPosition,
  contentInsetAdjustmentBehavior = 'automatic',
  scrollToOverflowEnabled = false,
  clampScrollOnContentChange = false,
}: {
  onLayout?: ViewProps['onLayout'];
  /** The rendered content, rather than the surrounding scroll viewport. */
  onContentLayout?: ViewProps['onLayout'];
  maintainVisibleContentPosition?: React.ComponentProps<
    typeof ScrollView
  >['maintainVisibleContentPosition'];
  contentInsetAdjustmentBehavior?: React.ComponentProps<
    typeof ScrollView
  >['contentInsetAdjustmentBehavior'];
  /** Opt in only for header-aware top resets; ordinary anchor scrolls clamp. */
  scrollToOverflowEnabled?: boolean;
  /** Async front pages may lose blocks while the reader is at the end. */
  clampScrollOnContentChange?: boolean;
  testID?: string;
  grouped?: boolean;
  /** Centre a whole-screen state while allowing AX content to scroll. */
  centred?: boolean;
  barTitle?: string;
  offline?: { savedAt: DateInput | null } | null;
  scrollRef?: Ref<ScrollView>;
  onScroll?: (y: number) => void;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** The content column on regular width: `readable` (700pt) or `wide`. */
  column?: keyof typeof columns;
}) {
  const { onLayout, content, inner, bar, regular } = useScreenColumn(
    column,
    contentInsetAdjustmentBehavior !== 'never',
  );
  const ground = grouped && designFlags.groupedSurfaces ? 'sunken' : 'paper';
  const clearance = useFloatingBarClearance();
  const androidScroll = useRef<ScrollView>(null);
  const androidRoot = useAndroidRootScroll(androidScroll, colors[ground]);
  const setOptions = useSafeSetOptions();
  const inPane = useSplitPane() !== null;
  const nativeRoot = useRootBarAppearance(setOptions, {
    ground: colors[ground],
    disabled: inPane,
  });
  useLayoutEffect(() => {
    // A detail pane must not recolour its parent route's navigation bar.
    if (!inPane && !nativeRoot) setOptions(opaqueBar(colors[ground]));
  }, [setOptions, ground, inPane, nativeRoot]);
  const contentRoot = useRef<View>(null);
  const [anchorBottom, setAnchorBottom] = useState<number | null>(null);
  const titleScroll = useRef<TitleScrollHandler | null>(null);
  const suppliedBridge = useContext(ScreenTitleContext);
  const heading = useRef<View | null>(null);
  const setHeading = useCallback((node: View | null) => {
    heading.current = node;
  }, []);
  const nativeTitle = useTitleOnScroll(
    Platform.OS === 'ios' ? heading : null,
    inPane || suppliedBridge ? undefined : barTitle,
  );
  const setNativeAnchorBottom = nativeTitle.setAnchorBottom;
  const setContentAnchor = useCallback(
    (bottom: number) => {
      setAnchorBottom(bottom);
      if (Platform.OS !== 'ios') setNativeAnchorBottom(bottom);
    },
    [setNativeAnchorBottom],
  );
  useLayoutEffect(() => {
    titleScroll.current =
      barTitle && suppliedBridge ? suppliedBridge(barTitle) : null;
  }, [barTitle, suppliedBridge]);
  useRefreshCommand(
    refreshControl?.props.onRefresh,
    !!refreshControl?.props.refreshing,
  );
  const bounds = useScrollBounds(
    clampScrollOnContentChange,
    Platform.OS === 'android' ? androidScroll : scrollRef,
  );
  useImperativeHandle(
    Platform.OS === 'android' ? scrollRef : undefined,
    () => androidScroll.current!,
    [],
  );
  const targetRef = clampScrollOnContentChange
    ? bounds.ref
    : Platform.OS === 'android'
      ? androidScroll
      : scrollRef;
  return (
    <StatePageProvider refreshing={!!refreshControl?.props.refreshing}>
      <SidebarSafe style={[styles.screen, { backgroundColor: colors[ground] }]}>
        <ScrollView
          ref={targetRef}
          testID={testID}
          style={[styles.screen, { backgroundColor: colors[ground] }]}
          contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
          scrollToOverflowEnabled={scrollToOverflowEnabled}
          alwaysBounceVertical={Platform.OS === 'ios'}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="on-drag"
          refreshControl={refreshControl}
          contentContainerStyle={[
            styles.content,
            // Blank space on short pages must accept drags and refresh pulls.
            { flexGrow: 1 },
            content,
            regular ? { gap: rhythmRegular.section } : null,
            // The last block ends above the floating Today and Search buttons.
            clearance ? { paddingBottom: rhythm.section + clearance } : null,
          ]}
          maintainVisibleContentPosition={maintainVisibleContentPosition}
          onContentSizeChange={
            clampScrollOnContentChange ? bounds.onContentSizeChange : undefined
          }
          onLayout={(event) => {
            onLayout(event);
            onPageLayout?.(event);
            if (clampScrollOnContentChange) bounds.onLayout(event);
          }}
          onScroll={(event) => {
            if (clampScrollOnContentChange) bounds.onScroll(event);
            const y = event.nativeEvent.contentOffset.y;
            if (Platform.OS === 'android') androidRoot.onScroll(y);
            if (titleScroll.current) titleScroll.current(y, anchorBottom);
            else if (!inPane && barTitle) nativeTitle.onScroll(y);
            onScroll?.(y);
          }}
          onScrollEndDrag={
            clampScrollOnContentChange ? bounds.onScroll : undefined
          }
          onMomentumScrollEnd={
            clampScrollOnContentChange ? bounds.onScroll : undefined
          }
          scrollEventThrottle={16}
        >
          <RegionProvider value={inner}>
            <SurfaceContext.Provider value={ground}>
              <TitleAnchorContext.Provider value={setContentAnchor}>
                <TitleHeadingContext.Provider
                  value={{
                    setRef: setHeading,
                    onLayout:
                      Platform.OS === 'ios'
                        ? nativeTitle.onTitleLayout
                        : undefined,
                  }}
                >
                  <TitleContentContext.Provider value={contentRoot}>
                    <View
                      ref={contentRoot}
                      onLayout={onContentLayout}
                      style={{
                        gap: regular ? rhythmRegular.section : rhythm.section,
                        ...(centred
                          ? { flexGrow: 1, justifyContent: 'center' as const }
                          : {}),
                      }}
                    >
                      {bar}
                      {androidRoot.title}
                      <ScreenSectionGapContext.Provider
                        value={regular ? rhythmRegular.section : rhythm.section}
                      >
                        {anchorHeadings(withOffline(children, offline))}
                      </ScreenSectionGapContext.Provider>
                    </View>
                  </TitleContentContext.Provider>
                </TitleHeadingContext.Provider>
              </TitleAnchorContext.Provider>
            </SurfaceContext.Provider>
          </RegionProvider>
        </ScrollView>
      </SidebarSafe>
    </StatePageProvider>
  );
}

/**
 * Fabric preserves the offset during a gesture, even when content collapses.
 * Repair only a changed scroll range, leaving pull-to-refresh and ordinary
 * rubber-banding to UIKit. Keep repairing late momentum events until the
 * native view acknowledges an offset inside the new range.
 */
function useScrollBounds(
  enabled: boolean,
  forwardedRef: Ref<ScrollView> | undefined,
) {
  const scroll = useRef<ScrollView | null>(null);
  const metrics = useRef({
    height: null as number | null,
    viewport: 0,
    y: 0,
    top: 0,
    bottom: 0,
    changed: false,
  });
  useImperativeHandle(
    enabled ? forwardedRef : undefined,
    () => scroll.current!,
    [],
  );
  const clamp = () => {
    const m = metrics.current;
    if (!enabled || !m.changed || m.height === null || m.viewport <= 0) return;
    const end = Math.max(-m.top, m.height - m.viewport + m.bottom);
    // Never cancel a pull or force a reader further down the page.
    if (m.y > end) scroll.current?.scrollTo({ y: end, animated: false });
  };
  return {
    ref: scroll,
    onContentSizeChange: (_width: number, height: number) => {
      const m = metrics.current;
      if (m.height === null || height < m.height) m.changed = true;
      m.height = height;
      clamp();
    },
    onLayout: (event: LayoutChangeEvent) => {
      const m = metrics.current;
      if (event.nativeEvent.layout.height > m.viewport) m.changed = true;
      m.viewport = event.nativeEvent.layout.height;
      clamp();
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const m = metrics.current;
      const { contentOffset, contentInset, layoutMeasurement } =
        event.nativeEvent;
      m.y = contentOffset.y;
      m.top = contentInset.top;
      m.bottom = contentInset.bottom;
      m.viewport = layoutMeasurement.height;
      if (
        m.height !== null &&
        m.y <= Math.max(-m.top, m.height - m.viewport + m.bottom)
      )
        m.changed = false;
      clamp();
    },
  };
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
  const clearance = useFloatingBarClearance();
  useRefreshCommand(
    refreshControl?.props.onRefresh,
    !!refreshControl?.props.refreshing,
  );
  return (
    <StatePageProvider refreshing={!!refreshControl?.props.refreshing}>
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
          contentContainerStyle={[
            styles.content,
            content,
            keyboard.contentStyle,
            // The last block ends above the floating Today and Search buttons.
            clearance
              ? {
                  paddingBottom:
                    keyboard.contentStyle.paddingBottom + clearance,
                }
              : null,
          ]}
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
    </StatePageProvider>
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
/** A section jump measures the heading text, including its inset within the row. */
export const SectionHeadingLayoutContext = createContext<
  ((testID: string, event: LayoutChangeEvent) => void) | null
>(null);

export function SectionHeader({
  title,
  action,
  accessory,
  testID,
  level = 2,
  compact = false,
}: {
  title: string;
  action?: SectionAction;
  /** Independent control beside the heading, wrapping only when it cannot fit. */
  accessory?: ReactNode;
  testID?: string;
  level?: 2 | 3;
  /** Today: the title owns the band; the action keeps its full target. */
  compact?: boolean;
}) {
  const [titleHeight, setTitleHeight] = useState<number>(
    textStyles.sectionTitle.lineHeight,
  );
  const headingLayout = useContext(SectionHeadingLayoutContext);
  const stacked = useAccessibilitySize();
  const button = action ? (
    <Pressable
      accessibilityRole={action.href ? 'link' : 'button'}
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      testID={action.testID}
      style={({ pressed }) => [
        styles.sectionAction,
        ...(compact && !stacked
          ? [{ marginVertical: -Math.max(0, minimumTarget - titleHeight) / 2 }]
          : []),
        pressed ? { backgroundColor: colors.sunken } : null,
      ]}
    >
      <Text wordSafe variant="strong" tone="navy">
        {action.label ?? 'See all'}
      </Text>
    </Pressable>
  ) : null;
  const bandStyle = accessory
    ? styles.sectionHeadWrapping
    : stacked
      ? styles.sectionHeadStacked
      : styles.sectionHead;
  return (
    <View
      style={
        // Stacked at AX sizes, the header keeps its own margin to the group.
        compact && !stacked
          ? [bandStyle, { minHeight: 0, marginBottom: 0 }]
          : bandStyle
      }
    >
      <Heading
        level={level}
        style={accessory ? styles.sectionHeadTitle : styles.grow}
        testID={testID}
        onLayout={
          compact || (headingLayout && testID)
            ? (event) => {
                if (compact) setTitleHeight(event.nativeEvent.layout.height);
                if (headingLayout && testID) headingLayout(testID, event);
              }
            : undefined
        }
      >
        {title}
      </Heading>
      {action?.href && button ? (
        <RowLink href={action.href}>{button}</RowLink>
      ) : (
        button
      )}
      {accessory ? (
        <View style={styles.sectionAccessory}>{accessory}</View>
      ) : null}
    </View>
  );
}
/** Section boundaries use space and a heading. */
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
const TitleHeadingContext = createContext<{
  setRef: (node: View | null) => void;
  onLayout: ViewProps['onLayout'];
} | null>(null);
export function TitleAnchor({ children }: { children: ReactNode }) {
  const report = useContext(TitleAnchorContext);
  const content = useContext(TitleContentContext);
  const anchor = useRef<View>(null);
  const heading = useContext(TitleHeadingContext);
  const setHeading = heading?.setRef;
  const setAnchor = useCallback(
    (node: View | null) => {
      anchor.current = node;
      setHeading?.(node);
    },
    [setHeading],
  );
  return (
    <View
      ref={setAnchor}
      collapsable={false}
      onLayout={(event) => {
        heading?.onLayout?.(event);
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
  sectionHead: {
    minHeight: minimumTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  sectionHeadStacked: {
    gap: rhythm.line,
    marginBottom: rhythm.heading - rhythm.block,
  },
  sectionHeadWrapping: {
    minHeight: minimumTarget,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  sectionHeadTitle: { flexGrow: 1, flexShrink: 0, maxWidth: '100%' },
  sectionAccessory: {
    marginLeft: 'auto',
    maxWidth: '100%',
    paddingVertical: rhythm.tight,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
});
