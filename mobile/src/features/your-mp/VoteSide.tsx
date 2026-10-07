import { StyleSheet, View } from 'react-native';
import { Text } from '../../design/primitives';
import { colors, radius } from '../../design/tokens';

/**
 * "For" or "Against" in a small tinted label above a bill vote. Meaning is in
 * the word; the votes accent only marks the category.
 */
export function VoteSide({ side }: { side: 'for' | 'against' }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.label}
    >
      <Text variant="chip" tone="votesInk">
        {side === 'for' ? 'Voted for' : 'Voted against'}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  label: {
    alignSelf: 'flex-start',
    backgroundColor: colors.votesWash,
    borderRadius: radius,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginBottom: 2,
  },
});
