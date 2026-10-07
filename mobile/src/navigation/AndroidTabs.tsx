import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../design/icon';
import { chrome, fonts, light } from '../design/tokens';

const tabs = [
  ['(today)', 'today', 'Today', 'newspaper'],
  ['(your-mp)', 'your-mp', 'Your MP', 'building.columns'],
  ['(bills)', 'bills', 'Bills', 'doc.text'],
  ['(search)', 'search', 'Search', 'magnifyingglass'],
  ['(ask)', 'ask', 'Ask', 'text.bubble'],
] as const;

/** Use the stable Android navigator for focus-driven catalogs and Back.
 * The iOS layout keeps its original NativeTabs implementation.
 */
export function AndroidTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      initialRouteName="(today)"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: chrome.tint,
        tabBarInactiveTintColor: chrome.inactive,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: light.paper,
          borderTopColor: light.dividerSubtle,
          height: 64 + insets.bottom,
        },
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
            tabBarIcon: ({ focused }) => (
              <Icon
                name={symbol}
                tone={focused ? 'navy' : 'inkSoft'}
                size={24}
                maxScale={1}
              />
            ),
            tabBarLabel: ({ color }) => (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.5}
                style={{ color, fontFamily: fonts.sansSemiBold, fontSize: 11 }}
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
