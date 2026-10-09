import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Text, useAccessibilitySize } from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';

/**
 * A row with one destructive action behind a leftward swipe, as iOS lists
 * draw it: the row scrolls aside to show the action on the danger fill
 * (danger and its label pair as the danger IconButton draws them). The action
 * stays a button in the accessibility tree, after its row, so VoiceOver,
 * Full Keyboard Access and journeys reach it without the swipe; the row's
 * touch-and-hold menu offers it too. Until the row has a width it draws
 * without the swipe.
 */
export function SwipeRow({
  children,
  label,
  accessibilityLabel,
  onAction,
  disabled = false,
  testID,
}: {
  children: ReactNode;
  /** The drawn action: "Unfollow". */
  label: string;
  /** What VoiceOver says: "Unfollow Grayndler". */
  accessibilityLabel: string;
  onAction: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollView>(null);
  // The action grows with its label at accessibility sizes.
  const action = useAccessibilitySize() ? 200 : 104;
  const measure = (next: number) => {
    if (next > 0 && Math.abs(next - width) > 0.5) setWidth(next);
  };
  if (!width)
    return (
      <View onLayout={(event) => measure(event.nativeEvent.layout.width)}>
        {children}
      </View>
    );
  return (
    <View onLayout={(event) => measure(event.nativeEvent.layout.width)}>
      <ScrollView
        ref={scroll}
        horizontal
        bounces={false}
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        snapToOffsets={[0, action]}
        decelerationRate="fast"
        scrollEnabled={!disabled}
      >
        <View style={{ width }}>{children}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ disabled }}
          disabled={disabled}
          testID={testID}
          onPress={() => {
            scroll.current?.scrollTo({ x: 0, animated: false });
            onAction();
          }}
          style={({ pressed }) => [
            styles.action,
            {
              width: action,
              backgroundColor: pressed ? colors.dangerPressed : colors.danger,
            },
          ]}
        >
          <Icon name="minus.circle" size={17} tone="onNavy" />
          <Text wordSafe variant="control" tone="onNavy" style={styles.label}>
            {label}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.line,
    paddingHorizontal: rhythm.tight,
  },
  label: { textAlign: 'center', alignSelf: 'stretch' },
});
