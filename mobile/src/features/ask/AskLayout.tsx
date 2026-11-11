import { type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccessibilitySize } from '../../design/accessibility';
import {
  columns,
  splitPaneWidth,
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
} from '../../design/fold';
import {
  colors,
  hairline,
  layout,
  rhythm,
  type Role,
} from '../../design/tokens';

/** One conversation and one composer stay mounted as the sources dock changes. */
export function AskColumns({
  docked,
  content,
  dock,
  sources,
  keyboard,
  ground,
}: {
  docked: boolean;
  content: ReactNode;
  dock: ReactNode;
  sources: ReactNode;
  keyboard: number;
  ground: Role;
}) {
  const region = useLayout();
  const large = useAccessibilitySize();
  const reserved = useReservedRegions();
  const fold = docked ? activeVerticalFold(reserved.divisions) : null;
  const sides = fold
    ? sidesOf(fold, { x: 0, y: 0, width: region.width, height: region.height })
    : null;
  const split = sides && 'leading' in sides ? sides : null;
  const paneWidth =
    split?.trailing.width ?? splitPaneWidth(region.width, large, region.rule);
  return (
    <View style={styles.row}>
      <View
        testID="ask-conversation-column"
        style={split ? { width: split.leading.width } : styles.fill}
      >
        {content}
        <SafeAreaView
          edges={
            docked
              ? []
              : keyboard
                ? ['left', 'right']
                : ['left', 'right', 'bottom']
          }
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
              ground={ground}
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
  ground,
  children,
}: {
  docked: boolean;
  keyboard: number;
  ground: Role;
  children: ReactNode;
}) {
  const [onLayout, measured] = useMeasuredRegion();
  const region = useLayout();
  const reserved = useReservedRegions();
  const [height, setHeight] = useState(0);
  const bounds: Rect = {
    x: 0,
    y: 0,
    width: measured?.width ?? region.width,
    height: Math.max(0, (measured?.height ?? region.height) - keyboard),
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
  return (
    <View
      style={styles.fill}
      pointerEvents="box-none"
      onLayout={onLayout}
      testID="ask-composer-bounds"
    >
      <View
        testID="ask-composer-position"
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        style={[
          styles.position,
          { left: position.x, top: position.y, width: position.width },
        ]}
      >
        <PhoneDock
          keyboard={keyboard}
          ground={ground}
          docked={docked}
          positioned
        >
          {children}
        </PhoneDock>
      </View>
    </View>
  );
}

/** The same dock band changes its placement without replacing the input. */
export function PhoneDock({
  keyboard,
  ground,
  children,
  docked = false,
  positioned = false,
}: {
  keyboard: number;
  ground: Role;
  children: ReactNode;
  docked?: boolean;
  positioned?: boolean;
}) {
  const margin = useScreenMargin();
  return (
    <SafeAreaView
      edges={positioned || keyboard ? [] : ['bottom']}
      mode="padding"
      pointerEvents="box-none"
      style={[
        positioned ? null : styles.phoneDock,
        docked
          ? { borderTopWidth: hairline, borderTopColor: colors.dividerDefault }
          : null,
        keyboard || docked
          ? {
              paddingBottom: positioned ? 0 : keyboard,
              paddingTop: rhythm.tight,
              backgroundColor: colors[ground],
            }
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
  position: { position: 'absolute' },
  phoneDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  dock: { width: '100%', alignSelf: 'center', paddingBottom: rhythm.tight },
});
