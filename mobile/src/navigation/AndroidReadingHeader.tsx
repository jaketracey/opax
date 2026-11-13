import type { NativeStackHeaderProps } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  ToastAndroid,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../design/text';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Icon } from '../design/icon';
import { symbols } from '../design/symbols';
import { colors, rhythm, textStyles } from '../design/tokens';
import { androidHeaderBar } from './chrome';

/**
 * A measured Android header: long reading titles wrap at the user's size.
 * It matches the native Android bar on the other screens: flat paper, the
 * Material back arrow, the title at the bar's size and a navy text action.
 */
export function AndroidReadingHeader({
  navigation,
  options,
  back,
  windowInsets = false,
}: NativeStackHeaderProps & {
  /**
   * Pad from the window's insets rather than measuring natively. A full-screen
   * dialog in a tab stack (Ask's Options, the filters) has a native safe area
   * view that reads a zero top inset, so its bar drew under the status bar.
   */
  windowInsets?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const largeText = useWindowDimensions().fontScale >= 2;
  const rootItems = !options.headerLeft
    ? options.unstable_headerRightItems?.({ canGoBack: !!back })
    : undefined;
  const closeItem = rootItems?.find(
    (item) => item.type === 'button' && item.label === 'Done',
  );
  const dialog = options.presentation && options.presentation !== 'card';
  const up = !!back && !dialog && !closeItem;
  const right = closeItem
    ? androidHeaderBar(rootItems!.filter((item) => item !== closeItem))
    : options.headerRight?.({
        tintColor: colors.navy,
        backgroundColor: colors.paper,
        canGoBack: !!back,
      });
  const left = options.headerLeft?.({
    tintColor: colors.navy,
    canGoBack: !!back,
  });
  const close = () =>
    closeItem?.type === 'button' ? closeItem.onPress?.() : navigation.goBack();
  const label = up ? 'Navigate up' : 'Close';
  const leading = left ?? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={
        up ? 'Returns to the previous screen' : 'Closes this dialog'
      }
      testID={up ? 'header-back' : 'header-done'}
      onPress={close}
      onLongPress={() => ToastAndroid.show(label, ToastAndroid.SHORT)}
      android_ripple={{ color: colors.navyWash, borderless: true }}
      style={styles.action}
    >
      <Icon
        name={up ? symbols.arrowLeft : symbols.close}
        size={24}
        maxScale={1}
      />
    </Pressable>
  );
  const heading = (
    <Text
      wordSafe
      variant="sectionTitle"
      accessibilityRole="header"
      style={[styles.title, largeText ? { flex: 0 } : null]}
    >
      {typeof options.headerTitle === 'string'
        ? options.headerTitle
        : options.title}
    </Text>
  );
  const content = largeText ? (
    <View style={styles.large}>
      <View style={styles.actions}>
        {leading}
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {heading}
    </View>
  ) : (
    <View style={styles.row}>
      {leading}
      {heading}
      {right}
    </View>
  );
  return windowInsets ? (
    <View
      testID="android-header-window-insets"
      style={[
        styles.bar,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {content}
    </View>
  ) : (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.bar}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.paper },
  large: {
    paddingHorizontal: rhythm.screen,
    paddingVertical: rhythm.tight,
    gap: rhythm.tight,
  },
  actions: { flexDirection: 'row', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    paddingHorizontal: rhythm.screen,
    paddingVertical: rhythm.tight,
  },
  // The bar's title size (androidBar.title) is the sectionTitle role, drawn in
  // the inline title's face; the role sets size and line height so word-safe
  // fitting and font scale work on the size actually drawn.
  title: {
    flex: 1,
    fontFamily: textStyles.inlineTitle.fontFamily,
    fontWeight: textStyles.inlineTitle.fontWeight,
    color: colors.ink,
  },
  action: {
    width: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
