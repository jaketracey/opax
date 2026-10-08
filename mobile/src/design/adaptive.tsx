import {
  Children,
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
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
import { rhythm } from './tokens';

/**
 * iPad layout (Oct 2026). One rule decides every adaptive layout: a region
 * is `regular` when it is at least `breakpoints.regular` points wide on an
 * iPad, and `compact` otherwise. The width is the live window's (or the
 * measured region's inside a split pane), never the device's: a 1/3 Split
 * View window on an iPad Pro is compact, and rotation or a Stage Manager
 * resize re-renders with the new class.
 *
 * The iPhone is always compact, in every orientation, so its layouts and
 * journeys stay exactly as they were (a 17 Pro Max in landscape is 956pt
 * wide, but the phone keeps its one-column app).
 */
export const breakpoints = {
  /** Two panes, a sidebar and multi-column grids from here. */
  regular: 700,
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

/** The list pane of a split layout: default, minimum and maximum widths. */
export const splitPane = { width: 360, min: 300, max: 440 } as const;

export type SizeClass = 'compact' | 'regular';

/** An iPad (or an iPad app on a Mac): the only place regular layouts draw. */
export const isPad = Platform.OS === 'ios' && Platform.isPad;

export interface Layout {
  size: SizeClass;
  /** `size === 'regular'`. */
  regular: boolean;
  /** Regular and at least `breakpoints.wide`: room for three columns. */
  wide: boolean;
  /** The region's width: the measured pane or screen, else the window. */
  width: number;
  height: number;
  /** The whole window, whatever region this is in. */
  window: { width: number; height: number };
  landscape: boolean;
}

/** The size class for a width; iPad only (the iPhone is always compact). */
export function sizeClassFor(width: number, pad = isPad): SizeClass {
  return pad && width >= breakpoints.regular ? 'regular' : 'compact';
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
  return useMemo(() => {
    const width = region?.width ?? window.width;
    const height = region?.height ?? window.height;
    const size = sizeClassFor(width);
    return {
      size,
      regular: size === 'regular',
      wide: size === 'regular' && width >= breakpoints.wide,
      width,
      height,
      window: { width: window.width, height: window.height },
      landscape: window.width > window.height,
    };
  }, [region?.width, region?.height, window.width, window.height]);
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
  size: SizeClass = sizeClassFor(width),
): number {
  if (size === 'compact') return margin;
  return Math.max(margin * 1.6, Math.round((width - max) / 2));
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
 * `columns.compact` (default 1) below 700pt, `regular` (2) and `wide` (3)
 * above, never narrower than `minItemWidth` scaled with the text size, so
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

/** How many columns a grid `width` wide draws. */
export function gridColumns(
  width: number,
  {
    columns: counts = {},
    minItemWidth = 280,
    gap = rhythm.block,
    pad = isPad,
  }: {
    columns?: GridColumns;
    minItemWidth?: number;
    gap?: number;
    pad?: boolean;
  } = {},
): number {
  const size = sizeClassFor(width, pad);
  const wanted =
    size === 'compact'
      ? (counts.compact ?? 1)
      : width >= breakpoints.wide
        ? (counts.wide ?? 3)
        : (counts.regular ?? 2);
  const fit = Math.max(1, Math.floor((width + gap) / (minItemWidth + gap)));
  return Math.max(1, Math.min(wanted, fit));
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
}: {
  children: ReactNode;
  effect?: PointerHoverProps['effect'];
  cornerRadius?: number;
  onHover?: (hovered: boolean) => void;
  style?: StyleProp<ViewStyle>;
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
    >
      {children}
    </PointerHoverView>
  );
}

/** A drawn hover state for rows: true while the pointer is over it. */
export function useHover() {
  const [hovered, setHovered] = useState(false);
  return [hovered, PointerHoverView ? setHovered : undefined] as const;
}

/** True where pointer effects exist (iPad). */
export const pointerAvailable = PointerHoverView !== null;

const styles = StyleSheet.create({
  column: { width: '100%', alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  gridSingle: { flexDirection: 'column', flexWrap: 'nowrap' },
  cell: { flexDirection: 'column' },
});
