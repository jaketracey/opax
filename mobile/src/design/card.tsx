import { Pressable } from './pressable';
import type { Href } from 'expo-router';
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAccessibilitySize } from './accessibility';
import { gridColumns, useLayout } from './adaptive';
import { ContextMenu } from './context-menu';
import { designFlags } from './flags';
import { Icon, type SFSymbol } from './icon';
import { RowLink, type RowMenuAction } from './row-link';
import { SurfaceContext } from './row-padding';
import { symbols } from './symbols';
import { Text } from './text';
import {
  accents,
  colors,
  minimumTarget,
  radii,
  rhythm,
  type Accent,
  type Role,
} from './tokens';

const InCard = createContext(false);
export const useInCard = () => useContext(InCard);
const LeadTile = createContext(false);
export function Card({
  children,
  href,
  onPress,
  zoom,
  menu,
  ground,
  shadow,
  padded = true,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityActions = [],
  style,
  testID,
}: {
  children: ReactNode;
  href?: Href;
  onPress?: () => void;
  zoom?: boolean;
  menu?: RowMenuAction[];
  ground?: Role | ColorValue;
  shadow?: 'edition';
  padded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
  accessibilityActions?: {
    name: string;
    label: string;
    onAction: () => void;
  }[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const nested = useInCard();
  const { width } = useWindowDimensions();
  const dark = useColorScheme() === 'dark';
  if (nested && __DEV__)
    console.error(
      'Cards never nest: draw the inner unit as rows or a section instead.',
    );
  const band = typeof ground === 'string' && ground.startsWith('band');
  const fill =
    typeof ground === 'string' && ground in colors
      ? colors[ground as Role]
      : ground;
  const face = [
    nested ? undefined : styles.card,
    padded && !nested ? { padding: width < 375 ? 16 : 20 } : null,
    fill ? { backgroundColor: fill } : null,
  ];
  const content = (
    <InCard.Provider value>
      <SurfaceContext.Provider value="raised">
        {children}
      </SurfaceContext.Provider>
    </InCard.Provider>
  );
  const wrapShadow = (element: React.ReactElement) =>
    shadow === 'edition' && !dark && !nested ? (
      <View style={styles.editionShadow}>{element}</View>
    ) : (
      element
    );
  if (!href && !onPress && !menu?.length)
    return wrapShadow(
      <View testID={testID} style={[...face, style]}>
        {content}
      </View>,
    );
  const card = (
    <Pressable
      accessible
      accessibilityRole={href ? 'link' : accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions.map(({ name, label }) => ({
        name,
        label,
      }))}
      onAccessibilityAction={(event) =>
        accessibilityActions
          .find((action) => action.name === event.nativeEvent.actionName)
          ?.onAction()
      }
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        ...face,
        pressed && !band ? { backgroundColor: colors.sunken } : null,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
  return wrapShadow(
    href ? (
      <RowLink href={href} menu={menu} zoom={zoom}>
        {card}
      </RowLink>
    ) : menu?.length ? (
      <ContextMenu items={menu}>{card}</ContextMenu>
    ) : (
      card
    ),
  );
}
export function Tile({
  title,
  line,
  symbol,
  ink,
  href,
  menu,
  testID,
}: {
  menu?: RowMenuAction[];
  title: string;
  line: string;
  symbol: SFSymbol;
  ink: Accent | 'navy';
  href: Href;
  testID?: string;
}) {
  const lead = useContext(LeadTile);
  const [firstLineHeight, setFirstLineHeight] = useState<number>();
  return (
    <RowLink href={href} menu={menu}>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={`${title}, ${line}`}
        testID={testID}
        style={({ pressed }) => [
          styles.tile,
          lead ? styles.leadTile : null,
          pressed ? { backgroundColor: colors.sunken } : null,
        ]}
      >
        <Icon
          name={symbol}
          size={28}
          maxScale={1.5}
          tone={
            designFlags.categorySymbols
              ? ink === 'navy'
                ? 'navy'
                : accents[ink].ink
              : 'inkSoft'
          }
          {...{ type: 'hierarchical' as const }}
        />
        <View
          style={
            lead ? [styles.tileText, styles.tileTextLead] : styles.tileText
          }
        >
          <View style={styles.tileTitle}>
            <Text
              wordSafe
              variant="subsectionTitle"
              accessibilityRole="text"
              style={styles.tileHeading}
              onTextLayout={(event) =>
                setFirstLineHeight(event.nativeEvent.lines[0]?.height)
              }
            >
              {title}
            </Text>
            <View style={{ height: firstLineHeight, justifyContent: 'center' }}>
              <Icon
                name={symbols.chevron}
                size={13}
                maxScale={1.5}
                tone="inkFaint"
                weight="semibold"
              />
            </View>
          </View>
          <Text wordSafe variant="footnote">
            {line}
          </Text>
        </View>
      </Pressable>
    </RowLink>
  );
}
export function TileGrid({
  children,
  lead = false,
  testID,
}: {
  children: ReactNode;
  lead?: boolean;
  testID?: string;
}) {
  const { width, window, regular } = useLayout();
  const stacked = useAccessibilitySize();
  const [measuredWidth, setWidth] = useState<number | null>(null);
  const gap = rhythm.tight + rhythm.line;
  const available = measuredWidth ?? width;
  const count =
    stacked || window.width < 375
      ? 1
      : regular
        ? gridColumns(available, {
            columns: { regular: 3, wide: 4 },
            minItemWidth: 150,
            gap,
          })
        : 2;
  const items = Children.toArray(children);
  return (
    <View
      testID={testID}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}
    >
      {items.map((child, index) => {
        const span =
          count > 1 &&
          (lead
            ? index === 0
            : index === items.length - 1 && items.length % count === 1)
            ? Math.min(2, count)
            : 1;
        return (
          <View
            key={isValidElement(child) ? (child.key ?? index) : index}
            // The cell: a column the row stretches to its line's height,
            // which the tile inside fills with flexGrow (never a percentage).
            style={{
              width:
                ((available - gap * (count - 1)) / count) * span +
                gap * (span - 1),
            }}
          >
            <LeadTile.Provider value={lead && index === 0 && count > 1}>
              {child}
            </LeadTile.Provider>
          </View>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  editionShadow: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  tile: {
    backgroundColor: colors.raised,
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    padding: rhythm.block,
    minHeight: minimumTarget,
    gap: rhythm.tight,
    // Fills its cell, so tiles on one line share the line's height: TileGrid
    // stretches each cell to its line and the tile grows into it. Never a
    // percentage: in a wrapping row Yoga resolves a percentage height
    // against the whole grid's measured height, and every layout pass
    // compounds it (build 36's More to explore grid laid out 48,000 pt tall
    // once RowTrigger started carrying the tile's own style into the Link).
    flexGrow: 1,
  },
  leadTile: { flexDirection: 'row', alignItems: 'center' },
  tileText: { flexShrink: 1, gap: rhythm.line },
  tileTextLead: { flex: 1 },
  tileTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
  },
  tileHeading: { flex: 1 },
});
