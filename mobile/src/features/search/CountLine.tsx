import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useAccessibilitySize } from '../../design/primitives';
import { rhythm } from '../../design/tokens';

/**
 * The results' first line: the count ("22 records"), with the sort and share
 * beside it. One line instead of a heading, a big figure and a sort row; it
 * stacks at accessibility sizes so neither side is squeezed.
 */
export function CountLine({
  label,
  testID,
  children,
}: {
  label: string;
  testID?: string;
  children?: ReactNode;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View style={[styles.line, stacked ? styles.stacked : null]}>
      <Text
        wordSafe
        variant="strong"
        accessibilityRole="header"
        testID={testID}
        style={stacked ? null : styles.count}
      >
        {label}
      </Text>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rhythm.tight,
  },
  stacked: { flexDirection: 'column', alignItems: 'stretch' },
  count: { flexShrink: 1 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.line,
  },
});
