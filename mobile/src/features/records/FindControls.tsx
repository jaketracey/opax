import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';

/** Android's in-content find controls wrap instead of crowding the app bar. */
export function FindControls({
  query,
  current,
  total,
  onPrevious,
  onNext,
  onDone,
}: {
  query: string;
  current: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.find} testID="doc-find">
      <Text
        variant="secondary"
        wordSafe
        accessibilityLiveRegion="polite"
        testID="doc-find-status"
      >
        {total
          ? `Match ${current + 1} of ${total} for ${query}`
          : `No matches for ${query}`}
      </Text>
      <View style={styles.actions}>
        {[
          {
            label: 'Previous match',
            onPress: onPrevious,
            id: 'previous',
            disabled: !total,
          },
          {
            label: 'Next match',
            onPress: onNext,
            id: 'next',
            disabled: !total,
          },
          { label: 'Done', onPress: onDone, id: 'done', disabled: false },
        ].map((action) => (
          <Pressable
            key={action.id}
            accessibilityRole="button"
            accessibilityState={{ disabled: action.disabled }}
            disabled={action.disabled}
            onPress={action.onPress}
            android_ripple={{ color: colors.dividerSubtle }}
            style={styles.action}
            testID={`doc-find-${action.id}`}
          >
            <Text
              variant="secondary"
              tone={action.disabled ? 'inkSoft' : 'navy'}
              wordSafe
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  find: {
    gap: rhythm.tight,
    padding: rhythm.block,
    marginBottom: rhythm.block,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: rhythm.tight },
  action: {
    minHeight: 48,
    minWidth: 48,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: rhythm.tight,
    borderRadius: 8,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
