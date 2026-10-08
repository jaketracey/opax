import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text, useAccessibilitySize } from '../../design/primitives';
import { colors, minimumTarget, rhythm } from '../../design/tokens';

/** One wrapping, native-looking switch with a 44pt target across the row. */
export function ToggleRow({
  label,
  checked,
  onChange,
  testID,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      testID={testID}
      onPress={onChange}
      style={({ pressed }) => [
        styles.row,
        stacked && styles.stacked,
        pressed && { backgroundColor: colors.sunken },
      ]}
    >
      <Text variant="strong" wordSafe style={styles.label}>
        {label}
      </Text>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch value={checked} trackColor={{ true: colors.navy }} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    minHeight: minimumTarget,
    paddingVertical: rhythm.tight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  label: { flexShrink: 1, flexGrow: 1 },
});
