import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { chrome } from '../../design/tokens';
// Four tabs; Talk and Account are navigation-bar buttons on each root screen
// (decision 2). A fifth slot stays free for Money (navigation/routes.ts).
// The native tab bar keeps system type and offers the Large Content Viewer
// at accessibility text sizes.
export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={chrome.tint}
      iconColor={{ default: chrome.inactive, selected: chrome.tint }}
      labelStyle={{
        default: { color: chrome.inactive },
        selected: { color: chrome.tint },
      }}
    >
      <NativeTabs.Trigger name="(today)" testID="tab-today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'newspaper', selected: 'newspaper.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(your-mp)" testID="tab-your-mp">
        <NativeTabs.Trigger.Label>Your MP</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
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
        />
      </NativeTabs.Trigger>
      {/* The system search role: on iOS 26 it sits apart at the trailing end. */}
      <NativeTabs.Trigger name="(search)" testID="tab-search" role="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
