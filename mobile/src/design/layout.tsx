import { type Href } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
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
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ViewProps,
} from 'react-native';
import { opaqueBar } from '../navigation/chrome';
import { useSafeSetOptions } from '../navigation/preview';
import { BarTitle } from '../navigation/useTitleOnScroll';
import { useAccessibilitySize } from './accessibility';
import {
  columnBreakout,
  columns,
  isPad,
  RegionProvider,
  SidebarSafe,
  useColumnChoice,
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
import { StatePageProvider } from './states';
import { Heading, Text } from './text';
import {
  colors,
  hairline,
  layout,
  minimumTarget,
  radii,
  rhythm,
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
  onLayout: onPageLayout,
  maintainVisibleContentPosition,
  contentInsetAdjustmentBehavior = 'automatic',
}: {
  onLayout?: ViewProps['onLayout'];
  maintainVisibleContentPosition?: React.ComponentProps<
    typeof ScrollView
  >['maintainVisibleContentPosition'];
  contentInsetAdjustmentBehavior?: React.ComponentProps<
    typeof ScrollView
  >['contentInsetAdjustmentBehavior'];
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
  const setOptions = useSafeSetOptions();
  const inPane = useSplitPane() !== null;
  useLayoutEffect(() => {
    // A detail pane must not recolour its parent route's navigation bar.
    if (!inPane) setOptions(opaqueBar(colors[ground]));
  }, [setOptions, ground, inPane]);
  const contentRoot = useRef<View>(null);
  const [anchorBottom, setAnchorBottom] = useState<number | null>(null);
  const titleScroll = useRef<TitleScrollHandler | null>(null);
  const suppliedBridge = useContext(ScreenTitleContext);
  const nativeBridge = useBarTitle(
    inPane ? undefined : barTitle,
    anchorBottom !== null,
  );
  const titleBridge = suppliedBridge ?? (inPane ? null : nativeBridge);
  useLayoutEffect(() => {
    titleScroll.current =
      barTitle && titleBridge ? titleBridge(barTitle) : null;
  }, [barTitle, titleBridge]);
  useRefreshCommand(
    refreshControl?.props.onRefresh,
    !!refreshControl?.props.refreshing,
  );
  return (
    <StatePageProvider refreshing={!!refreshControl?.props.refreshing}>
      <SidebarSafe style={[styles.screen, { backgroundColor: colors[ground] }]}>
        <ScrollView
          ref={scrollRef}
          testID={testID}
          style={[styles.screen, { backgroundColor: colors[ground] }]}
          contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="on-drag"
          refreshControl={refreshControl}
          contentContainerStyle={[
            styles.content,
            content,
            regular ? { gap: rhythmRegular.section } : null,
          ]}
          maintainVisibleContentPosition={maintainVisibleContentPosition}
          onLayout={(event) => {
            onLayout(event);
            onPageLayout?.(event);
          }}
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
    </StatePageProvider>
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

function useBarTitle(title: string | undefined, anchored: boolean) {
  const setOptions = useSafeSetOptions();
  const header = useContext(HeaderHeightContext) || 44;
  const shown = useRef(false);
  useLayoutEffect(() => {
    if (title)
      setOptions({
        title,
        headerTitle: () => <BarTitle title={title} shown={false} />,
      });
  }, [setOptions, title]);
  useLayoutEffect(() => {
    if (!title || !anchored) return;
    shown.current = false;
    setOptions({
      headerTitle: () => <BarTitle title={title} shown={false} />,
    });
  }, [setOptions, title, anchored]);
  return useCallback(
    (barTitle: string): TitleScrollHandler =>
      (y, bottom) => {
        if (bottom === null) return;
        const next = y + header > bottom;
        if (next === shown.current) return;
        shown.current = next;
        setOptions(
          Platform.OS === 'android'
            ? { headerTitle: next ? barTitle : '' }
            : {
                headerTitle: () => <BarTitle title={barTitle} shown={next} />,
              },
        );
      },
    [setOptions, header],
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  sectionHeadStacked: {
    gap: rhythm.line,
    marginBottom: rhythm.heading - rhythm.block,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
});
