import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import { OpaxIPad } from '../../../modules/opax-ipad';
import { AndroidTabs } from '../../navigation/AndroidTabs';
import { designFlags } from '../../design/flags';
import { colors } from '../../design/tokens';
// Search takes the system role on iOS 26; older iOS and Android keep five tabs.
// The native tab bar keeps system type and offers the Large Content Viewer
// at accessibility text sizes. On iPad the same tabs are UIKit's
// sidebar-adaptable bar: a sidebar (or the top tab bar, which the reader can
// expand into it) on regular width, and this bottom bar in a compact window.
// `sidebarAdaptable` has no effect on iPhone.
export default function TabsLayout() {
  useEffect(() => {
    void OpaxIPad?.configureWordSafeSidebarLabels();
  }, []);
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
      {searchRole ? null : (
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      )}
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
