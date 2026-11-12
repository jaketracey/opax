import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';

/** Android scope choices keep whole labels at every font size. */
export function ScopeChips<T extends string>({
  options,
  value,
  onChange,
  label,
  testID,
}: {
  options: readonly { value: T; label: string; testID?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  testID: string;
}) {
  const scroll = useRef<ScrollView>(null);
  const positions = useRef(new Map<T, number>());
  return (
    <ScrollView
      ref={scroll}
      horizontal
      accessibilityRole="tablist"
      accessibilityLabel={label}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.choices}
      testID={testID}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="tab"
            accessibilityRole="tab"
            // RN has no public set-size/position props on both platforms.
            accessibilityLabel={`${option.label}, ${index + 1} of ${options.length}`}
            accessibilityState={{ selected }}
            onLayout={(e) => {
              positions.current.set(option.value, e.nativeEvent.layout.x);
            }}
            onPress={() => {
              if (selected) return;
              onChange(option.value);
              scroll.current?.scrollTo({
                x: Math.max(
                  0,
                  (positions.current.get(option.value) ?? 0) - rhythm.block,
                ),
                animated: false,
              });
            }}
            android_ripple={{ color: colors.dividerSubtle }}
            style={[styles.chip, selected ? styles.selected : null]}
            testID={option.testID}
          >
            <Text variant="secondary" tone={selected ? 'navy' : 'ink'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  choices: { gap: rhythm.tight, paddingVertical: rhythm.line },
  chip: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: rhythm.block,
    paddingVertical: rhythm.tight,
    borderRadius: 8,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.dividerDefault,
    overflow: 'hidden',
    backgroundColor: colors.paper,
  },
  selected: { backgroundColor: colors.navyWash, borderColor: colors.navy },
});
