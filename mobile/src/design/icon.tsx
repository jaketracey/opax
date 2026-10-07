import { Platform, useWindowDimensions } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { androidSymbol } from './android-symbols';
import { colors, type Role } from './tokens';

export type { SFSymbol };

/**
 * An SF Symbol, decorative by default: the control or row around it carries
 * the accessible name. Grows with text size (to twice its base) so icons stay
 * in proportion with their labels.
 */
export function Icon({
  name,
  size = 20,
  tone = 'navy',
  maxScale = 2,
  accessibilityLabel,
}: {
  name: SFSymbol;
  size?: number;
  tone?: Role;
  /** The most the symbol grows with text size (a tile caps it lower). */
  maxScale?: number;
  /** Only for an icon that conveys meaning on its own. */
  accessibilityLabel?: string;
}) {
  const { fontScale } = useWindowDimensions();
  const scaled = Math.round(size * Math.min(Math.max(fontScale, 1), maxScale));
  return (
    <SymbolView
      name={Platform.OS === 'android' ? { android: androidSymbol(name) } : name}
      // Android's Material glyph is a Text: its native font scaling supplies
      // the factor already included in our box. Avoid applying it twice.
      size={Platform.OS === 'android' ? scaled / fontScale : scaled}
      tintColor={colors[tone]}
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
