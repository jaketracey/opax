import {
  Children,
  useState,
  createContext,
  useContext,
  isValidElement,
  type ReactNode,
} from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { Href } from 'expo-router';
import { useAccessibilitySize } from './accessibility';
import { useLayout, gridColumns } from './adaptive';
import { RowLink, type RowMenuAction } from './row-link';
import { SurfaceContext } from './row-padding';
import { Icon, type SFSymbol } from './icon';
import { Text } from './text';
import {
  colors,
  accents,
  minimumTarget,
  radii,
  rhythm,
  type Role,
  type Accent,
} from './tokens';
import { designFlags } from './flags';

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
  if (!href && !onPress)
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
  testID,
}: {
  title: string;
  line: string;
  symbol: SFSymbol;
  ink: Accent | 'navy';
  href: Href;
  testID?: string;
}) {
  const lead = useContext(LeadTile);
  return (
    <RowLink href={href}>
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
        <View style={styles.tileText}>
          <Text wordSafe variant="subsectionTitle">
            {title}
          </Text>
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
    height: '100%',
  },
  leadTile: { flexDirection: 'row', alignItems: 'center' },
  tileText: { flexShrink: 1, gap: rhythm.line },
});
