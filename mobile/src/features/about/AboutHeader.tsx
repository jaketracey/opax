import { type RefObject } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Heading, Text } from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';
import { aboutCopy as text } from './copy';

/**
 * The icon, the H1 and the full name, centred (account.md 3.2 item 1). The
 * icon is decorative; the H1 is the title the bar shows by scroll.
 */
export function AboutHeader({
  titleRef,
  onTitleLayout,
}: {
  titleRef: RefObject<View | null>;
  onTitleLayout: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.header} testID="about-header">
      <Image
        source={require('../../../assets/icon/icon.png')}
        style={styles.icon}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View ref={titleRef} onLayout={onTitleLayout} style={styles.titles}>
        <Heading level={1} kind="page" style={styles.center}>
          {text.name}
        </Heading>
        <Text wordSafe variant="secondary" style={styles.center}>
          {text.fullName}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: rhythm.block },
  // A 64 pt icon with the app icon's continuous corner and a 1 pt ring.
  icon: {
    width: 64,
    height: 64,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.dividerSubtle,
  },
  titles: { alignItems: 'center', gap: rhythm.line, alignSelf: 'stretch' },
  center: { textAlign: 'center' },
});
