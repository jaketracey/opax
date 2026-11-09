import { StyleSheet, View } from 'react-native';
import { ContentUnavailable } from '../../design/states';
import { rhythm } from '../../design/tokens';

/**
 * An unknown person (people-20): the system's unavailable view, then Search
 * centred under its centred text. A hugging button aligns itself to the
 * leading edge, so a row centres it; at accessibility sizes it takes the
 * column's width, as every button does there.
 */
export function PersonNotFound({ onSearch }: { onSearch: () => void }) {
  return (
    <View style={styles.page}>
      <ContentUnavailable
        symbol="person.crop.circle"
        title="This person isn’t in OPAX"
        body="Profiles cover people who have served in an Australian parliament."
        testID="person-not-found"
        action={{
          label: 'Search',
          onPress: onSearch,
          testID: 'person-not-found-search',
          containerTestID: 'person-not-found-action',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: rhythm.heading },
  centred: { flexDirection: 'row', justifyContent: 'center' },
});
