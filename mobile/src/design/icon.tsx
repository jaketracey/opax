import { Platform, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { androidSymbol } from './android-symbols';
import { useReduceMotion } from './accessibility';
import { designFlags } from './flags';
import { symbols, type SFSymbol } from './symbols';
import { accents, colors, type Accent, type Role } from './tokens';

export type { SFSymbol } from './symbols';
export const EXTERNAL_GLYPH = symbols.external;
const categoryInks = new Set(
  Object.values(accents).map((accent) => accent.ink),
);

/** Decorative unless named. Category ink belongs to the symbol alone. */
export function Icon({
  name,
  size = 20,
  tone = 'navy',
  ink,
  weight = 'regular',
  scale = 'medium',
  type = 'monochrome',
  animation = null,
  maxScale = 1.5,
  accessibilityLabel,
}: {
  name: SFSymbol;
  size?: number;
  tone?: Role;
  ink?: Accent | 'navy';
  weight?: 'regular' | 'semibold' | 'bold';
  scale?: 'small' | 'medium' | 'large';
  type?: 'monochrome' | 'hierarchical';
  animation?: 'bounce' | null;
  maxScale?: number;
  accessibilityLabel?: string;
}) {
  const { fontScale } = useWindowDimensions();
  const reduced = useReduceMotion();
  const scaled = Math.round(size * Math.min(Math.max(fontScale, 1), maxScale));
  const requested =
    type === 'hierarchical' && ink
      ? ink === 'navy'
        ? 'navy'
        : accents[ink].ink
      : tone;
  const colour =
    !designFlags.categorySymbols && categoryInks.has(requested)
      ? 'navy'
      : requested;
  const android = Platform.OS === 'android';
  return (
    <SymbolView
      name={android ? { android: androidSymbol(name) } : name}
      size={android ? scaled / Math.max(fontScale, Number.EPSILON) : scaled}
      tintColor={colors[colour]}
      {...(!android
        ? {
            weight,
            scale,
            type,
            animationSpec:
              animation && !reduced
                ? {
                    effect: { type: animation },
                    repeating: false,
                    repeatCount: 1,
                  }
                : undefined,
          }
        : {})}
      style={{ width: scaled, height: scaled }}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={
        accessibilityLabel ? 'yes' : 'no-hide-descendants'
      }
    />
  );
}
