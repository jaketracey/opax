import {
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccessibilitySize } from '../../design/accessibility';
import {
  columns,
  isPad,
  splitPaneWidth,
  useAdaptiveDevice,
  useLayout,
  useMeasuredRegion,
  useScreenMargin,
} from '../../design/adaptive';
import { ReservedRegionArea, useReservedRegions } from '../../design/fold-area';
import {
  activeVerticalFold,
  placeClear,
  sidesOf,
  type Rect,
  type Region,
} from '../../design/fold';
import {
  colors,
  hairline,
  layout,
  rhythm,
  type Role,
} from '../../design/tokens';
import { KeyboardLift, type Obstacle } from './keyboard';

/**
 * iOS lifts the resting composer with the keyboard frame by frame
 * (KeyboardLift). Android lays it out above the IME once the window has
 * resized, as before.
 */
const keyboardTracked = () => Platform.OS === 'ios';

/** One conversation and one composer stay mounted as the sources dock changes. */
export function AskColumns({
  docked,
  content,
  dock,
  sources,
  empty,
  keyboard,
  keyboardVisible = keyboard > 0,
  ground,
  onComposerClearance,
}: {
  docked: boolean;
  content: ReactNode;
  /**
   * Docked only: what the conversation column shows over its empty paper
   * when nothing is asked (AskEmptyState). Drawn in the room between the
   * column's top and the composer band.
   */
  empty?: ReactNode;
  dock: ReactNode;
  sources: ReactNode;
  keyboard: number;
  keyboardVisible?: boolean;
  ground: Role;
  /**
   * How far the resting composer's band (its clear top padding included)
   * stands above the conversation column's bottom edge; 0 while docked or
   * not yet laid out. The keyboard's lift does not change it.
   */
  onComposerClearance?: (clearance: number) => void;
}) {
  const region = useLayout();
  // The overlay has no top inset, so the composer area's y is the column's.
  const [columnHeight, setColumnHeight] = useState(0);
  const [restTop, setRestTop] = useState<number | null>(null);
  const clearance =
    !docked && columnHeight > 0 && restTop !== null
      ? Math.max(0, Math.round(columnHeight - restTop))
      : 0;
  useEffect(() => {
    onComposerClearance?.(clearance);
  }, [clearance, onComposerClearance]);
  const large = useAccessibilitySize();
  const reserved = useReservedRegions();
  const fold = docked ? activeVerticalFold(reserved.divisions) : null;
  const sides = fold
    ? sidesOf(fold, { x: 0, y: 0, width: region.width, height: region.height })
    : null;
  const split = sides && 'leading' in sides ? sides : null;
  const paneWidth =
    split?.trailing.width ?? splitPaneWidth(region.width, large, region.rule);
  // AskScreen's SidebarSafe already pads the screen's left and right insets
  // on iPad and an adaptive iPhone (the Duo's tab rail). This native view
  // pads by the screen's insets again, so there it keeps only the bottom:
  // the folded Duo's composer stopped a whole rail (80pt) short of the
  // column, and its placeholder wrapped.
  const adaptive = useAdaptiveDevice();
  const sidesOwned = isPad || (Platform.OS === 'ios' && adaptive);
  const composerEdges: ('left' | 'right' | 'bottom')[] = [
    ...(sidesOwned ? [] : (['left', 'right'] as const)),
    // The bottom inset goes only where the window or layout makes room for
    // the keyboard itself (Android). iOS keeps it: KeyboardLift measures the
    // gap below the resting area, so dropping it too would sit the bar 34pt
    // low on a phone.
    ...(keyboardVisible && !keyboardTracked() ? [] : (['bottom'] as const)),
  ];
  return (
    // These wrappers must be stacking contexts. Fabric can otherwise hoist
    // the scroll view beside an empty wrapper that stops UIKit's discovery.
    <View style={styles.row} collapsable={false}>
      <View
        testID="ask-conversation-column"
        collapsable={false}
        style={split ? { width: split.leading.width } : styles.fill}
        onLayout={(event) => setColumnHeight(event.nativeEvent.layout.height)}
      >
        {content}
        {/* After the scroll view, which stays the column's first child for
            UIKit's large-title tracking. It has the room above the composer
            band (and the keyboard) and takes no touches. */}
        {docked && empty ? (
          <View
            pointerEvents="none"
            testID="ask-empty-area"
            style={[
              styles.emptyArea,
              {
                bottom:
                  (restTop !== null ? Math.max(0, columnHeight - restTop) : 0) +
                  (keyboardVisible ? keyboard : 0),
              },
            ]}
          >
            {empty}
          </View>
        ) : null}
        <SafeAreaView
          edges={docked ? [] : composerEdges}
          mode="padding"
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
        >
          <ReservedRegionArea
            style={styles.composerArea}
            testID="ask-composer-area"
          >
            <ComposerPosition
              docked={docked}
              keyboard={keyboard}
              keyboardVisible={keyboardVisible}
              ground={ground}
              onRest={setRestTop}
            >
              {dock}
            </ComposerPosition>
          </ReservedRegionArea>
        </SafeAreaView>
      </View>
      <View
        testID="ask-sources-column"
        style={
          docked
            ? { width: paneWidth, marginLeft: fold?.width ?? 0 }
            : styles.hidden
        }
      >
        {sources}
      </View>
    </View>
  );
}

function ComposerPosition({
  docked,
  keyboard,
  keyboardVisible,
  ground,
  children,
  onRest,
}: {
  docked: boolean;
  keyboard: number;
  keyboardVisible: boolean;
  ground: Role;
  children: ReactNode;
  /** The band's resting top in the area, null until both are laid out. */
  onRest?: (top: number | null) => void;
}) {
  const [onLayout, measured] = useMeasuredRegion();
  const region = useLayout();
  const reserved = useReservedRegions();
  const [height, setHeight] = useState(0);
  const area = useRef<View>(null);
  const tracked = keyboardTracked();
  const headerBottom = useContext(HeaderHeightContext) ?? 0;
  const areaHeight = measured?.height ?? region.height;
  const bounds: Rect = {
    x: 0,
    y: 0,
    width: measured?.width ?? region.width,
    height: Math.max(
      0,
      Platform.OS === 'android' && keyboardVisible
        ? // The tab bar's old height can survive for a few frames after
          // DidShow. Anchor to the keyboard in window coordinates, keeping
          // the same bottom as the area expands when the tab bar hides.
          Math.min(areaHeight, region.window.height - headerBottom - keyboard)
        : areaHeight - (tracked ? 0 : keyboard),
    ),
  };
  const fold = activeVerticalFold(reserved.divisions);
  const sides = fold ? sidesOf(fold, bounds) : null;
  // Size the band for one side before placeClear preserves that size.
  const width =
    sides && 'leading' in sides
      ? Math.max(sides.leading.width, sides.trailing.width)
      : bounds.width;
  const position = placeClear(
    { x: (bounds.width - width) / 2, y: bounds.height - height, width, height },
    reserved,
    bounds,
  );
  // Rising with the keyboard, the composer stays clear of a horizontal fold
  // or a camera above it by moving above that too.
  const { x: restX, y: restY, width: restWidth } = position;
  const rest = useMemo(() => ({ top: restY, height }), [restY, height]);
  const restKnown = !!measured && height > 0;
  useEffect(() => {
    onRest?.(restKnown ? restY : null);
  }, [onRest, restKnown, restY]);
  const obstacles = useMemo(
    () =>
      liftObstacles(reserved, {
        x: restX,
        y: restY,
        width: restWidth,
        height,
      }),
    [reserved, restX, restY, restWidth, height],
  );
  const style = [
    styles.position,
    { left: position.x, top: position.y, width: position.width },
  ];
  const onPositionLayout = (event: LayoutChangeEvent) =>
    setHeight(event.nativeEvent.layout.height);
  const dock = (
    <PhoneDock
      keyboard={keyboard}
      keyboardVisible={keyboardVisible}
      ground={ground}
      docked={docked}
      positioned
    >
      {children}
    </PhoneDock>
  );
  return (
    <View
      ref={area}
      style={styles.fill}
      pointerEvents="box-none"
      onLayout={onLayout}
      collapsable={false}
      testID="ask-composer-bounds"
    >
      {tracked ? (
        <KeyboardLift
          area={area}
          layoutKey={`${bounds.width}x${bounds.height}`}
          rest={rest}
          obstacles={obstacles}
          style={style}
          onLayout={onPositionLayout}
          testID="ask-composer-position"
        >
          {dock}
        </KeyboardLift>
      ) : (
        <View
          testID="ask-composer-position"
          onLayout={onPositionLayout}
          style={style}
        >
          {dock}
        </View>
      )}
    </View>
  );
}

/**
 * Active horizontal folds and cameras across the composer's column, wholly
 * above its resting place, lowest first, in the area's points.
 */
export function liftObstacles(
  reserved: { divisions: readonly Region[]; occlusions: readonly Region[] },
  composer: Rect,
): Obstacle[] {
  return [
    ...reserved.divisions.filter((r) => r.width > r.height),
    ...reserved.occlusions,
  ]
    .filter(
      (r) =>
        r.active &&
        r.x < composer.x + composer.width &&
        r.x + r.width > composer.x &&
        r.y + r.height <= composer.y,
    )
    .map((r) => ({ top: r.y, bottom: r.y + r.height }))
    .sort((a, b) => b.top - a.top);
}

/** The same dock band changes its placement without replacing the input. */
export function PhoneDock({
  keyboard,
  keyboardVisible = keyboard > 0,
  ground,
  children,
  docked = false,
  positioned = false,
}: {
  keyboard: number;
  keyboardVisible?: boolean;
  ground: Role;
  children: ReactNode;
  docked?: boolean;
  positioned?: boolean;
}) {
  const margin = useScreenMargin();
  return (
    <SafeAreaView
      edges={positioned || keyboardVisible ? [] : ['bottom']}
      mode="padding"
      pointerEvents="box-none"
      style={[
        positioned ? null : styles.phoneDock,
        docked
          ? { borderTopWidth: hairline, borderTopColor: colors.dividerDefault }
          : null,
        keyboardVisible || docked
          ? {
              paddingBottom: positioned ? 0 : keyboard,
              paddingTop: rhythm.tight,
              backgroundColor: colors[ground],
            }
          : positioned && keyboardTracked()
            ? // iOS keeps the band's (clear) top padding at rest, so the
              // composer's height does not change as the keyboard starts:
              // only KeyboardLift moves it.
              { paddingTop: rhythm.tight }
            : null,
      ]}
      testID="ask-phone-dock"
    >
      <View
        style={[
          styles.dock,
          { paddingHorizontal: docked ? margin : layout.screenMargin },
          docked ? { maxWidth: columns.readable } : null,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // The measuring area fills the overlay; only its composer accepts touches.
  composerArea: { flex: 1, pointerEvents: 'box-none' },
  row: { flex: 1, flexDirection: 'row' },
  hidden: { display: 'none' },
  emptyArea: { position: 'absolute', top: 0, left: 0, right: 0 },
  position: { position: 'absolute' },
  phoneDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  dock: { width: '100%', alignSelf: 'center', paddingBottom: rhythm.tight },
});
