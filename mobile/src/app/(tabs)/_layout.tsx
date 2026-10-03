import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { colors } from '../../design/tokens';
// A Talk button opening a sheet is reserved in navigation/routes.ts for the later module.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: {
          backgroundColor: colors.raised,
          borderTopColor: colors.dividerDefault,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarButtonTestID: 'tab-today',
          tabBarIcon: ({ color }) => (
            <SymbolView name="newspaper" tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="your-mp"
        options={{
          title: 'Your MP',
          tabBarButtonTestID: 'tab-your-mp',
          tabBarIcon: ({ color }) => (
            <SymbolView name="person.crop.circle" tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: 'Bills',
          tabBarButtonTestID: 'tab-bills',
          tabBarIcon: ({ color }) => (
            <SymbolView name="doc.text" tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarButtonTestID: 'tab-search',
          tabBarIcon: ({ color }) => (
            <SymbolView name="magnifyingglass" tintColor={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
