import { StyleSheet, View } from 'react-native';
import { ContentUnavailable } from '../../design/states';
import { rhythm } from '../../design/tokens';

/**
 * An unknown person (people-20): the shared not-found pattern (sweep 2,
 * item 2), the system's unavailable view with Search centred under it at
 * every size.
 */
export function PersonNotFound({ onSearch }: { onSearch: () => void }) {
  return (
    <View style={styles.page}>
      <ContentUnavailable
        symbol="person.crop.circle.badge.questionmark"
        title="This person isn’t in OPAX"
        body="Profiles cover people who have served in an Australian parliament."
        testID="person-not-found"
        action={{
          label: 'Search parliamentarians',
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
});
