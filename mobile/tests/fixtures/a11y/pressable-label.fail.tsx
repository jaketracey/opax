// a11y-static fixture: every `expect:` line must be reported, nothing else.
import { Pressable, View } from 'react-native';
import { Card } from '../../../src/design/card';
import { Disclosure } from '../../../src/design/disclosure';
import { Icon } from '../../../src/design/icon';
import { Text } from '../../../src/design/text';

export function PressableLabelFixture({ onPress }: { onPress: () => void }) {
  const glyph = <Icon name="xmark" size={17} />;
  return (
    <View>
      <Pressable // expect: pressable-label
        accessibilityRole="button"
        onPress={onPress}
      >
        <View>
          <Icon name="xmark" size={17} />
        </View>
      </Pressable>
      <Pressable // expect: pressable-label
        accessibilityRole="button"
        accessibilityLabel=""
        onPress={onPress}
      >
        {glyph}
      </Pressable>
      <Pressable // expect: pressable-label
        accessibilityRole="button"
        onPress={onPress}
      >
        <Text accessibilityElementsHidden>Hidden words</Text>
      </Pressable>
      <Card // expect: pressable-label
        onPress={onPress}
      >
        <Icon name="star" size={17} />
      </Card>
      <Disclosure // expect: pressable-label
        testID="fixture-disclosure"
      >
        <Text>Body</Text>
      </Disclosure>
    </View>
  );
}
