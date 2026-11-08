import { useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import { OpaxIPad } from '../../../modules/opax-ipad';
import { AndroidTabs } from '../../navigation/AndroidTabs';
import { setSelectedTab } from '../../navigation/link-tab';
import { designFlags } from '../../design/flags';
import { colors } from '../../design/tokens';
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
// expand into it) on regular width, and this bottom bar in a compact window.
// `sidebarAdaptable` has no effect on iPhone.
export default function TabsLayout() {
  useEffect(() => {
    void OpaxIPad?.configureWordSafeSidebarLabels();
  }, []);
  // Warm Money map links open in the selected tab (navigation/link-tab.ts).
  const tab = (useSegments() as string[])[1];
  useEffect(() => setSelectedTab(tab), [tab]);
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
    >
      <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
    </NativeTabs.Trigger>
  );
  return (
    <NativeTabs
      sidebarAdaptable
      minimizeBehavior="onScrollDown"
      tintColor={colors.navy}
    >
      <NativeTabs.Trigger name="(today)" testID="tab-today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'newspaper', selected: 'newspaper.fill' }}
          md="newspaper"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(your-mp)" testID="tab-your-mp">
        <NativeTabs.Trigger.Label>Your MP</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="account_balance"
          sf={{
            default: 'building.columns',
            selected: 'building.columns.fill',
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(bills)" testID="tab-bills">
        <NativeTabs.Trigger.Label>Bills</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'doc.text', selected: 'doc.text.fill' }}
          md="description"
        />
      </NativeTabs.Trigger>
      {searchRole ? null : search}
      <NativeTabs.Trigger name="(ask)" testID="tab-ask">
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
