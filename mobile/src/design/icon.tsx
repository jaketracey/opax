import { useWindowDimensions } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
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
  accessibilityLabel,
}: {
  name: SFSymbol;
  size?: number;
  tone?: Role;
  /** Only for an icon that conveys meaning on its own. */
  accessibilityLabel?: string;
}) {
  const { fontScale } = useWindowDimensions();
  const scaled = Math.round(size * Math.min(Math.max(fontScale, 1), 2));
  return (
    <SymbolView
      name={name}
      size={scaled}
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
