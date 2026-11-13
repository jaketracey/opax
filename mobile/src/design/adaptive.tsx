import { webOrigin } from './environment';
import {
  Children,
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  PointerHoverView,
  type PointerHoverProps,
} from '../../modules/opax-ipad';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rhythm, rhythmRegular } from './tokens';
import { OpaxDuo, type WindowTraits } from '../../modules/opax-duo';
import { evenColumns } from './fold';

export type { WindowTraits } from '../../modules/opax-duo';
export {
  ReservedRegionArea,
  ReservedRegionsProvider,
  useReservedRegions,
} from './fold-area';

/**
 * One rule for measured regions: iPad from 700pt, regular/regular phone
 * windows from 560pt. Every other phone window stays compact, including
 * Pro Max landscape (regular/compact). Read the live key window's traits
 * and the region's bounds, never a device model or interface orientation.
 */
export const breakpoints = {
  /** Two panes, a sidebar and multi-column grids from here. */
  regular: 700,
  /** A region in a regular/regular iPhone window. */
  regularPhone: 560,
  /**
   * Two panes side by side (a split's list and detail, Ask's sources pane,
   * Today's two columns) from here, on iPad and regular phones alike. Below
   * it a regular phone keeps one column: a 669pt Duo (portrait inner) gave a
   * 281pt list whose header labels broke mid-word.
   */
  split: 700,
  /** Three-column grids from here (a 13-inch iPad in landscape). */
  wide: 1100,
} as const;

/** Column widths for content on regular width. */
export const columns = {
  /** Long text: about 70 characters of 17pt Public Sans. */
  readable: 700,
  /** Front pages and grids (Today). */
  wide: 1180,
} as const;

/**
 * The narrow pane's bounds (`splitPaneWidth`); `width` is where it usually
 * lands, a third of a 13-inch iPad's landscape region.
 */
export const splitPane = { width: 360, min: 300, max: 440 } as const;
export const splitPanePhoneRegular = {
  fraction: 0.42,
  min: 260,
  maxFraction: 0.5,
} as const;

/**
 * The narrow pane of every two-pane layout (a split's list, Ask's sources),
 * from the width of the region the two panes share (inside the sidebar's
 * inset): a third on iPad within `splitPane` bounds, or 42% on a regular
 * phone with a 260pt minimum and a half-width ceiling. At accessibility
 * sizes it is 45%, so the pane's rows keep whole words. The wide pane takes the rest.
 */
export function splitPaneWidth(
  width: number,
  large = false,
  rule: LayoutRule = currentRule(),
): number {
  if (large) return Math.round(width * 0.45);
  if (rule === 'phone-regular') {
    return Math.round(
      Math.min(
        Math.max(
          width * splitPanePhoneRegular.fraction,
          splitPanePhoneRegular.min,
        ),
        width * splitPanePhoneRegular.maxFraction,
      ),
    );
  }
  return Math.round(
    Math.min(
      Math.max(width / 3, splitPane.min),
      splitPane.max,
      Math.max(width / 2, splitPane.min),
    ),
  );
}

export type SizeClass = 'compact' | 'regular';

/**
 * Whether a region `width` wide may draw two panes side by side: a regular
 * region at least `breakpoints.split` (700pt) wide, on every device. Text
 * size does not move the breakpoint; at accessibility sizes the narrow pane
 * widens to 45% (`splitPaneWidth`) and labels step down (`wordSafe`).
 */
export function splitAllowed(
  width: number,
  rule: LayoutRule = currentRule(),
): boolean {
  return sizeClassFor(width, rule) === 'regular' && width >= breakpoints.split;
}

/** iPad-only behaviour: keyboard, pointer, drags, sidebar labels and phoneCopy. */
export const isPad = Platform.OS === 'ios' && Platform.isPad;

export type LayoutRule = 'pad' | 'phone-regular' | 'phone';

const traitsRegular = (traits: WindowTraits | null) =>
  traits?.horizontal === 'regular' && traits.vertical === 'regular';
let nativeTraits = OpaxDuo?.getWindowTraits() ?? null;
let traitsOverride: WindowTraits | null | undefined;
// A phone is adaptive once it shows a fold region, a regular/regular window
// or vertical bars (the closed iPhone Duo: its outer display has no fold).
const traitsAdaptive = (traits: WindowTraits | null) =>
  !!traits?.foldable || !!traits?.verticalBars || traitsRegular(traits);
let adaptivePhone = traitsAdaptive(nativeTraits);
let traitsSnapshot = { traits: nativeTraits, adaptive: isPad || adaptivePhone };
const traitsListeners = new Set<() => void>();
let nativeSubscription: { remove(): void } | undefined;

function publishTraits() {
  const traits =
    Platform.OS === 'ios'
      ? traitsOverride === undefined
        ? nativeTraits
        : traitsOverride
      : null;
  adaptivePhone ||= traitsAdaptive(traits);
  const adaptive = isPad || (Platform.OS === 'ios' && adaptivePhone);
  const previous = traitsSnapshot.traits;
  if (
    previous?.horizontal === traits?.horizontal &&
    previous?.vertical === traits?.vertical &&
    previous?.foldable === traits?.foldable &&
    previous?.verticalBars === traits?.verticalBars &&
    traitsSnapshot.adaptive === adaptive
  )
    return;
  traitsSnapshot = { traits, adaptive };
  traitsListeners.forEach((listener) => listener());
}

function subscribeTraits(listener: () => void) {
  traitsListeners.add(listener);
  if (!nativeSubscription && OpaxDuo) {
    nativeSubscription = OpaxDuo.addListener('onWindowTraits', (traits) => {
      nativeTraits = traits;
      publishTraits();
    });
    // Close the gap between the synchronous first render and subscribing.
    nativeTraits = OpaxDuo.getWindowTraits();
    publishTraits();
  }
  return () => {
    traitsListeners.delete(listener);
    if (!traitsListeners.size) {
      nativeSubscription?.remove();
      nativeSubscription = undefined;
    }
  };
}

const getTraitsSnapshot = () => traitsSnapshot;
const serverTraitsSnapshot = { traits: null, adaptive: false };
const getServerTraitsSnapshot = () => serverTraitsSnapshot;

/** Live key-window traits, synchronously seeded; null off iOS or without the module. */
export function useWindowTraits(): WindowTraits | null {
  return useSyncExternalStore(
    subscribeTraits,
    getTraitsSnapshot,
    getServerTraitsSnapshot,
  ).traits;
}

/** Undefined restores native traits. Null simulates an unavailable bridge. */
export function setWindowTraitsOverride(
  traits: WindowTraits | null | undefined,
) {
  traitsOverride = traits;
  publishTraits();
}

/** Test isolation only: folding and remounting consumers never reset this session flag. */
export function resetAdaptiveDeviceForTests() {
  adaptivePhone = false;
  publishTraits();
}

/** The current window rule, shared by every measured region within it. */
export function currentRule(
  traits: WindowTraits | null = traitsSnapshot.traits,
): LayoutRule {
  return isPad
    ? 'pad'
    : Platform.OS === 'ios' && traitsRegular(traits)
      ? 'phone-regular'
      : 'phone';
}

/**
 * The window as analytics categories, read when an event is sent: the
 * window's size class under the current rule and whether it spans a fold.
 * Never its size, the device model or a measured region.
 */
export function windowClass(): {
  layout: SizeClass;
  foldable: boolean;
} {
  const { width } = Dimensions.get('window');
  return {
    layout: sizeClassFor(width, currentRule()),
    foldable: !!traitsSnapshot.traits?.foldable,
  };
}

/**
 * Replace module-level isPad at whole-view-tree forks with this hook. Once
 * a phone reports a division or regular/regular traits, it stays adaptive
 * for the session so display changes keep the same screen tree mounted.
 * Keep isPad for iPad-only keyboard, pointer, drags, labels and phoneCopy.
 */
export function useAdaptiveDevice(): boolean {
  return useSyncExternalStore(
    subscribeTraits,
    getTraitsSnapshot,
    getServerTraitsSnapshot,
  ).adaptive;
}

// Shell 0.4 S8: UIKit's screen inset grows from 16 pt to 20 pt at 414 pt.
const screenMarginBreakpoint = 414;
const narrowScreenMargin = 16;

/** Regular-width spacing is shared with Screen's column padding. */
export function useScreenMargin() {
  const layout = useLayout();
  return layout.regular
    ? rhythmRegular.screen
    : layout.width >= screenMarginBreakpoint
      ? rhythm.screen
      : narrowScreenMargin;
}

export interface Layout {
  rule: LayoutRule;
  size: SizeClass;
  /** `size === 'regular'`. */
  regular: boolean;
  /** Regular iPad region at least `breakpoints.wide`: room for three columns. */
  wide: boolean;
  /** Room for two panes side by side (`splitAllowed`): 700pt on any device. */
  split: boolean;
  /** The region's width: the measured pane or screen, else the window. */
  width: number;
  height: number;
  /** The whole window, whatever region this is in. */
  window: { width: number; height: number };
  landscape: boolean;
}

/** Apply the window rule to a measured region's width. */
export function sizeClassFor(
  width: number,
  rule: LayoutRule = currentRule(),
): SizeClass {
  return (rule === 'pad' && width >= breakpoints.regular) ||
    (rule === 'phone-regular' && width >= breakpoints.regularPhone)
    ? 'regular'
    : 'compact';
}

const RegionContext = createContext<{ width: number; height: number } | null>(
  null,
);

/**
 * The layout of the region this component draws in: inside a measured
 * region (a `Screen`, a `SplitLayout` pane, a `LayoutRegion`) its width,
 * otherwise the window's. Re-renders on rotation, Split View and Stage
 * Manager resizes, and pane resizes.
 */
export function useLayout(): Layout {
  const window = useWindowDimensions();
  const region = useContext(RegionContext);
  const rule = currentRule(useWindowTraits());
  return useMemo(() => {
    const width = region?.width ?? window.width;
    const height = region?.height ?? window.height;
    const size = sizeClassFor(width, rule);
    return {
      rule,
      size,
      regular: size === 'regular',
      wide: rule === 'pad' && size === 'regular' && width >= breakpoints.wide,
      split: splitAllowed(width, rule),
      width,
      height,
      window: { width: window.width, height: window.height },
      landscape: window.width > window.height,
    };
  }, [region?.width, region?.height, window.width, window.height, rule]);
}

/**
 * A region whose children read its measured size from `useLayout()`. Until
 * the first layout they read the enclosing region (or the window), so the
 * first frame is drawn at once and corrected, if needed, on the next.
 */
export function LayoutRegion({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [onLayout, region] = useMeasuredRegion();
  return (
    <View style={style} onLayout={onLayout} testID={testID}>
      <RegionProvider value={region}>{children}</RegionProvider>
    </View>
  );
}

/** For containers that measure themselves (Screen, SplitLayout). */
export function useMeasuredRegion() {
  const [region, setRegion] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setRegion((current) =>
      current &&
      Math.abs(current.width - width) < 0.5 &&
      Math.abs(current.height - height) < 0.5
        ? current
        : { width, height },
    );
  };
  return [onLayout, region] as const;
}

export function RegionProvider({
  value,
  children,
}: {
  value: { width: number; height: number } | null;
  children: ReactNode;
}) {
  const parent = useContext(RegionContext);
  return (
    <RegionContext.Provider value={value ?? parent}>
      {children}
    </RegionContext.Provider>
  );
}

/**
 * The horizontal padding that centres a column of at most `max` points in
 * a region `width` wide, never less than the screen margin. Compact regions
 * always get the plain margin, so iPhone screens are unchanged.
 */
export function readableInset(
  width: number,
  max: number = columns.readable,
  margin: number = rhythm.screen,
  rule: LayoutRule = currentRule(),
): number {
  if (sizeClassFor(width, rule) === 'compact') return margin;
  return Math.max(margin * 1.6, Math.round((width - max) / 2));
}

/**
 * How far a figure in a `column` may reach past each side of it to fill the
 * wide column, in a region `width` wide (the money map's scene in its
 * readable page). 0 on compact width and in the wide column itself.
 */
export function columnBreakout(
  width: number,
  column: keyof typeof columns,
  rule: LayoutRule = currentRule(),
): number {
  if (sizeClassFor(width, rule) === 'compact') return 0;
  const inset = (max: number) => readableInset(width, max, rhythm.screen, rule);
  return Math.max(0, inset(columns[column]) - inset(columns.wide));
}

const ColumnContext = createContext<keyof typeof columns | null>(null);

/**
 * A route's choice of column for the screen it draws, over the screen's own
 * `column` (Your MP is a reading page: its route asks for the readable
 * column). It changes nothing on compact width, where every column is the
 * full width inside the margin, and draws no view.
 */
export function ScreenColumn({
  column,
  children,
}: {
  column: keyof typeof columns;
  children: ReactNode;
}) {
  return (
    <ColumnContext.Provider value={column}>{children}</ColumnContext.Provider>
  );
}

/** The column a route asked for (`ScreenColumn`), else `own`. */
export function useColumnChoice(
  own: keyof typeof columns,
): keyof typeof columns {
  return useContext(ColumnContext) ?? own;
}

/**
 * A centred column of readable width (about 700pt) for long text outside a
 * `Screen` (which centres its own content). Full width on compact.
 */
export function ReadableColumn({
  children,
  width = 'readable',
  style,
  testID,
}: {
  children: ReactNode;
  width?: keyof typeof columns;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const layout = useLayout();
  return (
    <View
      testID={testID}
      style={[
        styles.column,
        layout.regular ? { maxWidth: columns[width] } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface GridColumns {
  compact?: number;
  regular?: number;
  wide?: number;
}

/**
 * Responsive columns for card fronts. Columns follow the grid's own width:
 * `columns.compact` (default 1) below its rule threshold, `regular` (2)
 * above, and `wide` (3) on wide iPad regions. Regular phones cap at two.
 * Cards are never narrower than `minItemWidth` scaled with the text size, so
 * at accessibility sizes the grid steps down to fewer, wider cards. Cells
 * in a row share its height; a child with `flexGrow: 1` fills its cell.
 */
export function Grid({
  children,
  columns: counts,
  minItemWidth = 280,
  gap = rhythm.block,
  rowGap,
  testID,
}: {
  children: ReactNode;
  columns?: GridColumns;
  minItemWidth?: number;
  gap?: number;
  rowGap?: number;
  testID?: string;
}) {
  const layout = useLayout();
  const { fontScale } = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? layout.width;
  const items = Children.toArray(children).filter(Boolean);
  const count = gridColumns(width, {
    columns: counts,
    rule: layout.rule,
    minItemWidth: minItemWidth * Math.min(Math.max(fontScale, 1), 2),
    gap,
  });
  const cell = count > 1 ? (width - gap * (count - 1)) / count : width;
  return (
    <View
      testID={testID}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setMeasured((current) =>
          current !== null && Math.abs(current - next) < 0.5 ? current : next,
        );
      }}
      style={[
        styles.grid,
        { columnGap: gap, rowGap: rowGap ?? gap },
        count === 1 ? styles.gridSingle : null,
      ]}
    >
      {items.map((item, index) => (
        <View
          key={index}
          style={count > 1 ? [styles.cell, { width: Math.floor(cell) }] : null}
        >
          {item}
        </View>
      ))}
    </View>
  );
}

/** Card collections on regular layouts, including two-column phone spreads. */
export function PadGrid({ children, ...props }: Parameters<typeof Grid>[0]) {
  const { regular, rule } = useLayout();
  if (!regular) return <>{children}</>;
  const items = Children.toArray(children);
  return (
    <Grid
      columns={{ regular: 2, wide: Math.min(3, items.length) }}
      minItemWidth={
        rule === 'phone-regular'
          ? (breakpoints.regularPhone - rhythm.block) / 2
          : 320
      }
      rowGap={rhythm.section}
      {...props}
    >
      {items}
    </Grid>
  );
}

/** Prose inside any regular spread keeps a readable measure. */
export function PadReading({ children }: { children: ReactNode }) {
  const { regular } = useLayout();
  if (!regular) return <>{children}</>;
  return (
    <ReadableColumn style={{ alignSelf: 'flex-start' }}>
      {children}
    </ReadableColumn>
  );
}

/** How many columns a grid `width` wide draws. */
export function gridColumns(
  width: number,
  {
    columns: counts = {},
    minItemWidth = 280,
    gap = rhythm.block,
    rule = currentRule(),
  }: {
    columns?: GridColumns;
    minItemWidth?: number;
    gap?: number;
    rule?: LayoutRule;
  } = {},
): number {
  const size = sizeClassFor(width, rule);
  const wanted =
    size === 'compact'
      ? (counts.compact ?? 1)
      : width >= breakpoints.wide
        ? (counts.wide ?? 3)
        : (counts.regular ?? 2);
  const fit = Math.max(1, Math.floor((width + gap) / (minItemWidth + gap)));
  const count = Math.max(1, Math.min(wanted, fit));
  return rule === 'phone-regular' && size === 'regular'
    ? evenColumns(Math.min(count, 2))
    : count;
}

/**
 * The system pointer effect over one control (iPad with a trackpad or
 * mouse). `effect`: `highlight` for buttons, `lift` for cards, `hover` for
 * rows, `none` for hover events only. `onHover` reports the pointer entering
 * and leaving, for a drawn hover state. Elsewhere (iPhone, Android, tests)
 * it renders its child alone, so the view tree there is unchanged. `style`
 * is the wrapper's layout on iPad: give it the child's own alignment
 * (`alignSelf`) and flex, so the wrapper is the child's size.
 */
export function Hoverable({
  children,
  effect = 'highlight',
  cornerRadius,
  onHover,
  style,
  drag,
  onActivate,
}: {
  children: ReactNode;
  effect?: PointerHoverProps['effect'];
  cornerRadius?: number;
  onHover?: (hovered: boolean) => void;
  style?: StyleProp<ViewStyle>;
  drag?: { path: string; title: string };
  onActivate?: () => void;
}) {
  if (!PointerHoverView) return <>{children}</>;
  return (
    <PointerHoverView
      effect={effect}
      cornerRadius={cornerRadius ?? -1}
      onHoverChange={
        onHover ? (event) => onHover(event.nativeEvent.hovered) : undefined
      }
      style={style}
      dragUrl={drag ? (dragWebUrl(drag.path) ?? undefined) : undefined}
      dragTitle={drag?.title}
      keyboardFocusable={!!onActivate}
      onActivate={onActivate}
    >
      {children}
    </PointerHoverView>
  );
}

/** Public record URLs only. Creating a drag never requests the destination. */
export function dragWebUrl(path: string, origin = webOrigin): string | null {
  try {
    if (!path.startsWith('/') && !path.startsWith(`${origin}/`)) return null;
    const url = new URL(path, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** A drawn hover state for rows: true while the pointer is over it. */
export function useHover() {
  const [hovered, setHovered] = useState(false);
  return [hovered, PointerHoverView ? setHovered : undefined] as const;
}

/**
 * Keeps a screen's content clear of the iPad sidebar. On iPadOS 26 the
 * sidebar floats over the content and reports itself as a leading safe-area
 * inset; the navigation bar follows it, but a scroll view's content does
 * not. This native safe-area view pads its leading and trailing edges by the
 * insets of the screen it sits in; nested ones defer to the outermost. `Screen`, `KeyboardStableScreen`, the
 * reader and the Bills split already use it; wrap any other full-screen
 * FlatList in it. On an iPhone that can draw regular layouts (iPhone Duo,
 * `useAdaptiveDevice()`) it is on as well: there the tab bar and toolbar sit
 * vertically beside the content (the outer display, landscape) and report
 * themselves as leading or trailing safe-area insets, which a scroll view's
 * content also ignores. It stays on in every pose, so folding never remounts
 * a screen; with no side insets it pads nothing. On other iPhones and Android
 * it renders its child alone.
 */
// The native view pads by its screen's insets, not by its own overlap with
// them, so only the outermost one applies (a pane inside the Bills split).
const SidebarSafeContext = createContext(false);
export function SidebarSafe({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const inside = useContext(SidebarSafeContext);
  const adaptive = useAdaptiveDevice();
  if (!(isPad || (Platform.OS === 'ios' && adaptive)) || inside)
    return <>{children}</>;
  return (
    <SafeAreaView
      edges={['left', 'right']}
      mode="padding"
      style={[styles.safe, style]}
    >
      <SidebarSafeContext.Provider value>
        {children}
      </SidebarSafeContext.Provider>
    </SafeAreaView>
  );
}

/** True where pointer effects exist (iPad). */
export const pointerAvailable = PointerHoverView !== null;

const styles = StyleSheet.create({
  column: { width: '100%', alignSelf: 'center' },
  safe: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  gridSingle: { flexDirection: 'column', flexWrap: 'nowrap' },
  cell: { flexDirection: 'column' },
});
