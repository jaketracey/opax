import { Tabs, useSegments } from 'expo-router';
import type { Ref } from 'react';
import { StyleSheet, Text, ToastAndroid, View } from 'react-native';
// The shared surface: keyboard focus draws OPAX's navy ring and turns the
// ripple's grey focus fill off, so a tab shows one ring, not two.
import { Pressable } from '../design/pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHighTextContrast } from '../design/accessibility';
import { AndroidTabIcon } from './AndroidTabIcon';
import { requestSearchTabReset } from '../features/search/tab-reset';
import { lightHighContrast } from '../design/palette';
import {
  colors,
  interfaceFonts as fonts,
  radii,
  useChromeColours,
} from '../design/tokens';

const tabs = [
  ['(today)', 'today', 'Today', 'newspaper'],
  ['(your-mp)', 'your-mp', 'Your MP', 'building.columns'],
  ['(bills)', 'bills', 'Bills', 'doc.text'],
  ['(search)', 'search', 'Search', 'magnifyingglass'],
  ['(ask)', 'ask', 'Ask', 'text.bubble'],
] as const;

// Material's 12sp label stops at 1.4x (the old 11sp at 1.5x, near enough),
// so five tabs keep whole words at 200% text on a 360dp phone; the bar is
// tall enough for the indicator and that label.
const LABEL_SCALE = 1.4;
const BAR_HEIGHT = 80;

/** Full-screen viewer routes own their bottom inset and closing controls. */
export function androidTabsHidden(segments: readonly string[]) {
  return segments.includes('explore') && segments.at(-1) === 'photo';
}

/** Use the stable Android navigator for focus-driven catalogs and Back.
 * The iOS layout keeps its original NativeTabs implementation. Material's
 * navigation bar on the paper: the chosen tab's icon sits in a navy-wash
 * pill (things you press are pills), with one accent, navy, for the choice.
 */
export function AndroidTabs() {
  const insets = useSafeAreaInsets();
  const hidden = androidTabsHidden(useSegments());
  const chrome = useChromeColours();
  // The labels are plain hex, so High contrast text takes the stronger role
  // by hand, as `Text` does everywhere else. (Icons are not text.)
  const inactive = useHighTextContrast()
    ? (lightHighContrast.inkSoft ?? chrome.inactive)
    : chrome.inactive;
  return (
    <Tabs
      initialRouteName="(today)"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: chrome.tint,
        tabBarInactiveTintColor: inactive,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.dividerSubtle,
          height: BAR_HEIGHT + insets.bottom,
          ...(hidden ? { display: 'none' as const } : {}),
        },
        tabBarIconStyle: styles.indicatorFrame,
      }}
    >
      {tabs.map(([name, id, title, symbol]) => (
        <Tabs.Screen
          key={name}
          name={name}
          listeners={{
            // NativeStack already pops a reselected tab to its root. Search
            // also clears query/focus, matching the iOS trigger's listener.
            tabPress: () => {
              if (name === '(search)') requestSearchTabReset();
            },
          }}
          options={{
            title,
            tabBarButtonTestID: `tab-${id}`,
            tabBarAccessibilityLabel: title,
            tabBarButton: (props) => (
              <Pressable
                {...props}
                ref={props.ref as Ref<View>}
                accessible
                accessibilityRole="tab"
                accessibilityState={{
                  selected: !!props.accessibilityState?.selected,
                }}
                android_ripple={{ color: colors.navyWash, borderless: false }}
                onLongPress={(event) => {
                  props.onLongPress?.(event);
                  ToastAndroid.show(title, ToastAndroid.SHORT);
                }}
              />
            ),
            tabBarIcon: ({ focused }) => (
              // The navigator draws both states and fades between them.
              <View style={[styles.indicator, focused ? styles.chosen : null]}>
                <AndroidTabIcon symbol={symbol} focused={focused} />
              </View>
            ),
            tabBarLabel: ({ color }) => (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={LABEL_SCALE}
                style={[styles.label, { color }]}
              >
                {title}
              </Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Replaces the navigator's 31 x 28 icon box.
  indicatorFrame: { width: 56, height: 32 },
  indicator: {
    width: 56,
    height: 32,
    borderRadius: radii.capsule,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  chosen: { backgroundColor: colors.navyWash },
  label: {
    marginTop: 4,
    fontFamily: fonts.sansSemiBold,
    // a11y-ok(raw-font-size): the Material navigation bar label (12 sp);
    // it follows the system font size up to LABEL_SCALE.
    fontSize: 12,
    lineHeight: 16,
  },
});
