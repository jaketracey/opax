// a11y-static fixture: every `expect:` line must be reported, nothing else.
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Pressable as DesignPressable } from '../../../src/design/pressable';

export function TargetSizeFixture({ onPress }: { onPress: () => void }) {
  return (
    <>
      <Pressable // expect: target-size
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onPress}
        style={styles.small}
      />
      <Pressable // expect: target-size
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Text>Next</Text>
      </Pressable>
      <DesignPressable // expect: target-size
        accessibilityRole="button"
        accessibilityLabel="Clear"
        hitSlop={Platform.OS === 'android' ? 8 : 4}
        onPress={onPress}
        style={{ width: 32, height: 32 }}
      />
      <DesignPressable // expect: target-size
        accessibilityRole="button"
        accessibilityLabel="Bar"
        onPress={onPress}
        style={{ position: 'absolute', top: 0, width: 40, height: 40 }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  small: { width: 32, height: 32 },
  row: { minHeight: 44, paddingHorizontal: 16 },
  pressed: { opacity: 0.6 },
});
