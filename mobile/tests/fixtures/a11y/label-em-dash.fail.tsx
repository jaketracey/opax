// a11y-static fixture: every `expect:` line must be reported, nothing else.
// Em dashes are escaped here so the repository text carries none.
import { Pressable, Text, View } from 'react-native';

const hint = 'Opens the bill — and its votes';

export function LabelEmDashFixture({ onPress }: { onPress: () => void }) {
  const spoken = { accessibilityLabel: `Bill — ${'second'} reading` }; // expect: label-em-dash
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Bill — second reading'} // expect: label-em-dash
        accessibilityHint={hint} // expect: label-em-dash
        onPress={onPress}
      >
        <Text>Bill</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityActions={[{ name: 'copy', label: 'Copy — link' }]} // expect: label-em-dash
        onPress={onPress}
        {...spoken}
      >
        <Text>Copy</Text>
      </Pressable>
    </View>
  );
}
