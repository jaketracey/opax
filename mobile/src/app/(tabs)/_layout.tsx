import { useSegments } from 'expo-router';
import type { NavigationState } from 'expo-router/react-navigation';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { OpaxIPad } from '../../../modules/opax-ipad';
import { isPad } from '../../design/adaptive';
import { designFlags } from '../../design/flags';
import { dispatchKeyCommand } from '../../design/keyboard';
import { colors } from '../../design/tokens';
import { noteSelectedTab } from '../../features/ask/return';
import { requestSearchTabReset } from '../../features/search/tab-reset';
import { AndroidTabs } from '../../navigation/AndroidTabs';
import { setSelectedTab } from '../../navigation/link-tab';
export { RouteErrorBoundary as ErrorBoundary } from '../../navigation/RouteErrorBoundary';
// Search takes the system role on iOS 26; older iOS and Android keep five tabs.
// Deviation: the role gives the detached search item on iOS 26, but on iOS 27
// UIKit draws a .search system item inline in the full bar (it still stands
// apart in the minimised bar). react-native-screens 4.26 builds a UITabBarItem
// system item on viewControllers, and its own scenario documents detached on
// 26 and inline on 27. Detaching it on 27 needs the UITab/UISearchTab API,
// which react-native-screens 4.26 does not expose and NativeTabs has no
// switch for.
// The native tab bar keeps system type and offers the Large Content Viewer
// at accessibility text sizes. On iPad the same tabs are UIKit's
// sidebar-adaptable bar: a sidebar (or the top tab bar, which the reader can
// expand into it) on regular width, and the system tab bar in a compact window.
// Duo keeps the system tab bar on both displays, including a vertical bar.
// Only iPad opts into the adaptable sidebar.
export default function TabsLayout() {
  useEffect(() => {
    if (isPad) void OpaxIPad?.configureWordSafeSidebarLabels();
  }, []);
  // Warm Money map links open in the selected tab (navigation/link-tab.ts).
  // Leaving the Ask tab ends Ask's way back to another tab's page.
  const segments = useSegments() as string[];
  const tab = segments[1];
  useEffect(() => {
    setSelectedTab(tab);
    noteSelectedTab(tab);
  }, [tab]);
  if (Platform.OS === 'android') return <AndroidTabs />;
  const searchRole =
    designFlags.searchTab &&
    Platform.OS === 'ios' &&
    parseInt(String(Platform.Version), 10) >= 26;
  const search = (
    <NativeTabs.Trigger
      name="(search)"
      testID="tab-search"
      role={searchRole ? 'search' : undefined}
      // This trigger also supplies the floating Search button on pushed pages.
      // Own both effects so returning from another tab resets Search as well.
      disablePopToTop
      disableScrollToTop
      listeners={({ navigation, route }) => ({
        tabPress: (event) => {
          if (event.data.isPrevented) return;
          requestSearchTabReset();
          const state: NavigationState = navigation.getState();
          const stack = state.routes.find(
            (item) => item.key === route.key,
          )?.state;
          if (stack?.key && stack.index)
            navigation.dispatch({
              type: 'POP_TO_TOP',
              target: stack.key,
            });
        },
      })}
    >
      <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
    </NativeTabs.Trigger>
  );
  return (
    <NativeTabs
      sidebarAdaptable={isPad}
      minimizeBehavior="onScrollDown"
      tintColor={colors.navy}
    >
      <NativeTabs.Trigger
        name="(today)"
        testID="tab-today"
        disablePopToTop={false}
        disableScrollToTop={false}
      >
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'newspaper', selected: 'newspaper.fill' }}
          md="newspaper"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="(your-mp)"
        testID="tab-your-mp"
        disablePopToTop={false}
        disableScrollToTop={false}
      >
        <NativeTabs.Trigger.Label>Your MP</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="account_balance"
          sf={{
            default: 'building.columns',
            selected: 'building.columns.fill',
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="(bills)"
        testID="tab-bills"
        disablePopToTop={false}
        disableScrollToTop={false}
      >
        <NativeTabs.Trigger.Label>Bills</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'doc.text', selected: 'doc.text.fill' }}
          md="description"
        />
      </NativeTabs.Trigger>
      {searchRole ? null : search}
      <NativeTabs.Trigger
        name="(ask)"
        testID="tab-ask"
        listeners={{
          tabPress: () => {
            if (tab === '(ask)' && segments.at(-1) === 'ask')
              dispatchKeyCommand('ask-reselect');
          },
        }}
      >
        <NativeTabs.Trigger.Label>Ask</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'text.bubble', selected: 'text.bubble.fill' }}
          md="chat_bubble"
        />
      </NativeTabs.Trigger>
      {searchRole ? search : null}
    </NativeTabs>
  );
}
