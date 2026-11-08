import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useAccessibilitySize } from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';

/**
 * The one active-filters line (journeys/search.md 3.5; specs/search.md
 * 5.2 item 6): the applied filters in the sheet's order, "Labor · 2024 to
 * 2026", and a trailing tint "Clear". No chips. Search results and the
 * Topic page's Speeches draw the same line with the same words.
 */
export function FiltersLine({
  text,
  onClear,
  onPress,
  testID = 'results-filter-summary',
  clearTestID = 'results-filter-clear',
}: {
  text: string;
  onClear: () => void;
  /** Tapping the summary opens Filters, where there is a sheet to open. */
  onPress?: () => void;
  testID?: string;
  clearTestID?: string;
}) {
  const stacked = useAccessibilitySize();
  if (!text) return null;
  const summary = (
    <Text variant="secondary" wordSafe>
      {text}
    </Text>
  );
  return (
    <View style={[styles.line, stacked ? styles.stacked : null]}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Filters: ${text.replace(/ · /g, ', ')}`}
          onPress={onPress}
          testID={testID}
          style={styles.summary}
        >
          {summary}
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityLabel={`Filters: ${text.replace(/ · /g, ', ')}`}
          testID={testID}
          style={styles.summary}
        >
          {summary}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clear filters"
        hitSlop={8}
        onPress={onClear}
        testID={clearTestID}
        style={styles.clear}
      >
        <Text variant="secondary" style={{ color: colors.navy }}>
          Clear
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  summary: {
    flexShrink: 1,
    flexGrow: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  clear: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
});
