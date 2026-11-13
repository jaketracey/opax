// a11y-static fixture: every `expect` line must be reported, nothing else.
import { Pressable, Text, View } from 'react-native';

export function StaleMarkerFixture({ onPress }: { onPress: () => void }) {
  return (
    <View>
      {/* a11y-ok: nothing below needs excusing */}
      {/* expect-above: stale-marker */}
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>Open</Text>
      </Pressable>
      {/* a11y-ok: */}
      {/* expect-above: stale-marker */}
      <Pressable // expect: pressable-role
        accessibilityLabel="Close"
        onPress={onPress}
      />
      {/* a11y-ok(image-label): scoped to images, so the role finding stands */}
      {/* expect-above: stale-marker */}
      <Pressable // expect: pressable-role
        accessibilityLabel="Share"
        onPress={onPress}
      />
    </View>
  );
}
