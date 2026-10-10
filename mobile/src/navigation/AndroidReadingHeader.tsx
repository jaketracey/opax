import type { NativeStackHeaderProps } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../design/icon';
import { fonts, light, rhythm } from '../design/tokens';
import { androidBar } from './chrome';

/**
 * A measured Android header: long reading titles wrap at the user's size.
 * It matches the native Android bar on the other screens: flat paper, the
 * Material back arrow, the title at the bar's size and a navy text action.
 */
export function AndroidReadingHeader({
  navigation,
  options,
  back,
}: NativeStackHeaderProps) {
  const right = options.headerRight?.({
    tintColor: light.navy,
    backgroundColor: light.paper,
    canGoBack: !!back,
  });
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.bar}>
      <View style={styles.row}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="header-back"
            onPress={() => navigation.goBack()}
            style={styles.action}
          >
            <Icon name="arrow.left" size={24} maxScale={1} />
          </Pressable>
        ) : null}
        <Text accessibilityRole="header" style={styles.title}>
          {typeof options.headerTitle === 'string'
            ? options.headerTitle
            : options.title}
        </Text>
        {right ??
          (back ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              testID="header-done"
              onPress={() => navigation.goBack()}
              style={[styles.action, styles.trailing]}
            >
              <Text maxFontSizeMultiplier={1.5} style={styles.done}>
                Done
              </Text>
            </Pressable>
          ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: light.paper },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    paddingHorizontal: rhythm.screen,
    paddingVertical: rhythm.tight,
  },
  title: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: androidBar.title,
    color: light.ink,
  },
  action: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
  trailing: { alignItems: 'flex-end' },
  done: {
    fontFamily: fonts.sansSemiBold,
    fontSize: androidBar.action,
    color: light.navy,
  },
});
