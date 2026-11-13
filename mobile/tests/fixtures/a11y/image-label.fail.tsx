// a11y-static fixture: every `expect:` line must be reported, nothing else.
import { Animated, Image, Pressable, View } from 'react-native';

const photo = { uri: 'file:///photo.jpg' };

export function ImageLabelFixture({ onPress }: { onPress: () => void }) {
  return (
    <View>
      <Image // expect: image-label
        source={photo}
      />
      <View accessible={false}>
        <Animated.Image // expect: image-label
          source={photo}
        />
      </View>
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={onPress}
        // a11y-ok(pressable-role): fixture scrim, the image inside is the case under test
      >
        <Image // expect: image-label
          source={photo}
        />
      </Pressable>
    </View>
  );
}
