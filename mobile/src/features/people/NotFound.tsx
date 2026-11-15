import { StyleSheet, View } from 'react-native';
import { SidebarSafe } from '../../design/adaptive';
import { ContentUnavailable } from '../../design/states';
import { rhythm } from '../../design/tokens';

/**
 * An unknown person (people-20): the shared not-found pattern (sweep 2,
 * item 2), the system's unavailable view with Search centred under it at
 * every size.
 */
export function PersonNotFound({
  onSearch,
  web,
}: {
  onSearch: () => void;
  /** The person's address on the website (navigation/web-fallback.ts). */
  web?: { label: string; onPress: () => void; testID?: string };
}) {
  return (
    // Clear of a vertical tab bar wherever it is drawn. Inside a Screen,
    // which already is, this adds nothing.
    <SidebarSafe style={styles.safe}>
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
          secondary={web}
        />
      </View>
    </SidebarSafe>
  );
}

const styles = StyleSheet.create({
  page: { gap: rhythm.heading },
  // As tall as its message, not the page: SidebarSafe fills by default.
  safe: { flex: 0 },
});
