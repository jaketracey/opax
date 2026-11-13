// a11y-static fixture: every rule passes here; the one marker is used.
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Card } from '../../../src/design/card';
import { Disclosure } from '../../../src/design/disclosure';
import { Icon } from '../../../src/design/icon';
import { Pressable as DesignPressable } from '../../../src/design/pressable';
import { RowLink } from '../../../src/design/row-link';
import { Text } from '../../../src/design/text';
import { minimumTarget } from '../../../src/design/tokens';

const photo = { uri: 'file:///photo.jpg' };

function Row({ title }: { title: string }) {
  return <Text>{title}</Text>;
}

export function PassFixture({
  onPress,
  title,
}: {
  onPress: () => void;
  title: string;
}) {
  const art = <Image source={photo} />;
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>Open the bill</Text>
      </Pressable>
      <Pressable role="button" onPress={onPress}>
        {({ pressed }) => <Text>{pressed ? 'Opening' : title}</Text>}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={10}
        onPress={onPress}
        style={styles.glyph}
      >
        <Icon name="xmark" size={17} />
      </Pressable>
      <RowLink href="/bills">
        <Pressable style={styles.row}>
          <Row title={title} />
        </Pressable>
      </RowLink>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Pressable onPress={onPress} style={StyleSheet.absoluteFill} />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Photo of ${title}`}
        onPress={onPress}
        style={{ minHeight: Platform.select({ ios: 44, android: 48 }) }}
      >
        {art}
        <Image source={photo} />
      </Pressable>
      <Image source={photo} accessibilityLabel={`Portrait of ${title}`} />
      <Image source={photo} accessible={false} />
      <Image source={photo} alt="Parliament House at dusk" />
      {/* a11y-ok(image-label): fixture art, decorative beside its caption */}
      <Image source={photo} />
      <Card onPress={onPress}>
        <Text>Latest votes</Text>
      </Card>
      <Card href="/votes" accessibilityLabel="Latest votes">
        <Icon name="star" size={17} />
      </Card>
      <Card>
        <Icon name="star" size={17} />
      </Card>
      <Disclosure label="Sources" value="3">
        <Text>Body</Text>
      </Disclosure>
      <DesignPressable
        accessibilityRole="button"
        accessibilityLabel="Next"
        accessibilityHint="Shows the next sitting day"
        onPress={onPress}
        style={styles.compact}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry"
        onPress={onPress}
        style={[styles.target, Platform.OS === 'android' && styles.wide]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: { width: 28, height: 28 },
  row: { minHeight: minimumTarget },
  compact: { minHeight: 44, minWidth: 44 },
  target: { minHeight: minimumTarget, minWidth: minimumTarget },
  wide: { minWidth: 64 },
});
