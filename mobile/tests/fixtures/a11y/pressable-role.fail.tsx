// a11y-static fixture: every `expect:` line must be reported, nothing else.
import { Pressable, Text } from 'react-native';
import { Pressable as DesignPressable } from '../../../src/design/pressable';

export function PressableRoleFixture({ onPress }: { onPress: () => void }) {
  return (
    <>
      <Pressable // expect: pressable-role
        accessibilityLabel="Open the bill"
        onPress={onPress}
      />
      <DesignPressable // expect: pressable-role
        onPress={onPress}
      >
        <Text>Open the bill</Text>
      </DesignPressable>
      <Pressable // expect: pressable-role
        accessible={false}
        onPress={onPress}
      >
        <Text>Not now</Text>
      </Pressable>
      <Pressable // expect: pressable-role
        accessibilityRole={undefined}
        accessibilityLabel="Menu"
        onPress={onPress}
      />
    </>
  );
}
