import { Tabs } from 'expo-router';
import type { Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHighTextContrast } from '../design/accessibility';
import { Icon } from '../design/icon';
import { lightHighContrast } from '../design/palette';
import { chrome, colors, fonts, radii } from '../design/tokens';

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
const BAR_HEIGHT = 72;

/** Use the stable Android navigator for focus-driven catalogs and Back.
 * The iOS layout keeps its original NativeTabs implementation. Material's
 * navigation bar on the paper: the chosen tab's icon sits in a navy-wash
 * pill (things you press are pills), with one accent, navy, for the choice.
 */
export function AndroidTabs() {
  const insets = useSafeAreaInsets();
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
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.dividerSubtle,
          height: BAR_HEIGHT + insets.bottom,
        },
        tabBarIconStyle: styles.indicatorFrame,
      }}
    >
      {tabs.map(([name, id, title, symbol]) => (
        <Tabs.Screen
          key={name}
          name={name}
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
              />
            ),
            tabBarIcon: ({ focused }) => (
              // The navigator draws both states and fades between them.
              <View style={[styles.indicator, focused ? styles.chosen : null]}>
                <Icon
                  name={symbol}
                  tone={focused ? 'navy' : 'inkSoft'}
                  size={24}
                  maxScale={1}
                />
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
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chosen: { backgroundColor: colors.navyWash },
  label: {
    marginTop: 4,
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
});
