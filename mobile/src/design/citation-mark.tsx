import { StyleSheet, View } from 'react-native';
import { Text } from './text';
import { colors, textStyles } from './tokens';

/**
 * Ask's citation numeral (specs/ask.md 9.1, journeys/ask.md 4.5 and 13
 * item 15). Two forms of one mark:
 *
 * - `CitationMark`, inline in an answer's sentence: a nested `Text` link,
 *   never a View, so it scales with the paragraph, keeps text selection and
 *   holds its line height. Nested spans take no radius, padding or hitSlop,
 *   so the numeral sits on a `navyWash` ground with a thin space each side.
 *   Every source also has a full 44 pt row (Records cited, the source sheet,
 *   the sheet's Previous and Next), so no source depends on this target.
 *   `fallback="superscript"` draws a tint superscript with no ground, for
 *   when the filled mark crowds the line at accessibility sizes.
 * - `CitationBadge`, leading a row: a static capsule with the same numeral.
 *
 * Adjacent citations merge into one mark ("1, 2", "1 to 3"); the caller
 * passes the merged label and the first number opens.
 */
const THIN = ' ';
export function citationMarkLabel(
  numbers: readonly number[],
  title?: string,
): string {
  if (numbers.length > 1)
    return `Sources ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}. Double-tap to show the first passage.`;
  return `Source ${numbers[0]}${title ? `, ${title}` : ''}. Double-tap to show the passage.`;
}
export function CitationMark({
  numbers,
  label,
  title,
  onPress,
  selected = false,
  fallback,
  testID,
}: {
  /** The merged run, first number first. */
  numbers: readonly number[];
  /** "1", "1, 2", "1 to 3". */
  label: string;
  /** The first source's title and date, for VoiceOver. */
  title?: string;
  onPress?: () => void;
  /** The mark whose source the open citation sheet shows. */
  selected?: boolean;
  fallback?: 'superscript';
  testID?: string;
}) {
  const superscript = fallback === 'superscript';
  return (
    <>
      {' '}
      <Text
        accessibilityRole="link"
        accessibilityLabel={citationMarkLabel(numbers, title)}
        accessibilityState={selected ? { selected } : undefined}
        suppressHighlighting={false}
        onPress={onPress}
        testID={testID}
        style={
          superscript
            ? styles.superscript
            : [styles.filled, selected ? styles.selected : null]
        }
      >
        {superscript ? label : `${THIN}${label}${THIN}`}
      </Text>
    </>
  );
}
export function CitationBadge({
  label,
  testID,
}: {
  label: string;
  testID?: string;
}) {
  return (
    <View
      style={styles.badge}
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Text variant="capsule" maxFontSizeMultiplier={1.5} style={styles.badgeText}>
        {label}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  filled: {
    fontWeight: '600',
    color: colors.navy,
    backgroundColor: colors.navyWash,
  },
  selected: {
    color: colors.raised,
    backgroundColor: colors.navy,
  },
  superscript: {
    fontWeight: '600',
    color: colors.navy,
    fontSize: textStyles.capsule.fontSize,
    lineHeight: textStyles.capsule.fontSize,
    textAlignVertical: 'top',
  },
  badge: {
    alignSelf: 'flex-start',
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: colors.navyWash,
    alignItems: 'center',
  },
  badgeText: { color: colors.navy, fontWeight: '600' },
});
