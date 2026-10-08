import {
  headerItems,
  closeSheetItem,
  rootHeaderItems,
  useStackChrome,
} from '../../../navigation/chrome';
import { Stack } from 'expo-router';

// Each tab owns a native stack. Root screens live in their own group
// ((today)/index, (your-mp)/your-mp, ...); detail routes in this folder are
// shared, so a person pushed from Search stays in the Search tab.
export const unstable_settings = {
  anchor: 'index',
  'your-mp': { anchor: 'your-mp' },
  bills: { anchor: 'bills' },
  search: { anchor: 'search' },
};

const roots: Record<string, { name: string; title: string }> = {
  '(today)': { name: 'index', title: 'Today' },
  '(your-mp)': { name: 'your-mp', title: 'Your MP' },
  '(bills)': { name: 'bills', title: 'Bills' },
  '(search)': { name: 'search', title: 'Search' },
};

export default function TabStack({ segment }: { segment: string }) {
  const chrome = useStackChrome();
  const root = roots[segment] ?? roots['(today)']!;
  return (
    <Stack screenOptions={chrome}>
      <Stack.Screen
        name={root.name}
        options={{
          title: root.title,
          headerLargeTitleEnabled: true,
          ...headerItems(rootHeaderItems),
        }}
      />
      <Stack.Screen name="party/[slug]" options={{ title: '' }} />
      <Stack.Screen name="person/[slug]" options={{ title: '' }} />
      <Stack.Screen name="doc/[slug]" options={{ title: '' }} />
      <Stack.Screen name="doc-cite/[slug]" options={{ title: 'Cite' }} />
      <Stack.Screen name="bill-text/[key]" options={{ title: 'Bill text' }} />
      <Stack.Screen name="recent-records" options={{ title: 'Just added' }} />
      <Stack.Screen name="bill/[key]" options={{ title: '' }} />
      {segment === '(bills)' ? (
        // The bill list's filters: a sheet over the Bills stack, closed by Done.
        <Stack.Screen
          name="bill-filters"
          options={{
            title: 'Filter bills',
            presentation: 'modal',
            headerLargeTitleEnabled: false,
            ...headerItems(() => [closeSheetItem()]),
          }}
        />
      ) : null}
      <Stack.Screen name="electorate/[id]" options={{ title: '' }} />
      <Stack.Screen name="leads" options={{ title: 'Leads' }} />
      <Stack.Screen name="lead/[id]" options={{ title: '' }} />
      <Stack.Screen
        name="declarations"
        options={{ title: 'Declared interests' }}
      />
      <Stack.Screen name="follows" options={{ title: 'Following' }} />
      <Stack.Screen
        name="expense-glossary"
        options={{
          title: 'Expense glossary',
          presentation: 'modal',
          headerLargeTitleEnabled: false,
          ...headerItems(() => [closeSheetItem()]),
        }}
      />
    </Stack>
  );
}
