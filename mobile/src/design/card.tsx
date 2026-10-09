import { createContext, useContext, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, hairline, radii, rhythm } from './tokens';

const InCard = createContext(false);
/** True inside a Card: a card never holds another. */
export const useInCard = () => useContext(InCard);

/**
 * A unit you can pick up: an edition, a lead, a report, a Today tile, an iPad
 * grid cell. Radius 12, raised, a 1pt subtle line, no shadow, padding 16.
 * Cards never nest and never wrap a list, a chart, In short or a section;
 * sections are separated by a rule, not a box. With `onPress` the whole card
 * is one link and darkens to sunken while pressed. `ground` replaces the
 * raised surface with a wash (the edition's subject).
 */
export function Card({
  children,
  onPress,
  ground,
  padded = true,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  style,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  ground?: ColorValue;
  /** False when the content runs to the edge (a header band, a picture). */
  padded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const nested = useInCard();
  if (nested && __DEV__)
    console.error(
      'Cards never nest: draw the inner unit as rows or a section instead.',
    );
  const face = [
    styles.card,
    padded ? styles.padded : null,
    ground ? { backgroundColor: ground } : null,
  ];
  const content = <InCard.Provider value>{children}</InCard.Provider>;
  if (!onPress)
    return (
      <View testID={testID} style={[...face, style]}>
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [...face, pressed ? styles.pressed : null, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.raised,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
    overflow: 'hidden',
  },
  padded: { padding: rhythm.block },
  pressed: { backgroundColor: colors.sunken },
});
